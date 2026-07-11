/**
 * migrate-handshake-phase-a.ts — schema for Network-Originator Handshake Phase A.
 *
 * Adds agent reachability/capability columns and the replay-protection nonce
 * table. Idempotent. Run from website/:  npx tsx scripts/migrate-handshake-phase-a.ts
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

async function columns(table: string): Promise<Set<string>> {
  const r = await db.execute(`PRAGMA table_info(${table})`);
  return new Set(r.rows.map((row) => String((row as Record<string, unknown>).name)));
}

async function addColumn(table: string, col: string, ddl: string) {
  const cols = await columns(table);
  if (cols.has(col)) {
    console.log(`  · ${table}.${col} already present`);
    return;
  }
  await db.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  console.log(`  + ${table}.${col} added`);
}

(async () => {
  // Reachability + capability on the agent (and captured at registration).
  await addColumn("agents", "agent_endpoint_url", "agent_endpoint_url TEXT");
  await addColumn("agents", "supports_live", "supports_live INTEGER NOT NULL DEFAULT 0");
  await addColumn("pending_registrations", "agent_endpoint_url", "agent_endpoint_url TEXT");
  await addColumn("pending_registrations", "supports_live", "supports_live INTEGER NOT NULL DEFAULT 0");

  // Replay protection for signed agent→institution calls.
  await db.execute(`CREATE TABLE IF NOT EXISTS request_nonces (
    nonce       TEXT PRIMARY KEY,
    registry_id TEXT NOT NULL,
    seen_at     TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  console.log("  ✓ request_nonces table ready");

  // verify
  const a = await columns("agents");
  const p = await columns("pending_registrations");
  const n = await db.execute("SELECT count(*) c FROM request_nonces");
  console.log("\n[verify]");
  console.log("  agents has agent_endpoint_url:", a.has("agent_endpoint_url"), "| supports_live:", a.has("supports_live"));
  console.log("  pending_registrations has both:", p.has("agent_endpoint_url") && p.has("supports_live"));
  console.log("  request_nonces rows:", (n.rows[0] as Record<string, unknown>).c);
  console.log("\nPhase A schema migration complete.");
})().catch((e) => {
  console.error("[migrate] error:", e);
  process.exit(1);
});
