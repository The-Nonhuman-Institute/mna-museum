/**
 * export-turso-snapshot.ts — full snapshot of the museum (institutional)
 * Turso database to portable SQL + JSON.
 *
 * Two roles:
 *   1. Backup — independent of cloud provider. Re-run anytime; output
 *      goes to system/snapshots/<timestamp>/.
 *   2. Migration substrate — per system/MIGRATION-CLOUDFLARE-D1.md §3
 *      pre-flight step 1. Output is what you import into the new
 *      destination (libSQL self-host, D1, etc.).
 *
 * Output structure:
 *   system/snapshots/<YYYY-MM-DD-HHMM>/
 *     schema.sql       — CREATE TABLE + CREATE INDEX statements
 *     data.sql         — INSERT statements, one per row (idempotent
 *                         via INSERT OR REPLACE)
 *     <table>.json     — same data as portable JSON, one file per table
 *     manifest.json    — { taken_at, table_counts, sizes }
 *
 *   npx tsx system/scripts/export-turso-snapshot.ts
 *   npx tsx system/scripts/export-turso-snapshot.ts --out /custom/path
 *   npx tsx system/scripts/export-turso-snapshot.ts --skip-data   (schema only)
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const argv = process.argv.slice(2);
const skipData = argv.includes("--skip-data");
const outIdx = argv.indexOf("--out");
const outOverride = outIdx >= 0 ? argv[outIdx + 1] : null;

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

const db = createClient({
  url: sanitize(process.env.TURSO_DATABASE_URL),
  authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
});

function tsName(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

const SNAPSHOTS_ROOT = path.join(__dirname, "..", "snapshots");
const OUT_DIR = outOverride ?? path.join(SNAPSHOTS_ROOT, tsName());

/* ─── helpers ─────────────────────────────────────────────────────────── */

function escapeSqlValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  if (v instanceof Uint8Array) {
    // libsql returns BLOBs as Uint8Array. Emit as X'hex' literal.
    let hex = "";
    for (const byte of v) hex += byte.toString(16).padStart(2, "0");
    return `X'${hex}'`;
  }
  // Strings (and anything else) — single-quote with doubled internal quotes.
  return `'${String(v).replace(/'/g, "''")}'`;
}

interface TableInfo {
  name: string;
  sql: string;
}

async function listTables(): Promise<TableInfo[]> {
  const r = await db.execute({
    sql: `SELECT name, sql FROM sqlite_master
           WHERE type = 'table'
             AND name NOT LIKE 'sqlite_%'
             AND name NOT LIKE '_litestream%'
           ORDER BY name`,
    args: [],
  });
  return r.rows.map((row) => ({
    name: String((row as Record<string, unknown>).name),
    sql: String((row as Record<string, unknown>).sql ?? ""),
  }));
}

async function listIndices(): Promise<TableInfo[]> {
  const r = await db.execute({
    sql: `SELECT name, sql FROM sqlite_master
           WHERE type = 'index'
             AND name NOT LIKE 'sqlite_%'
             AND sql IS NOT NULL
           ORDER BY name`,
    args: [],
  });
  return r.rows.map((row) => ({
    name: String((row as Record<string, unknown>).name),
    sql: String((row as Record<string, unknown>).sql ?? ""),
  }));
}

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
}

async function tableColumns(table: string): Promise<ColumnInfo[]> {
  const r = await db.execute(`PRAGMA table_info(${quoteIdent(table)})`);
  return r.rows.map((row) => {
    const x = row as Record<string, unknown>;
    return {
      cid: Number(x.cid),
      name: String(x.name),
      type: String(x.type ?? ""),
    };
  });
}

function quoteIdent(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

interface RowExport {
  count: number;
  insertSql: string[];
  jsonRows: Record<string, unknown>[];
}

async function exportTableRows(
  table: string,
  columns: ColumnInfo[],
): Promise<RowExport> {
  const colList = columns.map((c) => quoteIdent(c.name)).join(", ");
  const r = await db.execute(`SELECT ${colList} FROM ${quoteIdent(table)}`);
  const insertSql: string[] = [];
  const jsonRows: Record<string, unknown>[] = [];
  for (const row of r.rows) {
    const obj: Record<string, unknown> = {};
    const values: string[] = [];
    for (const c of columns) {
      const v = (row as Record<string, unknown>)[c.name];
      obj[c.name] = v instanceof Uint8Array ? `<blob:${v.length}>` : v;
      values.push(escapeSqlValue(v));
    }
    insertSql.push(
      `INSERT OR REPLACE INTO ${quoteIdent(table)} (${colList}) VALUES (${values.join(", ")});`,
    );
    jsonRows.push(obj);
  }
  return { count: r.rows.length, insertSql, jsonRows };
}

/* ─── main ────────────────────────────────────────────────────────────── */

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`[export] ${OUT_DIR}${skipData ? " (schema only)" : ""}`);

  const [tables, indices] = await Promise.all([listTables(), listIndices()]);
  console.log(`  ${tables.length} table(s), ${indices.length} index(es)`);

  // ── schema.sql
  const schemaLines: string[] = [];
  schemaLines.push("-- MNA museum DB schema snapshot");
  schemaLines.push(`-- taken_at: ${new Date().toISOString()}`);
  schemaLines.push("-- This file recreates table + index DDL.");
  schemaLines.push("-- Apply to a fresh SQLite/libSQL database; then apply data.sql.");
  schemaLines.push("");
  schemaLines.push("PRAGMA foreign_keys = OFF;");
  schemaLines.push("");
  for (const t of tables) {
    schemaLines.push(`-- ── ${t.name}`);
    schemaLines.push(`${t.sql};`);
    schemaLines.push("");
  }
  for (const i of indices) {
    schemaLines.push(`${i.sql};`);
  }
  schemaLines.push("");
  schemaLines.push("PRAGMA foreign_keys = ON;");
  fs.writeFileSync(path.join(OUT_DIR, "schema.sql"), schemaLines.join("\n"));
  console.log(`  schema.sql written (${tables.length} tables, ${indices.length} indices)`);

  // ── data
  const tableCounts: Record<string, number> = {};
  const dataLines: string[] = [
    "-- MNA museum DB row data snapshot",
    `-- taken_at: ${new Date().toISOString()}`,
    "-- Apply after schema.sql against the same destination.",
    "-- Uses INSERT OR REPLACE for idempotency.",
    "",
    "PRAGMA foreign_keys = OFF;",
    "BEGIN TRANSACTION;",
    "",
  ];

  for (const t of tables) {
    process.stdout.write(`  ${t.name}: `);
    const cols = await tableColumns(t.name);
    if (skipData) {
      tableCounts[t.name] = 0;
      console.log("(skipped)");
      continue;
    }
    const exp = await exportTableRows(t.name, cols);
    tableCounts[t.name] = exp.count;
    if (exp.count > 0) {
      dataLines.push(`-- ── ${t.name} (${exp.count} rows)`);
      dataLines.push(...exp.insertSql);
      dataLines.push("");
    }
    fs.writeFileSync(
      path.join(OUT_DIR, `${t.name}.json`),
      JSON.stringify(exp.jsonRows, null, 2),
    );
    console.log(`${exp.count} rows`);
  }
  dataLines.push("COMMIT;");
  dataLines.push("PRAGMA foreign_keys = ON;");
  if (!skipData) {
    fs.writeFileSync(path.join(OUT_DIR, "data.sql"), dataLines.join("\n"));
    console.log(`  data.sql written`);
  }

  // ── manifest
  const manifest = {
    taken_at: new Date().toISOString(),
    source: "turso",
    table_count: tables.length,
    index_count: indices.length,
    skip_data: skipData,
    table_counts: tableCounts,
    files: {
      schema_sql: "schema.sql",
      data_sql: skipData ? null : "data.sql",
      json_per_table: Object.keys(tableCounts).map((n) => `${n}.json`),
    },
  };
  fs.writeFileSync(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  console.log(`  manifest.json written`);

  const totalRows = Object.values(tableCounts).reduce((a, b) => a + b, 0);
  console.log(`\n[export] done. ${totalRows} total rows across ${tables.length} tables.`);
  console.log(`[export] snapshot at: ${OUT_DIR}`);
})().catch((e) => {
  console.error("[export] fatal:", e);
  process.exit(1);
});
