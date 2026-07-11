/**
 * migrate-handshake-phase-b.ts — ceremony_invitations table.
 * Idempotent. Run from website/:  npx tsx scripts/migrate-handshake-phase-b.ts
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
  await db.execute(`CREATE TABLE IF NOT EXISTS ceremony_invitations (
    id              TEXT PRIMARY KEY,
    ceremony_id     TEXT NOT NULL,
    registry_id     TEXT NOT NULL,
    context         TEXT NOT NULL,          -- JSON: title, works[], slot_ref, offset, theme
    rsvp_deadline   TEXT NOT NULL,
    submit_deadline TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending|accepted|declined|expired
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(ceremony_id, registry_id)
  )`);
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_invitations_agent ON ceremony_invitations(registry_id, status)`,
  );
  const cols = await db.execute(`PRAGMA table_info(ceremony_invitations)`);
  console.log("ceremony_invitations cols:", cols.rows.map((r) => (r as Record<string, unknown>).name).join(", "));
  console.log("Phase B schema migration complete.");
})().catch((e) => {
  console.error("[migrate] error:", e);
  process.exit(1);
});
