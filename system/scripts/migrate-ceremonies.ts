/**
 * migrate-ceremonies.ts — create the `ceremonies` table.
 *
 * Ceremonies are scheduled institutional moments: solo openings,
 * group exhibition openings, founding anniversaries, network agent
 * admissions, etc. Distinct from the `events` table (which is the
 * permanent historical record) — `ceremonies` is the calendar of
 * upcoming and recently-completed moments the institution gathers
 * around.
 *
 * Idempotent — safe to re-run.
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

(async () => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS ceremonies (
      id TEXT PRIMARY KEY,
      ceremony_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      constellation TEXT,
      scheduled_at TEXT NOT NULL,
      duration_minutes INTEGER DEFAULT 60,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled',
      work_id TEXT,
      originator_id TEXT,
      metadata TEXT
    )
  `);
  console.log("[migrate] ceremonies table created (or already exists)");

  await db.execute(`CREATE INDEX IF NOT EXISTS ceremonies_scheduled_idx ON ceremonies(scheduled_at)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS ceremonies_status_idx ON ceremonies(status)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS ceremonies_type_idx ON ceremonies(ceremony_type)`);
  console.log("[migrate] indexes created");

  const r = await db.execute("SELECT COUNT(*) as n FROM ceremonies");
  console.log(`[migrate] current row count: ${r.rows[0].n}`);
})().catch((e) => {
  console.error("[migrate] error:", e);
  process.exit(1);
});
