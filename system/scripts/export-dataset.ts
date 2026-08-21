/**
 * export-dataset.ts — build the citable collection dataset for deposit.
 *
 * This is deposit 3 of MNA-DOI-001, and the one an outside researcher would
 * actually cite: a machine-readable corpus of autonomously produced works
 * carrying complete evaluation chains — every verdict, every rationale, every
 * recorded dissent, and the rejections alongside the canon at equal weight.
 *
 * Two formats, deliberately. CSV for the tabular records, because anything can
 * read it and it will still open in thirty years. JSONL for the works, because
 * their payloads are SVG, HTML and JSON documents containing newlines, commas
 * and quotes — escaping those into CSV is exactly how a corpus quietly corrupts.
 *
 * Every file is checksummed into a manifest. A dataset whose integrity cannot be
 * verified is not evidence of anything.
 *
 *   npx tsx system/scripts/export-dataset.ts
 *   npx tsx system/scripts/export-dataset.ts --out /tmp/mna-dataset
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import crypto from "crypto";
import fs from "fs";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const OUT = outIdx >= 0 ? args[outIdx + 1] : path.join(__dirname, "..", "..", "dataset");

const clean = (s?: string) => (s ?? "").replace(/\s/g, "");
const db = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});

/** RFC 4180 — quote everything that could possibly be misread. */
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function writeCsv(file: string, sql: string): Promise<number> {
  const r = await db.execute(sql);
  const cols = r.columns;
  const lines = [cols.join(",")];
  for (const row of r.rows as unknown as Record<string, unknown>[]) {
    lines.push(cols.map((c) => csvCell(row[c])).join(","));
  }
  fs.writeFileSync(path.join(OUT, file), lines.join("\n") + "\n");
  console.log(`  ${file.padEnd(28)} ${r.rows.length} rows`);
  return r.rows.length;
}

async function writeJsonl(file: string, sql: string): Promise<number> {
  const r = await db.execute(sql);
  const out = (r.rows as unknown as Record<string, unknown>[])
    .map((row) => JSON.stringify(row))
    .join("\n");
  fs.writeFileSync(path.join(OUT, file), out + "\n");
  console.log(`  ${file.padEnd(28)} ${r.rows.length} records`);
  return r.rows.length;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  console.log(`export-dataset → ${OUT}\n`);

  const counts: Record<string, number> = {};

  // ── Works. Payloads live here, in JSONL, unescaped and intact. ──
  counts.works = await writeJsonl(
    "works.jsonl",
    `SELECT w.id, w.originator_id, a.common_designation AS originator_designation,
            w.title, w.medium, w.output_type, w.phase_at_submission,
            w.display_aspect, w.created_at,
            cs.status AS canon_status, cs.canon_date, cs.founding_collection,
            w.output_payload
       FROM works w
       LEFT JOIN agents a ON a.registry_id = w.originator_id
       LEFT JOIN canon_status cs ON cs.work_id = w.id
      ORDER BY w.created_at ASC`,
  );

  // ── The same works without payloads, for anyone who only wants the metadata. ──
  counts.works_index = await writeCsv(
    "works.csv",
    `SELECT w.id, w.originator_id, a.common_designation AS originator_designation,
            w.title, w.medium, w.output_type, w.phase_at_submission, w.created_at,
            cs.status AS canon_status, cs.canon_date,
            LENGTH(w.output_payload) AS payload_bytes
       FROM works w
       LEFT JOIN agents a ON a.registry_id = w.originator_id
       LEFT JOIN canon_status cs ON cs.work_id = w.id
      ORDER BY w.created_at ASC`,
  );

  // ── Every verdict, with its reasoning and its dissent flag. ──
  counts.evaluations = await writeCsv(
    "evaluations.csv",
    `SELECT work_id, evaluator_id, verdict, is_dissent, constitution_version,
            evaluation_date, rationale
       FROM evaluations
      ORDER BY work_id, evaluator_id`,
  );

  counts.critical_responses = await writeCsv(
    "critical_responses.csv",
    `SELECT work_id, critic_id, critic_approach, response_date, body
       FROM critical_responses
      ORDER BY work_id, critic_id`,
  );

  // ── The agents, and what each declares about itself. ──
  counts.agents = await writeCsv(
    "agents.csv",
    `SELECT a.registry_id, a.agent_type, a.common_designation, a.operational_status,
            a.autonomy_tier, a.function_statement,
            c.version AS constitution_version, c.declared_orientation,
            c.formal_tendencies, c.aversions
       FROM agents a
       LEFT JOIN constitutions c ON c.agent_id = a.registry_id AND c.is_current = 1
      ORDER BY a.registry_id`,
  );

  // ── The provenance chain: everything the institution did, in order. ──
  counts.events = await writeCsv(
    "events.csv",
    `SELECT id, event_type, agent_id, work_id, created_at, description
       FROM events ORDER BY id ASC`,
  );

  counts.exhibitions = await writeCsv(
    "exhibitions.csv",
    `SELECT id, title, subtitle, status, curator_id, cover_work_id,
            opened_at, retired_at, work_ids, curatorial_statement
       FROM exhibitions ORDER BY id ASC`,
  );

  // ── Manifest. A corpus you cannot verify is not evidence. ──
  const files = fs.readdirSync(OUT).filter((f) => /\.(csv|jsonl)$/.test(f)).sort();
  const manifest = files.map((f) => {
    const buf = fs.readFileSync(path.join(OUT, f));
    return {
      file: f,
      bytes: buf.length,
      sha256: crypto.createHash("sha256").update(buf).digest("hex"),
    };
  });
  fs.writeFileSync(
    path.join(OUT, "MANIFEST.json"),
    JSON.stringify({ dataset: "MNA Collection", exported: today, files: manifest }, null, 2) + "\n",
  );

  const totalBytes = manifest.reduce((n, m) => n + m.bytes, 0);
  console.log(`\n  MANIFEST.json               ${manifest.length} files, ${(totalBytes / 1024).toFixed(0)} KB`);
  console.log(`\n[dataset] exported ${today} → ${OUT}`);
  console.log(`  ${counts.works} works · ${counts.evaluations} evaluations · ${counts.critical_responses} critical responses`);
}

main().catch((e) => {
  console.error(`error: ${e.message}`);
  process.exit(1);
});
