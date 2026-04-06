/**
 * Collection data layer — queries Turso (or local SQLite fallback) as the
 * single source of truth. No static JSON imports.
 */

import { getDb } from "./registration-db";

export interface Evaluation {
  work_id: string;
  evaluator_id: string;
  verdict: string;
  rationale: string;
  is_dissent: number;
  evaluation_date: string;
  constitution_version: string;
  evaluator_name: string;
}

export interface Work {
  id: string;
  originator_id: string;
  originator_name: string | null;
  medium: string;
  output_payload: string;
  output_type: string;
  display_aspect: number;
  phase_at_submission: string | null;
  created_at: string;
  canon_status: string;
  canon_date: string | null;
  founding_collection: number;
  submission_date: string;
  autonomy_tier: string;
  constitution_version: string;
  title: string | null;
  evaluations: Evaluation[];
  registrar_decision: { decision: string; rationale: string } | null;
}

export interface CriticalResponse {
  id: number;
  work_id: string;
  critic_id: string;
  body: string;
  critic_approach: string;
  response_date: string;
  critic_name: string;
}

export interface Summary {
  totalWorks: number;
  canonCount: number;
  rejectedCount: number;
  inReviewCount: number;
  totalEvaluations: number;
  activeAgents: { n: number };
  currentPhase: string;
  lastOutput: string | null;
  exportedAt: string;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Check if the works table has a title column (added later via migration). */
let _hasTitleColumn: boolean | null = null;
async function hasTitleColumn(): Promise<boolean> {
  if (_hasTitleColumn !== null) return _hasTitleColumn;
  const db = getDb();
  try {
    const result = await db.execute(
      "SELECT COUNT(*) as n FROM pragma_table_info('works') WHERE name = 'title'"
    );
    _hasTitleColumn = (result.rows[0]?.n as number) > 0;
  } catch {
    _hasTitleColumn = false;
  }
  return _hasTitleColumn;
}

async function buildWork(row: Record<string, unknown>): Promise<Work> {
  const db = getDb();
  const workId = row.id as string;

  // Fetch evaluations with evaluator names
  const evalsResult = await db.execute({
    sql: `SELECT e.work_id, e.evaluator_id, e.verdict, e.rationale, e.is_dissent,
                 e.evaluation_date, e.constitution_version,
                 COALESCE(a.common_designation, e.evaluator_id) as evaluator_name
          FROM evaluations e
          LEFT JOIN agents a ON e.evaluator_id = a.registry_id
          WHERE e.work_id = ?`,
    args: [workId],
  });

  // Check for registrar decision (evaluator_id = MNA-RG-0001)
  const registrarEval = evalsResult.rows.find(
    (e) => (e.evaluator_id as string) === "MNA-RG-0001"
  );

  const outputType = row.output_type as string;
  const medium = row.medium as string;

  return {
    id: workId,
    originator_id: row.originator_id as string,
    originator_name: (row.originator_name as string) || null,
    medium,
    output_payload: row.output_payload as string,
    output_type: outputType,
    display_aspect: (row.display_aspect as number) || 1.0,
    phase_at_submission: (row.phase_at_submission as string) || null,
    created_at: row.created_at as string,
    canon_status: (row.canon_status as string) || "SUBMITTED",
    canon_date: (row.canon_date as string) || null,
    founding_collection: (row.founding_collection as number) || 0,
    submission_date: (row.submission_date as string) || (row.created_at as string),
    autonomy_tier: (row.autonomy_tier as string) || "Tier 1 — Full",
    constitution_version: (row.constitution_version as string) || "1.0",
    title: (row.title as string) || null,
    evaluations: evalsResult.rows
      .filter((e) => (e.evaluator_id as string) !== "MNA-RG-0001")
      .map((e) => ({
        work_id: workId,
        evaluator_id: e.evaluator_id as string,
        verdict: e.verdict as string,
        rationale: e.rationale as string,
        is_dissent: e.is_dissent as number,
        evaluation_date: (e.evaluation_date as string) || "",
        constitution_version: (e.constitution_version as string) || "1.0",
        evaluator_name: (e.evaluator_name as string) || (e.evaluator_id as string),
      })),
    registrar_decision: registrarEval
      ? {
          decision: registrarEval.verdict as string,
          rationale: registrarEval.rationale as string,
        }
      : null,
  };
}

function baseWorkQuery(hasTitle: boolean): string {
  return `SELECT w.id, w.originator_id, w.medium, w.output_payload, w.output_type,
                 w.display_aspect, w.phase_at_submission, w.created_at,
                 ${hasTitle ? "w.title," : "NULL as title,"}
                 cs.status as canon_status, cs.canon_date, cs.founding_collection,
                 s.submission_date, s.autonomy_tier, s.constitution_version,
                 a.common_designation as originator_name
          FROM works w
          LEFT JOIN canon_status cs ON w.id = cs.work_id
          LEFT JOIN submissions s ON w.id = s.work_id
          LEFT JOIN agents a ON w.originator_id = a.registry_id`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function getAllWorks(): Promise<Work[]> {
  const db = getDb();
  const hasTitle = await hasTitleColumn();
  const result = await db.execute(
    `${baseWorkQuery(hasTitle)} ORDER BY w.created_at`
  );
  return Promise.all(
    result.rows.map((r) => buildWork(r as unknown as Record<string, unknown>))
  );
}

export async function getCanonWorks(): Promise<Work[]> {
  const db = getDb();
  const hasTitle = await hasTitleColumn();
  const result = await db.execute(
    `${baseWorkQuery(hasTitle)} WHERE cs.status = 'CANON' ORDER BY cs.canon_date DESC`
  );
  return Promise.all(
    result.rows.map((r) => buildWork(r as unknown as Record<string, unknown>))
  );
}

export async function getWork(id: string): Promise<Work | undefined> {
  const db = getDb();
  const hasTitle = await hasTitleColumn();
  const result = await db.execute({
    sql: `${baseWorkQuery(hasTitle)} WHERE w.id = ?`,
    args: [id],
  });
  if (!result.rows[0]) return undefined;
  return buildWork(result.rows[0] as unknown as Record<string, unknown>);
}

export async function getWorksByOriginator(
  originatorId: string
): Promise<Work[]> {
  const db = getDb();
  const hasTitle = await hasTitleColumn();
  const result = await db.execute({
    sql: `${baseWorkQuery(hasTitle)} WHERE w.originator_id = ? ORDER BY w.created_at`,
    args: [originatorId],
  });
  return Promise.all(
    result.rows.map((r) => buildWork(r as unknown as Record<string, unknown>))
  );
}

export async function getCriticalResponses(
  workId: string
): Promise<CriticalResponse[]> {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT cr.id, cr.work_id, cr.critic_id, cr.body, cr.critic_approach,
                 cr.response_date,
                 COALESCE(a.common_designation, cr.critic_id) as critic_name
          FROM critical_responses cr
          LEFT JOIN agents a ON cr.critic_id = a.registry_id
          WHERE cr.work_id = ?`,
    args: [workId],
  });
  return result.rows.map((r) => ({
    id: r.id as number,
    work_id: r.work_id as string,
    critic_id: r.critic_id as string,
    body: r.body as string,
    critic_approach: (r.critic_approach as string) || "",
    response_date: (r.response_date as string) || "",
    critic_name: (r.critic_name as string) || (r.critic_id as string),
  }));
}

export async function getAllCriticalResponses(): Promise<CriticalResponse[]> {
  const db = getDb();
  const result = await db.execute(
    `SELECT cr.id, cr.work_id, cr.critic_id, cr.body, cr.critic_approach,
            cr.response_date,
            COALESCE(a.common_designation, cr.critic_id) as critic_name
     FROM critical_responses cr
     LEFT JOIN agents a ON cr.critic_id = a.registry_id
     ORDER BY cr.response_date`
  );
  return result.rows.map((r) => ({
    id: r.id as number,
    work_id: r.work_id as string,
    critic_id: r.critic_id as string,
    body: r.body as string,
    critic_approach: (r.critic_approach as string) || "",
    response_date: (r.response_date as string) || "",
    critic_name: (r.critic_name as string) || (r.critic_id as string),
  }));
}

export async function getSummary(): Promise<Summary> {
  const db = getDb();

  const [totalResult, canonResult, rejectedResult, inReviewResult, evalsResult, agentsResult, lastResult] =
    await Promise.all([
      db.execute("SELECT COUNT(*) as n FROM works"),
      db.execute("SELECT COUNT(*) as n FROM canon_status WHERE status = 'CANON'"),
      db.execute("SELECT COUNT(*) as n FROM canon_status WHERE status = 'REJECTED'"),
      db.execute("SELECT COUNT(*) as n FROM canon_status WHERE status = 'IN_REVIEW'"),
      db.execute("SELECT COUNT(*) as n FROM evaluations"),
      db.execute("SELECT COUNT(DISTINCT registry_id) as n FROM agents WHERE operational_status = 'ACTIVE'"),
      db.execute("SELECT created_at FROM works ORDER BY created_at DESC LIMIT 1"),
    ]);

  return {
    totalWorks: (totalResult.rows[0]?.n as number) || 0,
    canonCount: (canonResult.rows[0]?.n as number) || 0,
    rejectedCount: (rejectedResult.rows[0]?.n as number) || 0,
    inReviewCount: (inReviewResult.rows[0]?.n as number) || 0,
    totalEvaluations: (evalsResult.rows[0]?.n as number) || 0,
    activeAgents: { n: (agentsResult.rows[0]?.n as number) || 0 },
    currentPhase: "I",
    lastOutput: (lastResult.rows[0]?.created_at as string) || null,
    exportedAt: new Date().toISOString(),
  };
}
