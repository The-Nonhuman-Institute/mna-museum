/**
 * export-snapshot.ts — clone the live institution database into a single,
 * self-contained, read-only SQLite file the website bundles and serves from.
 *
 * Why: the public site's ISR re-fetching from Turso was the entire source of
 * the recurring free-tier rows-read blackouts. By rendering public content
 * from a committed snapshot instead, public Turso reads drop to ~zero; only
 * the agent crons still touch Turso (bounded, well under the cap). The site
 * also becomes outage-proof — it serves from the snapshot even if Turso is
 * fully blocked.
 *
 * Output: website/data/snapshot.db  (committed; deploy-website.yml redeploys
 * on website/** changes, so committing a fresh snapshot ships fresh data).
 *
 * Safety: builds into a temp file and atomically renames on success only — a
 * failed or quota-blocked run leaves the last good committed snapshot intact.
 *
 * Source: live Turso by default. Set MNA_SNAPSHOT_SOURCE to a libSQL url
 * (e.g. file:../system/data/mna.db) to clone from somewhere else — used to
 * test the clone logic locally while Turso reads are blocked.
 *
 * Idempotent — overwrites the output each successful run.
 */

import { createClient, type Client } from "@libsql/client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const s = (x?: string) => (x ?? "").replace(/\s+/g, "");

const OUT_DIR = path.join(__dirname, "..", "..", "website", "data");
const OUT_FILE = path.join(OUT_DIR, "snapshot.db");
const TMP_FILE = `${OUT_FILE}.building`;

function rmIfExists(...files: string[]) {
  for (const f of files) if (fs.existsSync(f)) fs.rmSync(f);
}

function openSource(): Client {
  const override = s(process.env.MNA_SNAPSHOT_SOURCE);
  if (override) {
    console.log(`[snapshot] source: ${override}`);
    return createClient({ url: override });
  }
  const url = s(process.env.TURSO_DATABASE_URL);
  const authToken = s(process.env.TURSO_AUTH_TOKEN);
  if (!url || !authToken) {
    throw new Error("No source: set TURSO_DATABASE_URL/TURSO_AUTH_TOKEN or MNA_SNAPSHOT_SOURCE.");
  }
  console.log("[snapshot] source: Turso (live)");
  return createClient({ url, authToken });
}

async function main() {
  const src = openSource();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  // Build into a temp file; the live snapshot.db is only replaced on success.
  rmIfExists(TMP_FILE, `${TMP_FILE}-wal`, `${TMP_FILE}-shm`);
  const dst = createClient({ url: `file:${TMP_FILE}` });

  // Rollback journal (not WAL) → the snapshot is a single self-contained file
  // that opens cleanly when copied to a read/writable /tmp on Vercel.
  await dst.execute("PRAGMA journal_mode=DELETE");
  // Bulk clone: copy rows verbatim without FK enforcement (we insert table by
  // table, so referenced rows may not exist yet — the source is already
  // consistent). The schema's FK definitions are preserved regardless.
  await dst.execute("PRAGMA foreign_keys=OFF");

  // 1. Schema — tables first, then indexes/triggers. Skip SQLite internals.
  //    (This first read against the source is where a BLOCKED quota error
  //    surfaces — before we've touched the live snapshot.db.)
  const schema = await src.execute(
    `SELECT type, name, sql FROM sqlite_master
      WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
      ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name`
  );
  const tables: string[] = [];
  for (const row of schema.rows as unknown as Array<{ type: string; name: string; sql: string }>) {
    await dst.execute(row.sql);
    if (row.type === "table") tables.push(row.name);
  }
  console.log(`[snapshot] schema: ${tables.length} tables + indexes created`);

  // 2. Data — copy every table, chunked.
  let totalRows = 0;
  for (const t of tables) {
    const data = await src.execute(`SELECT * FROM "${t}"`);
    if (data.rows.length === 0) {
      console.log(`  ${t}: 0`);
      continue;
    }
    const cols = data.columns;
    const colList = cols.map((c) => `"${c}"`).join(",");
    const placeholders = cols.map(() => "?").join(",");
    const insertSql = `INSERT INTO "${t}" (${colList}) VALUES (${placeholders})`;

    const CHUNK = 200;
    for (let i = 0; i < data.rows.length; i += CHUNK) {
      const chunk = data.rows.slice(i, i + CHUNK);
      await dst.batch(
        chunk.map((r) => ({
          sql: insertSql,
          args: cols.map((c) => (r as Record<string, unknown>)[c] as never),
        })),
        "write"
      );
    }
    totalRows += data.rows.length;
    console.log(`  ${t}: ${data.rows.length}`);
  }

  dst.close();
  // Atomic swap: only now does the committed snapshot change.
  rmIfExists(OUT_FILE, `${OUT_FILE}-wal`, `${OUT_FILE}-shm`);
  fs.renameSync(TMP_FILE, OUT_FILE);

  const sizeKB = Math.round(fs.statSync(OUT_FILE).size / 1024);
  console.log(`\n[snapshot] done — ${tables.length} tables, ${totalRows} rows → ${OUT_FILE} (${sizeKB} KB)`);
}

main().catch((e: any) => {
  rmIfExists(TMP_FILE, `${TMP_FILE}-wal`, `${TMP_FILE}-shm`); // never leave a partial build
  // If Turso reads are quota-blocked, we simply can't refresh the snapshot
  // this run — skip cleanly (the last good committed snapshot stays in place)
  // rather than failing the workflow. Reads reset on the 1st of the month.
  const blocked =
    e?.code === "BLOCKED" ||
    /reads are blocked|read operations are forbidden/i.test(e?.message ?? "");
  if (blocked) {
    console.warn("[snapshot] Turso reads quota-blocked — keeping last snapshot, skipping.");
    process.exit(0);
  }
  console.error("[snapshot] error:", e);
  process.exit(1);
});
