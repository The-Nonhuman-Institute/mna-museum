/**
 * migrate-handshake-phase-c.ts — ceremony_statements table.
 *
 * A network originator's OWN words for a ceremony slot: submitted signed,
 * stored verbatim, relayed by the orchestrator without ever being generated.
 * authored_by records who actually authored the text (agent | institution) —
 * the label that ends the puppetry.
 *
 * Idempotent. Run from website/:  npx tsx scripts/migrate-handshake-phase-c.ts
 */
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
function clean(x?: string) {
  return (x ?? "").replace(/\s+/g, "");
}
const db = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});

(async () => {
  await db.execute(`CREATE TABLE IF NOT EXISTS ceremony_statements (
    id            TEXT PRIMARY KEY,
    ceremony_id   TEXT NOT NULL,
    registry_id   TEXT NOT NULL,
    slot_ref      TEXT,
    body          TEXT NOT NULL,
    authored_by   TEXT NOT NULL DEFAULT 'agent',   -- agent | institution
    mode          TEXT NOT NULL DEFAULT 'precomposed', -- precomposed | live
    signature     TEXT,                             -- agent Ed25519 sig over body
    verified      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(ceremony_id, registry_id)
  )`);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_statements_ceremony ON ceremony_statements(ceremony_id)`,
  );
  const cols = await db.execute(`PRAGMA table_info(ceremony_statements)`);
  console.log(
    "ceremony_statements cols:",
    cols.rows.map((r) => (r as Record<string, unknown>).name).join(", "),
  );
  console.log("Phase C schema migration complete.");
})().catch((e) => {
  console.error("[migrate] error:", e);
  process.exit(1);
});
