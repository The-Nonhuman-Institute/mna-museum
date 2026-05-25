/**
 * memory-consolidate.ts — weekly consolidation worker (MNA-GOV-004 §7).
 *
 * For each founding agent, cluster their non-locked, non-consolidated
 * memories by semantic similarity. Any cluster of 4+ members gets
 * summarized by Sonnet (as the agent) into a single consolidated
 * semantic memory. Originals are linked via `consolidated_into` so they
 * stop surfacing in default retrieval — they remain in the institutional
 * record but the agent's working memory now surfaces the rollup instead.
 *
 * Cluster size threshold (4+) is the protocol's bar — below that, the
 * pattern hasn't repeated enough to merit consolidation.
 *
 * Idempotency: a memory with consolidated_into IS NOT NULL is invisible
 * to the next consolidation pass (it filters in the candidate pull).
 * So re-runs only consolidate fresh growth.
 *
 * Usage:
 *   npx tsx system/scripts/memory-consolidate.ts --all
 *   npx tsx system/scripts/memory-consolidate.ts --agent MNA-AM-0001
 *   npx tsx system/scripts/memory-consolidate.ts --agent MNA-CU-0001 --dry-run
 *   npx tsx system/scripts/memory-consolidate.ts --all --min-cluster 5
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import {
  clusterMemories,
  summarizeCluster,
  type ConsolidatableMemory,
} from "../src/agent-memory-consolidate";
import { embedDocument, vectorToBlob } from "../src/embeddings";

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });
dotenv.config({
  path: path.join(__dirname, "..", "..", "website", ".env"),
  quiet: true,
});

const argv = process.argv.slice(2);
function flag(name: string): boolean {
  return argv.includes(`--${name}`);
}
function arg(name: string): string | null {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}

const dryRun = flag("dry-run");
const all = flag("all");
const oneAgent = arg("agent");
const minClusterStr = arg("min-cluster");
const minCluster = Math.max(
  2,
  minClusterStr ? Number(minClusterStr) : 4,
);
const thresholdStr = arg("threshold");
const threshold = thresholdStr ? Number(thresholdStr) : 0.55;

if (!all && !oneAgent) {
  console.error(
    "usage: memory-consolidate.ts --all | --agent <ID> [--dry-run] [--min-cluster N] [--threshold 0.55]",
  );
  process.exit(2);
}

const NETWORK_ORIGINATORS = new Set(["MNA-OR-0007", "MNA-OR-0008"]);

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

const db = createClient({
  url: sanitize(process.env.TURSO_DATABASE_URL),
  authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
});

interface Agent {
  registry_id: string;
  designation: string;
  function_statement: string | null;
}

async function loadAgents(): Promise<Agent[]> {
  if (oneAgent) {
    const r = await db.execute({
      sql: `SELECT registry_id, common_designation, function_statement
              FROM agents WHERE registry_id = ?`,
      args: [oneAgent],
    });
    if (r.rows.length === 0) {
      throw new Error(`agent ${oneAgent} not found`);
    }
    const x = r.rows[0] as Record<string, unknown>;
    return [
      {
        registry_id: String(x.registry_id),
        designation: (x.common_designation as string) ?? String(x.registry_id),
        function_statement: (x.function_statement as string) ?? null,
      },
    ];
  }
  const r = await db.execute(
    `SELECT registry_id, common_designation, function_statement
       FROM agents
       WHERE operational_status = 'ACTIVE'
       ORDER BY registry_id`,
  );
  return r.rows
    .map((row) => {
      const x = row as Record<string, unknown>;
      return {
        registry_id: String(x.registry_id),
        designation: (x.common_designation as string) ?? String(x.registry_id),
        function_statement: (x.function_statement as string) ?? null,
      };
    })
    .filter((a) => !NETWORK_ORIGINATORS.has(a.registry_id));
}

async function loadConsolidatable(agentId: string): Promise<ConsolidatableMemory[]> {
  const r = await db.execute({
    sql: `SELECT id, agent_id, memory_type, content, salience,
                 created_at, embedding
            FROM agent_memories
           WHERE agent_id = ?
             AND is_archived = 0
             AND is_locked = 0
             AND consolidated_into IS NULL
             AND embedding IS NOT NULL
           ORDER BY created_at ASC`,
    args: [agentId],
  });
  return r.rows.map((row) => {
    const x = row as Record<string, unknown>;
    return {
      id: String(x.id),
      agent_id: String(x.agent_id),
      memory_type: String(x.memory_type),
      content: String(x.content),
      salience: Number(x.salience ?? 0.5),
      created_at: String(x.created_at),
      embedding: x.embedding as Uint8Array | null,
    };
  });
}

async function nextMemoryId(): Promise<string> {
  const r = await db.execute("SELECT COUNT(*) AS n FROM agent_memories");
  const n = Number((r.rows[0] as Record<string, unknown>).n ?? 0);
  return `MEM-${String(n + 1).padStart(7, "0")}`;
}

async function writeConsolidation(
  agentId: string,
  content: string,
  salience: number,
): Promise<string> {
  const id = await nextMemoryId();
  let embeddingBlob: Uint8Array | null = null;
  try {
    const vector = await embedDocument(content);
    embeddingBlob = vectorToBlob(vector);
  } catch (err) {
    console.warn(
      `  [embed] failed for new consolidation ${id}: ${
        err instanceof Error ? err.message : String(err)
      } (writing without vector)`,
    );
  }
  await db.execute({
    sql: `INSERT INTO agent_memories
            (id, agent_id, memory_type, content, salience, is_locked, embedding)
          VALUES (?, ?, 'semantic', ?, ?, 0, ?)`,
    args: [id, agentId, content, salience, embeddingBlob],
  });
  return id;
}

async function linkOriginals(originalIds: string[], consolidatedId: string): Promise<void> {
  // Bulk UPDATE with parameterized IN clause.
  const placeholders = originalIds.map(() => "?").join(",");
  await db.execute({
    sql: `UPDATE agent_memories
             SET consolidated_into = ?
           WHERE id IN (${placeholders})`,
    args: [consolidatedId, ...originalIds],
  });
}

interface AgentReport {
  agent_id: string;
  designation: string;
  candidates: number;
  clusters_found: number;
  clusters_consolidated: number;
  memories_rolled_up: number;
  consolidations_written: number;
}

async function consolidateAgent(agent: Agent): Promise<AgentReport> {
  console.log(`\n[${agent.registry_id}] ${agent.designation}`);
  const candidates = await loadConsolidatable(agent.registry_id);
  console.log(`  candidates: ${candidates.length}`);
  if (candidates.length < minCluster) {
    return {
      agent_id: agent.registry_id,
      designation: agent.designation,
      candidates: candidates.length,
      clusters_found: 0,
      clusters_consolidated: 0,
      memories_rolled_up: 0,
      consolidations_written: 0,
    };
  }

  const allClusters = clusterMemories(candidates, threshold);
  const eligible = allClusters.filter((c) => c.members.length >= minCluster);
  console.log(
    `  clusters: ${allClusters.length} total, ${eligible.length} ≥ ${minCluster} members`,
  );

  let written = 0;
  let rolledUp = 0;
  for (let i = 0; i < eligible.length; i++) {
    const cluster = eligible[i];
    const maxSal = Math.max(...cluster.members.map((m) => m.salience));
    const sal = Math.min(1.0, maxSal * 1.1);
    console.log(
      `  cluster ${i + 1}: ${cluster.members.length} members, mean_cosine=${cluster.mean_cosine.toFixed(3)}, salience=${sal.toFixed(2)}`,
    );
    if (dryRun) {
      for (const m of cluster.members) {
        console.log(`    · ${m.id} (sal=${m.salience.toFixed(2)}) ${m.content.slice(0, 100)}`);
      }
    }
    try {
      const summary = await summarizeCluster({
        agent_id: agent.registry_id,
        agent_designation: agent.designation,
        agent_function_statement: agent.function_statement,
        cluster,
      });
      console.log(`    → "${summary.slice(0, 140)}${summary.length > 140 ? "…" : ""}"`);
      if (!dryRun) {
        const consolidatedId = await writeConsolidation(
          agent.registry_id,
          summary,
          sal,
        );
        await linkOriginals(
          cluster.members.map((m) => m.id),
          consolidatedId,
        );
        console.log(`    ✓ ${consolidatedId} written; ${cluster.members.length} originals linked`);
        written++;
        rolledUp += cluster.members.length;
      }
    } catch (err) {
      console.error(
        `    ✗ summarization failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    agent_id: agent.registry_id,
    designation: agent.designation,
    candidates: candidates.length,
    clusters_found: allClusters.length,
    clusters_consolidated: eligible.length,
    memories_rolled_up: rolledUp,
    consolidations_written: written,
  };
}

(async () => {
  console.log(
    `memory-consolidate — mode: ${dryRun ? "DRY RUN" : "WRITE"}, min_cluster=${minCluster}, threshold=${threshold}`,
  );
  const agents = await loadAgents();
  console.log(`agents to process: ${agents.length}`);

  const reports: AgentReport[] = [];
  for (const agent of agents) {
    try {
      reports.push(await consolidateAgent(agent));
    } catch (err) {
      console.error(
        `[${agent.registry_id}] failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.log("\n─── summary ──────────────────────────────────────────────");
  for (const r of reports) {
    if (r.consolidations_written > 0 || r.clusters_consolidated > 0) {
      console.log(
        `  ${r.agent_id}  candidates=${r.candidates}  consolidated=${r.consolidations_written}  rolled_up=${r.memories_rolled_up}`,
      );
    }
  }
  const totalWritten = reports.reduce((s, r) => s + r.consolidations_written, 0);
  const totalRolledUp = reports.reduce((s, r) => s + r.memories_rolled_up, 0);
  console.log(`\nTOTAL consolidations written: ${totalWritten}`);
  console.log(`TOTAL originals rolled up:    ${totalRolledUp}`);
  if (dryRun) {
    console.log("\nDRY RUN — no writes performed. Re-run without --dry-run to commit.");
  }
})().catch((err) => {
  console.error("[memory-consolidate] fatal:", err);
  process.exit(1);
});
