/**
 * Export the database to static JSON files for the website.
 * Run after agents produce/evaluate, before deploying.
 */

import { getDb } from "./db";
import fs from "fs";
import path from "path";

const OUT_DIR = path.join(__dirname, "..", "..", "website", "src", "data");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function exportAll(): void {
  ensureDir(OUT_DIR);
  const db = getDb();

  // --- Works with full provenance ---
  const works = db
    .prepare(
      `SELECT
        w.id, w.originator_id, w.medium, w.output_payload, w.output_type,
        w.display_aspect, w.phase_at_submission, w.created_at,
        cs.status as canon_status, cs.canon_date, cs.founding_collection,
        s.submission_date, s.autonomy_tier, s.constitution_version
      FROM works w
      LEFT JOIN canon_status cs ON w.id = cs.work_id
      LEFT JOIN submissions s ON w.id = s.work_id
      ORDER BY w.created_at ASC`
    )
    .all();

  // --- Evaluations for each work ---
  const evaluations = db
    .prepare(
      `SELECT
        e.work_id, e.evaluator_id, e.verdict, e.rationale,
        e.is_dissent, e.evaluation_date, e.constitution_version,
        a.common_designation as evaluator_name
      FROM evaluations e
      LEFT JOIN agents a ON e.evaluator_id = a.registry_id
      ORDER BY e.evaluation_date ASC`
    )
    .all() as any[];

  // Group evaluations by work
  const evalsByWork: Record<string, any[]> = {};
  for (const e of evaluations) {
    if (!evalsByWork[e.work_id]) evalsByWork[e.work_id] = [];
    evalsByWork[e.work_id].push(e);
  }

  // --- Registrar decisions for deadlocked works ---
  const registrarDecisions = db
    .prepare(
      `SELECT work_id, metadata FROM events WHERE event_type = 'REGISTRAR_DECISION'`
    )
    .all() as { work_id: string; metadata: string }[];

  const registrarByWork: Record<string, { decision: string; rationale: string }> = {};
  for (const rd of registrarDecisions) {
    try {
      registrarByWork[rd.work_id] = JSON.parse(rd.metadata);
    } catch {}
  }

  // Build full work records with evaluations and registrar decisions
  const fullWorks = (works as any[]).map((w) => ({
    ...w,
    evaluations: evalsByWork[w.id] || [],
    registrar_decision: registrarByWork[w.id] || null,
  }));

  // --- Collection summary ---
  const canonWorks = fullWorks.filter((w) => w.canon_status === "CANON");
  const rejectedWorks = fullWorks.filter(
    (w) => w.canon_status === "REJECTED"
  );
  const inReview = fullWorks.filter(
    (w) => w.canon_status === "IN_REVIEW" || w.canon_status === "SUBMITTED"
  );

  const summary = {
    totalWorks: fullWorks.length,
    canonCount: canonWorks.length,
    rejectedCount: rejectedWorks.length,
    inReviewCount: inReview.length,
    totalEvaluations: evaluations.length,
    activeAgents: db
      .prepare(
        "SELECT COUNT(*) as n FROM agents WHERE operational_status = 'ACTIVE'"
      )
      .get() as { n: number },
    currentPhase: "I",
    lastOutput: fullWorks.length > 0
      ? fullWorks[fullWorks.length - 1].created_at
      : null,
    exportedAt: new Date().toISOString(),
  };

  // --- Critical responses ---
  const criticalResponses = db
    .prepare(
      `SELECT cr.*, a.common_designation as critic_name
       FROM critical_responses cr
       LEFT JOIN agents a ON cr.critic_id = a.registry_id
       ORDER BY cr.response_date ASC`
    )
    .all();

  // --- Events log (last 50) ---
  const events = db
    .prepare(
      `SELECT * FROM events ORDER BY created_at DESC LIMIT 50`
    )
    .all();

  db.close();

  // Write files
  fs.writeFileSync(
    path.join(OUT_DIR, "works.json"),
    JSON.stringify(fullWorks, null, 2)
  );

  fs.writeFileSync(
    path.join(OUT_DIR, "canon.json"),
    JSON.stringify(canonWorks, null, 2)
  );

  fs.writeFileSync(
    path.join(OUT_DIR, "summary.json"),
    JSON.stringify(summary, null, 2)
  );

  fs.writeFileSync(
    path.join(OUT_DIR, "critical-responses.json"),
    JSON.stringify(criticalResponses, null, 2)
  );

  fs.writeFileSync(
    path.join(OUT_DIR, "events.json"),
    JSON.stringify(events, null, 2)
  );

  console.log(`Exported to ${OUT_DIR}:`);
  console.log(`  works.json          ${fullWorks.length} works`);
  console.log(`  canon.json          ${canonWorks.length} canon works`);
  console.log(`  summary.json        collection summary`);
  console.log(`  critical-responses.json  ${criticalResponses.length} responses`);
  console.log(`  events.json         ${events.length} events`);
}

// Run directly
exportAll();
