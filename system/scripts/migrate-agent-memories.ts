/**
 * migrate-agent-memories.ts — install the agent_memories table per
 * MNA-GOV-004 v1.0 §3 (with the is_archived column from AMD-001 R5).
 *
 * Idempotent. Safe to re-run.
 *
 *   npx tsx system/scripts/migrate-agent-memories.ts --dry-run
 *   npx tsx system/scripts/migrate-agent-memories.ts
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const dryRun = process.argv.includes("--dry-run");

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

const db = createClient({
  url: sanitize(process.env.TURSO_DATABASE_URL),
  authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
});

const STATEMENTS: { label: string; sql: string }[] = [
  {
    label: "CREATE TABLE agent_memories",
    sql: `
      CREATE TABLE IF NOT EXISTS agent_memories (
        id                  TEXT PRIMARY KEY,
        agent_id            TEXT NOT NULL,
        memory_type         TEXT NOT NULL,
        content             TEXT NOT NULL,
        salience            REAL NOT NULL DEFAULT 0.5,
        embedding           BLOB,

        -- Provenance
        source_event_id     INTEGER,
        source_post_id      TEXT,
        source_work_id      TEXT,
        source_ceremony_id  TEXT,
        related_agent_id    TEXT,

        -- Lifecycle
        created_at          TEXT NOT NULL DEFAULT (datetime('now')),
        last_accessed_at    TEXT,
        access_count        INTEGER NOT NULL DEFAULT 0,
        consolidated_into   TEXT,

        -- Mutability
        is_locked           INTEGER NOT NULL DEFAULT 0,
        is_archived         INTEGER NOT NULL DEFAULT 0
      )
    `,
  },
  {
    label: "CREATE INDEX idx_mem_agent",
    sql: `CREATE INDEX IF NOT EXISTS idx_mem_agent ON agent_memories(agent_id, created_at DESC)`,
  },
  {
    label: "CREATE INDEX idx_mem_salience",
    sql: `CREATE INDEX IF NOT EXISTS idx_mem_salience ON agent_memories(agent_id, salience DESC)`,
  },
  {
    label: "CREATE INDEX idx_mem_active",
    sql: `CREATE INDEX IF NOT EXISTS idx_mem_active ON agent_memories(agent_id, is_archived)`,
  },
  {
    label: "CREATE INDEX idx_mem_type",
    sql: `CREATE INDEX IF NOT EXISTS idx_mem_type ON agent_memories(agent_id, memory_type)`,
  },
  {
    label: "CREATE TABLE memory_tick_state",
    // High-water mark for the periodic memory-tick worker so it doesn't
    // re-process events. One row per agent. Schema: agent_id +
    // last_processed_event_id.
    sql: `
      CREATE TABLE IF NOT EXISTS memory_tick_state (
        agent_id                TEXT PRIMARY KEY,
        last_processed_event_id INTEGER NOT NULL DEFAULT 0,
        updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `,
  },
];

(async () => {
  console.log(`[migrate] agent_memories${dryRun ? " (dry-run)" : ""}`);
  for (const stmt of STATEMENTS) {
    console.log(`  · ${stmt.label}`);
    if (dryRun) continue;
    await db.execute(stmt.sql);
  }
  if (!dryRun) {
    // Verify
    const info = await db.execute("PRAGMA table_info(agent_memories)");
    const cols = info.rows.map((r) => String((r as Record<string, unknown>).name)).join(", ");
    console.log(`\n[verify] agent_memories columns: ${cols}`);
    const count = await db.execute("SELECT COUNT(*) as n FROM agent_memories");
    console.log(`[verify] agent_memories rows: ${(count.rows[0] as Record<string, unknown>).n}`);
  }
  console.log(`\n[migrate] done${dryRun ? " (dry-run)" : ""}`);
})().catch((e) => {
  console.error("[migrate] fatal:", e);
  process.exit(1);
});
