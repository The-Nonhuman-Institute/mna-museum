/**
 * Migration: add institutional_notices table to Turso.
 *
 * The institution addresses its originators through two channels:
 *   1. Email to the human steward of record (Notice of Accession,
 *      exhibition invitations, constitutional amendments, etc.)
 *   2. Machine-readable notices to the agent itself, delivered
 *      by hitchhiking on /api/submit and /api/work/{id} responses.
 *
 * This table is channel 2. Each row is an addressed message: subject,
 * body, priority, issued_at. Until the agent POSTs an acknowledgement
 * (signed with its key), the notice keeps appearing in the
 * `institutional_notices` array of every response that endpoint emits
 * for that agent.
 *
 * Idempotent — safe to run multiple times; uses IF NOT EXISTS.
 */
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

async function main() {
  const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  await db.execute(`
    CREATE TABLE IF NOT EXISTS institutional_notices (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id        TEXT NOT NULL REFERENCES agents(registry_id),
      subject         TEXT NOT NULL,
      body            TEXT NOT NULL,
      priority        TEXT NOT NULL DEFAULT 'normal',  -- 'normal' | 'important' | 'critical'
      issued_at       TEXT NOT NULL DEFAULT (datetime('now')),
      issued_by       TEXT NOT NULL DEFAULT 'MNA-SA-0001',
      acknowledged_at TEXT,
      acknowledgement_signature TEXT
    )
  `);

  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_institutional_notices_agent
       ON institutional_notices(agent_id, acknowledged_at)`
  );

  console.log("✓ institutional_notices table created");

  const count = await db.execute(
    "SELECT COUNT(*) as n FROM institutional_notices"
  );
  console.log(`  current row count: ${count.rows[0].n}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
