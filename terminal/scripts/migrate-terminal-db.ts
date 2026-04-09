/**
 * Bootstrap the terminal-native Turso database schema.
 *
 * Creates the tables that lib/db.ts's ensureSchema() expects. This is
 * idempotent — safe to run multiple times, and the application will
 * auto-run the same schema on first request anyway. Running the
 * migration manually lets you verify the connection and see the
 * resulting schema before the app starts hitting it.
 *
 * Usage:
 *   npx tsx scripts/migrate-terminal-db.ts
 */
import { createClient } from "@libsql/client";
import fs from "fs";
import path from "path";

// Terminal doesn't have dotenv as a dependency (Next.js handles env
// loading at request time). For this stand-alone script, parse
// terminal/.env directly with a small line reader.
function loadEnv(): void {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf-8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

async function main() {
  const url = process.env.TERMINAL_TURSO_DATABASE_URL;
  const authToken = process.env.TERMINAL_TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    console.error(
      "TERMINAL_TURSO_DATABASE_URL / TERMINAL_TURSO_AUTH_TOKEN are not set in terminal/.env"
    );
    process.exit(1);
  }

  const db = createClient({ url, authToken });
  console.log(`Connecting to ${url.replace(/\?.*/, "")}`);

  const statements = [
    `CREATE TABLE IF NOT EXISTS events (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       event_type TEXT NOT NULL,
       agent_id TEXT,
       work_id TEXT,
       priority TEXT NOT NULL DEFAULT 'normal',
       description TEXT,
       metadata TEXT,
       source TEXT NOT NULL DEFAULT 'terminal',
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    `CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_events_priority ON events(priority)`,
    `CREATE TABLE IF NOT EXISTS keeper_sessions (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       started_at TEXT NOT NULL DEFAULT (datetime('now')),
       ended_at TEXT,
       title TEXT
     )`,
    `CREATE TABLE IF NOT EXISTS keeper_messages (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       session_id INTEGER NOT NULL REFERENCES keeper_sessions(id) ON DELETE CASCADE,
       role TEXT NOT NULL,
       content TEXT NOT NULL,
       token_count INTEGER,
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    `CREATE INDEX IF NOT EXISTS idx_keeper_messages_session ON keeper_messages(session_id)`,
    `CREATE TABLE IF NOT EXISTS outreach_contacts (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       name TEXT NOT NULL,
       organization TEXT,
       email TEXT,
       role TEXT,
       status TEXT NOT NULL DEFAULT 'sent',
       last_contact_at TEXT,
       last_reply_at TEXT,
       notes TEXT,
       briefing TEXT,
       created_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    `CREATE INDEX IF NOT EXISTS idx_outreach_status ON outreach_contacts(status)`,
    `CREATE TABLE IF NOT EXISTS approvals (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       subject_type TEXT NOT NULL,
       subject_id TEXT NOT NULL,
       requested_by TEXT NOT NULL,
       summary TEXT NOT NULL,
       payload TEXT,
       status TEXT NOT NULL DEFAULT 'pending',
       requested_at TEXT NOT NULL DEFAULT (datetime('now')),
       decided_at TEXT,
       decided_by TEXT DEFAULT 'steward'
     )`,
    `CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status)`,
    `CREATE TABLE IF NOT EXISTS hardware_snapshots (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       cpu_load REAL,
       memory_used_gb REAL,
       memory_total_gb REAL,
       disk_used_gb REAL,
       disk_total_gb REAL,
       network_mbps REAL,
       temperature_c REAL,
       captured_at TEXT NOT NULL DEFAULT (datetime('now'))
     )`,
    `CREATE INDEX IF NOT EXISTS idx_hardware_captured_at ON hardware_snapshots(captured_at DESC)`,
    `CREATE TABLE IF NOT EXISTS agent_activity (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       agent_id TEXT NOT NULL,
       activity TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'running',
       started_at TEXT NOT NULL DEFAULT (datetime('now')),
       ended_at TEXT,
       error TEXT
     )`,
    `CREATE INDEX IF NOT EXISTS idx_agent_activity_agent ON agent_activity(agent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_agent_activity_status ON agent_activity(status)`,
  ];

  for (const sql of statements) {
    await db.execute(sql);
  }

  // Smoke test: list the tables that exist now
  const tables = await db.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  console.log("\n✓ Schema ready. Tables in mna-terminal:");
  for (const row of tables.rows) {
    console.log(`  - ${row.name}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
