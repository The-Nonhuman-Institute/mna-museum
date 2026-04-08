import "server-only";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

/**
 * MNA Steward Terminal — local SQLite database.
 *
 * The terminal keeps its own local state (institutional event stream,
 * Keeper conversation history, outreach contacts, approval gates,
 * hardware snapshots). This is distinct from the institution's main
 * record in Turso, which holds canonical data about works, agents,
 * evaluations, and curatorial decisions.
 *
 * The terminal reads FROM Turso for authoritative institutional state
 * (see lib/turso.ts) and writes TO this local SQLite for terminal-
 * specific operational state. The two databases are not joined at the
 * query level — the terminal composes views from both at the application
 * layer.
 *
 * Database file lives at terminal/data/terminal.db. The data directory
 * is gitignored — every operator has their own local DB.
 *
 * Schema is created on first run via `ensureSchema()`. Migrations are
 * additive and idempotent; the terminal can be restarted without data
 * loss.
 */

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, "terminal.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  ensureSchema(db);
  _db = db;
  return db;
}

function ensureSchema(db: Database.Database): void {
  db.exec(`
    -- ── events ──────────────────────────────────────────────────────────
    -- Institutional activity stream as seen from the terminal. A unified
    -- log that combines events read from Turso (canon decisions, critical
    -- responses, curatorial decisions) with terminal-native events
    -- (Keeper chat opened, approval granted, hardware alert).
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      agent_id TEXT,
      work_id TEXT,
      priority TEXT NOT NULL DEFAULT 'normal',  -- 'normal' | 'attention' | 'error'
      description TEXT,
      metadata TEXT,                             -- JSON
      source TEXT NOT NULL DEFAULT 'terminal',   -- 'terminal' | 'turso' | 'system'
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_events_priority ON events(priority);

    -- ── keeper_sessions & keeper_messages ───────────────────────────────
    -- Chat with the Keeper. Sessions group related messages; messages
    -- hold the full role/content history so the Keeper can replay its
    -- own context on a new request.
    CREATE TABLE IF NOT EXISTS keeper_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT,
      title TEXT
    );

    CREATE TABLE IF NOT EXISTS keeper_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES keeper_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,         -- 'user' | 'assistant' | 'system'
      content TEXT NOT NULL,
      token_count INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_keeper_messages_session ON keeper_messages(session_id);

    -- ── outreach_contacts ───────────────────────────────────────────────
    -- People the Ambassador has contacted or plans to contact. Steward
    -- reviews incoming replies and approves outgoing drafts.
    CREATE TABLE IF NOT EXISTS outreach_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      organization TEXT,
      email TEXT,
      role TEXT,                  -- 'journalist' | 'curator' | 'researcher' | ...
      status TEXT NOT NULL DEFAULT 'sent',  -- 'sent' | 'replied' | 'no_response' | 'archived'
      last_contact_at TEXT,
      last_reply_at TEXT,
      notes TEXT,                 -- steward notes
      briefing TEXT,              -- Ambassador-authored briefing
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_outreach_status ON outreach_contacts(status);

    -- ── approvals ────────────────────────────────────────────────────────
    -- Steward approval gates. Agents that require explicit approval
    -- (exhibition concept proposals, outreach drafts) write a pending
    -- row here and wait for the steward to decide.
    CREATE TABLE IF NOT EXISTS approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_type TEXT NOT NULL,  -- 'exhibition_concept' | 'outreach_draft' | ...
      subject_id TEXT NOT NULL,
      requested_by TEXT NOT NULL,  -- agent registry_id
      summary TEXT NOT NULL,
      payload TEXT,                -- JSON: the thing being approved
      status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
      requested_at TEXT NOT NULL DEFAULT (datetime('now')),
      decided_at TEXT,
      decided_by TEXT DEFAULT 'steward'
    );
    CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);

    -- ── hardware_snapshots ──────────────────────────────────────────────
    -- Rolling snapshot of Mac hardware health. Populated by a periodic
    -- job that reads node:os and system commands. Used by the SYSTEM tab
    -- and by the priority-alert system (memory pressure above threshold).
    CREATE TABLE IF NOT EXISTS hardware_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cpu_load REAL,
      memory_used_gb REAL,
      memory_total_gb REAL,
      disk_used_gb REAL,
      disk_total_gb REAL,
      network_mbps REAL,
      temperature_c REAL,
      captured_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_hardware_captured_at ON hardware_snapshots(captured_at DESC);

    -- ── agent_activity ───────────────────────────────────────────────────
    -- Rolling log of what each agent is doing right now. Terminal SYSTEM
    -- tab shows the roster; each row here becomes "X is running" with a
    -- duration and status.
    CREATE TABLE IF NOT EXISTS agent_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      activity TEXT NOT NULL,     -- 'evaluating' | 'composing' | 'idle' | ...
      status TEXT NOT NULL DEFAULT 'running',  -- 'running' | 'completed' | 'failed'
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_activity_agent ON agent_activity(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_activity_status ON agent_activity(status);
  `);
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
