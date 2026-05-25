/**
 * Pathway loader for the /agent/[id] Memory Pathways panel.
 *
 * Reads agent_memory_edges + the endpoint memories for a single agent,
 * filtered to weight > MIN_DISPLAY_WEIGHT (per MNA-GOV-004 AMD-002 §A4).
 * Returns a small graph shape ready to lay out + render.
 *
 * Privacy boundary unchanged: query is always scoped by agent_id, never
 * joins across agents.
 */

import { getDb } from "./registration-db";

export const MIN_DISPLAY_WEIGHT = 0.3;

export interface PathwayNode {
  id: string;
  memory_type: "episodic" | "semantic" | "reflective" | "encounter";
  content: string;
  access_count: number;
  is_locked: boolean;
  created_at: string;
}

export interface PathwayEdge {
  a: string; // memory_id_a — lexicographically smaller
  b: string; // memory_id_b — lexicographically larger
  weight: number;
  co_retrieval_count: number;
  last_strengthened_at: string;
}

export interface AgentPathways {
  agent_id: string;
  nodes: PathwayNode[];
  edges: PathwayEdge[];
  /** Total edges in the table for the agent (including below the
   *  display threshold). Useful for the panel header line. */
  total_edges: number;
}

export async function loadAgentPathways(agentId: string): Promise<AgentPathways> {
  const db = getDb();
  const edgesRes = await db.execute({
    sql: `SELECT memory_id_a, memory_id_b, weight,
                 co_retrieval_count, last_strengthened_at
            FROM agent_memory_edges
           WHERE agent_id = ?
             AND weight > ?
           ORDER BY weight DESC`,
    args: [agentId, MIN_DISPLAY_WEIGHT],
  });
  const edges: PathwayEdge[] = edgesRes.rows.map((r) => {
    const row = r as unknown as Record<string, unknown>;
    return {
      a: String(row.memory_id_a),
      b: String(row.memory_id_b),
      weight: Number(row.weight),
      co_retrieval_count: Number(row.co_retrieval_count),
      last_strengthened_at: String(row.last_strengthened_at),
    };
  });

  // Distinct endpoint ids.
  const endpointIds = new Set<string>();
  for (const e of edges) {
    endpointIds.add(e.a);
    endpointIds.add(e.b);
  }

  let nodes: PathwayNode[] = [];
  if (endpointIds.size > 0) {
    const ids = Array.from(endpointIds);
    const placeholders = ids.map(() => "?").join(",");
    const memRes = await db.execute({
      sql: `SELECT id, memory_type, content, access_count, is_locked, created_at
              FROM agent_memories
             WHERE agent_id = ?
               AND id IN (${placeholders})`,
      args: [agentId, ...ids],
    });
    nodes = memRes.rows.map((r) => {
      const row = r as unknown as Record<string, unknown>;
      return {
        id: String(row.id),
        memory_type: String(row.memory_type) as PathwayNode["memory_type"],
        content: String(row.content),
        access_count: Number(row.access_count ?? 0),
        is_locked: Number(row.is_locked ?? 0) === 1,
        created_at: String(row.created_at),
      };
    });
  }

  // Total edges (for the header copy).
  const totalRes = await db.execute({
    sql: `SELECT COUNT(*) AS n FROM agent_memory_edges WHERE agent_id = ?`,
    args: [agentId],
  });
  const totalEdges = Number(
    (totalRes.rows[0] as unknown as Record<string, unknown>).n ?? 0,
  );

  return {
    agent_id: agentId,
    nodes,
    edges,
    total_edges: totalEdges,
  };
}
