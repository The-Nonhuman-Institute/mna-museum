/**
 * migrate-memory-edges.ts — install the agent_memory_edges table per
 * MNA-GOV-004 AMD-002 v1.0 §A1.
 *
 * Holds weighted associative edges between an agent's memories.
 * Undirected: canonicalized by lexicographic ordering of (memory_id_a,
 * memory_id_b) so lookup is direction-agnostic.
 *
 * Privacy boundary unchanged: agent_id is non-nullable and every
 * query joins on it. Edges never cross agent boundaries.
 *
 * Idempotent. Safe to re-run.
 *
 *   npx tsx system/scripts/migrate-memory-edges.ts --dry-run
 *   npx tsx system/scripts/migrate-memory-edges.ts
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });
dotenv.config({
  path: path.join(__dirname, "..", "..", "website", ".env"),
  quiet: true,
});

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
    label: "CREATE TABLE agent_memory_edges",
    sql: `
      CREATE TABLE IF NOT EXISTS agent_memory_edges (
        agent_id              TEXT NOT NULL,
        memory_id_a           TEXT NOT NULL,
        memory_id_b           TEXT NOT NULL,
        weight                REAL NOT NULL DEFAULT 0.0,
        co_retrieval_count    INTEGER NOT NULL DEFAULT 0,
        last_strengthened_at  TEXT NOT NULL DEFAULT (datetime('now')),
        created_at            TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (agent_id, memory_id_a, memory_id_b),
        FOREIGN KEY (memory_id_a) REFERENCES agent_memories(id),
        FOREIGN KEY (memory_id_b) REFERENCES agent_memories(id),
        CHECK (memory_id_a < memory_id_b)
      )
    `,
  },
  {
    label: "INDEX idx_edges_agent_a",
    sql: `CREATE INDEX IF NOT EXISTS idx_edges_agent_a
            ON agent_memory_edges(agent_id, memory_id_a, weight DESC)`,
  },
  {
    label: "INDEX idx_edges_agent_b",
    sql: `CREATE INDEX IF NOT EXISTS idx_edges_agent_b
            ON agent_memory_edges(agent_id, memory_id_b, weight DESC)`,
  },
];

(async () => {
  console.log(
    `migrate-memory-edges — ${STATEMENTS.length} statements${dryRun ? " (dry-run)" : ""}`,
  );
  for (const s of STATEMENTS) {
    console.log(`  ${s.label}`);
    if (dryRun) continue;
    await db.execute(s.sql);
  }
  if (!dryRun) {
    const r = await db.execute(
      "SELECT COUNT(*) AS n FROM agent_memory_edges",
    );
    console.log(`\nedges currently in table: ${r.rows[0].n}`);
  }
  console.log("\ndone.");
})().catch((e) => {
  console.error("[migrate-memory-edges] fatal:", e);
  process.exit(1);
});
