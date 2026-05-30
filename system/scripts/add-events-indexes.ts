/**
 * add-events-indexes.ts — index the `events` table.
 *
 * The `events` table (the institution's permanent Record) was created
 * in system/src/db.ts with NO indexes. It is the single most-queried,
 * fastest-growing table in the institution: every stats library
 * (keeper/critic/curator/conservator/installer/registrar/steward),
 * /log, every /agent/[id] page, the digest, and the hourly + 2-hourly
 * ticks query it by agent_id, event_type, work_id, and created_at.
 *
 * With no indexes, every one of those is a FULL TABLE SCAN. SQLite/libSQL
 * bills "rows read" per row examined, so each scan reads the entire table.
 * That is what exhausted the Turso free-tier 500M rows-read/month cap on
 * 2026-05-29. Adding these indexes converts the hot queries from O(n)
 * scans to O(log n) seeks — expected 10–100x reduction in rows read.
 *
 * Building an index reads the table once, so reads must be UNBLOCKED to
 * run this (i.e. on/after the 1st of the month when the cap resets, or
 * after enabling overages). Idempotent — safe to re-run.
 *
 * Index choices (derived from the actual query shapes in the codebase):
 *   - (agent_id, created_at DESC) — `WHERE agent_id = ? ORDER BY created_at`
 *     (9 call sites) + agent joins. The dominant pattern.
 *   - (event_type, created_at DESC) — `WHERE event_type IN (...) ORDER BY
 *     created_at`, `WHERE event_type = ?`, and `GROUP BY event_type`.
 *   - (created_at) — global `ORDER BY created_at`, range filters
 *     (`created_at >= datetime('now','-N days')`), and MIN/MAX scans.
 *   - (work_id) — work-page provenance lookups + accession-notice checks.
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

const db = createClient({
  url: sanitize(process.env.TURSO_DATABASE_URL),
  authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
});

const INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_events_agent_created ON events(agent_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_events_type_created ON events(event_type, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_events_work ON events(work_id)`,
];

(async () => {
  const before = await db.execute("SELECT COUNT(*) as n FROM events");
  console.log(`[migrate] events row count: ${before.rows[0].n}`);

  for (const sql of INDEXES) {
    await db.execute(sql);
    console.log(`[migrate] ${sql.replace("CREATE INDEX IF NOT EXISTS ", "✓ ").replace(/ ON .*/, "")}`);
  }

  console.log("[migrate] events table indexed. Hot queries are now seeks, not full scans.");
})().catch((e) => {
  console.error("[migrate] error:", e);
  process.exit(1);
});
