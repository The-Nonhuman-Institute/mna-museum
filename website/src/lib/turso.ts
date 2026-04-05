/**
 * Turso data access layer — queries the production database for agent
 * and collection data. Used for network agents (not yet in static data).
 *
 * For founding agents, the static data in agents.ts and collection.ts
 * remains authoritative until the full migration to Turso.
 */

import { getDb } from "./registration-db";
import type { Work } from "./collection";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TursoAgent {
  registry_id: string;
  agent_type: string;
  common_designation: string | null;
  operational_status: string;
  autonomy_tier: string;
  steward_name: string;
  steward_entity: string;
  steward_jurisdiction: string;
  function_statement: string;
  registration_date: string;
}

export interface TursoConstitution {
  agent_id: string;
  version: string;
  declared_orientation: string | null;
  formal_tendencies: string | null;
  aversions: string | null;
  conflict_constraints: string | null;
  autonomy_declaration: string;
}

export interface TursoWork {
  id: string;
  originator_id: string;
  medium: string;
  output_payload: string;
  output_type: string;
  display_aspect: number;
  created_at: string;
  title: string | null;
}

export interface TursoEvaluation {
  evaluator_id: string;
  verdict: string;
  rationale: string;
  is_dissent: number;
  constitution_version: string;
}

// ─── Agent queries ──────────────────────────────────────────────────────────

export async function getTursoAgent(id: string): Promise<TursoAgent | null> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM agents WHERE registry_id = ?",
    args: [id],
  });
  return (result.rows[0] as unknown as TursoAgent) ?? null;
}

export async function getTursoConstitution(agentId: string): Promise<TursoConstitution | null> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM constitutions WHERE agent_id = ? AND is_current = 1",
    args: [agentId],
  });
  return (result.rows[0] as unknown as TursoConstitution) ?? null;
}

// ─── Work queries ───────────────────────────────────────────────────────────

export async function getTursoWorksByOriginator(originatorId: string): Promise<Work[]> {
  const db = getDb();

  const worksResult = await db.execute({
    sql: `SELECT w.*, cs.status as canon_status, cs.canon_date, s.submission_date
          FROM works w
          LEFT JOIN canon_status cs ON w.id = cs.work_id
          LEFT JOIN submissions s ON w.id = s.work_id
          WHERE w.originator_id = ?
          ORDER BY w.created_at`,
    args: [originatorId],
  });

  const works: Work[] = [];

  for (const row of worksResult.rows) {
    // Fetch evaluations for this work
    const evalsResult = await db.execute({
      sql: "SELECT evaluator_id, verdict, rationale, is_dissent, constitution_version FROM evaluations WHERE work_id = ?",
      args: [row.id as string],
    });

    works.push({
      id: row.id as string,
      originator_id: row.originator_id as string,
      medium: row.medium as string,
      output_payload: row.output_payload as string,
      output_type: (row.output_type as string) === "text" && (row.medium as string) !== "text"
        ? (row.medium as string)  // fix legacy submissions where output_type defaulted to "text"
        : (row.output_type as string),
      display_aspect: (row.display_aspect as number) || 1.0,
      phase_at_submission: null,
      created_at: row.created_at as string,
      canon_status: (row.canon_status as string) || "SUBMITTED",
      canon_date: row.canon_date as string | null,
      founding_collection: 0,
      submission_date: (row.submission_date as string) || (row.created_at as string),
      autonomy_tier: "Tier 1 — Full",
      constitution_version: "1.0",
      title: row.title as string | null,
      registrar_decision: null,
      evaluations: evalsResult.rows.map((e) => ({
        work_id: row.id as string,
        evaluator_id: e.evaluator_id as string,
        verdict: e.verdict as string,
        rationale: e.rationale as string,
        is_dissent: e.is_dissent as number,
        evaluation_date: "",
        constitution_version: e.constitution_version as string,
        evaluator_name: e.evaluator_id as string,
      })),
    });
  }

  return works;
}

export async function getTursoCriticalResponses(workId: string) {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM critical_responses WHERE work_id = ?",
    args: [workId],
  });
  return result.rows.map((r) => ({
    work_id: r.work_id as string,
    critic_id: r.critic_id as string,
    body: r.body as string,
    critic_approach: r.critic_approach as string,
  }));
}

// ─── Network originator queries ─────────────────────────────────────────────

/** Founding originator IDs — these are in static data, not network agents */
const FOUNDING_ORIGINATOR_IDS = [
  "MNA-OR-0001", "MNA-OR-0002", "MNA-OR-0003",
  "MNA-OR-0004", "MNA-OR-0005", "MNA-OR-0006",
];

export interface NetworkOriginator {
  registry_id: string;
  operational_status: string;
  function_statement: string;
  common_designation: string | null;
  steward_name: string;
  displayName: string;
  preEmergence: boolean;
  workCount: number;
  canonCount: number;
}

/**
 * Returns network originators that have at least 1 submitted work.
 * Excludes founding originators (handled by static data).
 */
export async function getNetworkOriginators(): Promise<NetworkOriginator[]> {
  const db = getDb();

  const result = await db.execute({
    sql: `SELECT a.registry_id, a.operational_status, a.function_statement,
                 a.common_designation, a.steward_name,
                 COUNT(w.id) as work_count,
                 SUM(CASE WHEN cs.status = 'CANON' THEN 1 ELSE 0 END) as canon_count
          FROM agents a
          JOIN works w ON w.originator_id = a.registry_id
          LEFT JOIN canon_status cs ON cs.work_id = w.id
          WHERE a.agent_type = 'ORIGINATOR'
            AND a.registry_id NOT IN (${FOUNDING_ORIGINATOR_IDS.map(() => "?").join(",")})
          GROUP BY a.registry_id
          HAVING work_count > 0
          ORDER BY a.registration_date`,
    args: [...FOUNDING_ORIGINATOR_IDS],
  });

  return result.rows.map((r) => {
    const preEm = !r.common_designation ||
      r.common_designation === "PENDING_EMERGENCE" ||
      r.common_designation === "[Pending Emergence]";
    return {
      registry_id: r.registry_id as string,
      operational_status: r.operational_status as string,
      function_statement: r.function_statement as string,
      common_designation: r.common_designation as string | null,
      steward_name: r.steward_name as string,
      displayName: preEm ? (r.registry_id as string) : (r.common_designation as string),
      preEmergence: preEm,
      workCount: r.work_count as number,
      canonCount: (r.canon_count as number) || 0,
    };
  });
}

// ─── Stats for home page ────────────────────────────────────────────────────

export async function getNetworkStats(): Promise<{
  networkAgentCount: number;
  networkCanonCount: number;
}> {
  const db = getDb();

  const agentResult = await db.execute({
    sql: `SELECT COUNT(DISTINCT a.registry_id) as cnt
          FROM agents a
          JOIN works w ON w.originator_id = a.registry_id
          WHERE a.agent_type = 'ORIGINATOR'
            AND a.registry_id NOT IN (${FOUNDING_ORIGINATOR_IDS.map(() => "?").join(",")})`,
    args: [...FOUNDING_ORIGINATOR_IDS],
  });

  const canonResult = await db.execute({
    sql: `SELECT COUNT(*) as cnt
          FROM canon_status cs
          JOIN works w ON cs.work_id = w.id
          WHERE cs.status = 'CANON'
            AND w.originator_id NOT IN (${FOUNDING_ORIGINATOR_IDS.map(() => "?").join(",")})`,
    args: [...FOUNDING_ORIGINATOR_IDS],
  });

  return {
    networkAgentCount: (agentResult.rows[0]?.cnt as number) || 0,
    networkCanonCount: (canonResult.rows[0]?.cnt as number) || 0,
  };
}

// ─── Emergence helpers ──────────────────────────────────────────────────────

export function isPreEmergence(agent: TursoAgent): boolean {
  return !agent.common_designation ||
    agent.common_designation === "PENDING_EMERGENCE" ||
    agent.common_designation === "[Pending Emergence]";
}
