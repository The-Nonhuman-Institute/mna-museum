import "server-only";
import { createClient, type Client } from "@libsql/client";

/**
 * MNA Steward Terminal — terminal-native state (operator journal).
 *
 * The terminal keeps its own remote database, separate from the
 * institutional Turso DB the public site and system scripts use. This
 * database holds operator state only:
 *
 *   - events         — terminal-native activity stream (priority
 *                      alerts, approvals granted, hardware warnings,
 *                      keeper session summaries). Institutional events
 *                      are read directly from the institutional Turso
 *                      via lib/institutional-turso.ts and merged at
 *                      the application layer.
 *   - keeper_sessions / keeper_messages — chat with the Keeper.
 *   - outreach_contacts — PR pipeline the steward reviews.
 *   - approvals — steward approval gates for agents that require it.
 *   - hardware_snapshots — rolling host-health samples.
 *   - agent_activity — rolling log of what each agent is doing now.
 *
 * Runs on libSQL (Turso) instead of better-sqlite3 so the terminal can
 * deploy to Vercel (ephemeral filesystem) without losing operator
 * state. The schema is identical to the previous local SQLite version
 * — only the client changed. Every call that used to be synchronous
 * (.prepare().run(), .prepare().all()) is now async.
 *
 * Credentials come from two terminal-specific env vars:
 *   TERMINAL_TURSO_DATABASE_URL
 *   TERMINAL_TURSO_AUTH_TOKEN
 *
 * These are distinct from TURSO_DATABASE_URL / TURSO_AUTH_TOKEN which
 * point at the institutional database. Do not confuse the two.
 */

let _client: Client | null = null;
let _schemaReady: Promise<void> | null = null;

export function getDb(): Client {
  if (_client) return _client;
  // Sanitize both values. libsql URLs and JWT auth tokens contain no
  // whitespace at all, so any space/tab/newline/control character
  // anywhere in the string is garbage injected by the env var UI and
  // must be stripped — trim() is not enough because the corruption
  // can happen mid-token. Dirty tokens produce the cryptic "Bearer
  // ... is not a legal HTTP header value" error from the libSQL
  // client when it builds the Authorization header.
  const url = sanitizeEnvValue(process.env.TERMINAL_TURSO_DATABASE_URL);
  const authToken = sanitizeEnvValue(process.env.TERMINAL_TURSO_AUTH_TOKEN);
  if (!url || !authToken) {
    throw new Error(
      "TERMINAL_TURSO_DATABASE_URL / TERMINAL_TURSO_AUTH_TOKEN are not set. " +
        "Create a Turso database for terminal state (`turso db create mna-terminal`) " +
        "and set these values in terminal/.env (local) or Vercel env vars (prod)."
    );
  }
  _client = createClient({ url, authToken });
  return _client;
}

/**
 * Strip any whitespace or ASCII control character from an env var
 * value. Shared with lib/institutional-turso.ts — kept local here to
 * avoid a tiny utility module for one function.
 */
function sanitizeEnvValue(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  return raw.replace(/[\s\u0000-\u001F\u007F]/g, "");
}

/**
 * Ensure the schema exists. Idempotent — safe to call on every
 * request, but cached at module level so the round-trips only happen
 * once per process. Call this from any reader/writer that touches the
 * tables before issuing its own query.
 */
export function ensureSchema(): Promise<void> {
  if (_schemaReady) return _schemaReady;
  _schemaReady = (async () => {
    const db = getDb();
    // libSQL supports batch of schema statements; run them
    // individually so a failure in one table surfaces clearly.
    const statements = [
      // ── events ──────────────────────────────────────────────────
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

      // ── keeper_sessions & keeper_messages ───────────────────────
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

      // ── outreach_contacts ───────────────────────────────────────
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

      // ── approvals ───────────────────────────────────────────────
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

      // ── hardware_snapshots ──────────────────────────────────────
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

      // ── agent_activity ──────────────────────────────────────────
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
  })();
  return _schemaReady;
}
