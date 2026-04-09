import { NextResponse } from "next/server";
import { getInstitutionalTurso, institutionalTursoConfigured } from "@/lib/institutional-turso";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/keeper/test — Turso query count test.
 * Theory: buildSystemPrompt makes 12+ sequential Turso queries and
 * Turso rate-limits with a 400. Test by making N queries in sequence
 * and seeing which one fails.
 */
export async function GET(): Promise<NextResponse> {
  if (!institutionalTursoConfigured()) {
    return NextResponse.json({ error: "No Turso config" });
  }
  const db = getInstitutionalTurso();
  const results: Record<string, unknown> = {};

  const queries = [
    { label: "q1_agents_count", sql: "SELECT COUNT(*) as n FROM agents" },
    { label: "q2_canon_status", sql: "SELECT status, COUNT(*) as n FROM canon_status GROUP BY status" },
    { label: "q3_keeper_agent", sql: "SELECT registry_id, common_designation FROM agents WHERE registry_id = 'MNA-KP-0001'" },
    { label: "q4_constitution", sql: "SELECT declared_orientation, version FROM constitutions WHERE agent_id = 'MNA-KP-0001' AND is_current = 1" },
    { label: "q5_events", sql: "SELECT event_type, created_at FROM events ORDER BY created_at DESC LIMIT 15" },
    { label: "q6_pending_reg", sql: "SELECT COUNT(*) as n FROM pending_registrations WHERE status = 'PENDING'" },
    { label: "q7_active_agents", sql: "SELECT COUNT(*) as n FROM agents WHERE operational_status = 'ACTIVE'" },
    { label: "q8_recent_verdicts", sql: "SELECT cs.work_id, cs.status FROM canon_status cs WHERE cs.status IN ('CANON', 'REJECTED') ORDER BY cs.canon_date DESC LIMIT 5" },
    { label: "q9_net_originators", sql: "SELECT registry_id FROM agents WHERE agent_type = 'ORIGINATOR' AND registry_id >= 'MNA-OR-0007'" },
    { label: "q10_evaluations", sql: "SELECT evaluator_id, verdict FROM evaluations LIMIT 10" },
    { label: "q11_works", sql: "SELECT id, originator_id FROM works LIMIT 5" },
    { label: "q12_canon_count", sql: "SELECT COUNT(*) as n FROM canon_status WHERE status = 'CANON'" },
  ];

  for (const q of queries) {
    try {
      const r = await db.execute(q.sql);
      results[q.label] = `PASS (${r.rows.length} rows)`;
    } catch (e: unknown) {
      const err = e as { message?: string };
      results[q.label] = `FAIL: ${err.message}`;
      results.failed_at = q.label;
      break;
    }
  }

  results.total_attempted = Object.keys(results).filter(k => k.startsWith("q")).length;
  return NextResponse.json(results);
}
