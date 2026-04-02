/**
 * Export the database to static JSON files for the website.
 * Includes validation gate — broken works are blocked from export.
 */

import { getDb } from "./db";
import { validateWork } from "./validate";
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
    .all() as any[];

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

  const evalsByWork: Record<string, any[]> = {};
  for (const e of evaluations) {
    if (!evalsByWork[e.work_id]) evalsByWork[e.work_id] = [];
    evalsByWork[e.work_id].push(e);
  }

  // --- Registrar decisions ---
  const registrarDecisions = db
    .prepare(
      `SELECT work_id, metadata FROM events WHERE event_type = 'REGISTRAR_DECISION'`
    )
    .all() as { work_id: string; metadata: string }[];

  const registrarByWork: Record<string, { decision: string; rationale: string }> = {};
  for (const rd of registrarDecisions) {
    try {
      registrarByWork[rd.work_id] = JSON.parse(rd.metadata);
    } catch (e) {
      console.error(`[EXPORT] Registrar metadata parse failed for ${rd.work_id}: ${e}`);
    }
  }

  // Build full work records
  const fullWorks = works.map((w: any) => ({
    ...w,
    evaluations: evalsByWork[w.id] || [],
    registrar_decision: registrarByWork[w.id] || null,
  }));

  // ─── EXPORT VALIDATION GATE ─────────────────────────────────────────────────
  let blocked = 0;
  let integrityFailures = 0;

  const validatedWorks = fullWorks.filter((w: any) => {
    const result = validateWork(w.output_payload, w.output_type);
    if (!result.valid) {
      console.error(`[EXPORT] BLOCKED ${w.id}: ${result.errors.join("; ")}`);
      blocked++;
      return false;
    }
    return true;
  });

  // Integrity checks on canon works
  const validatedCanon = validatedWorks.filter((w: any) => {
    if (w.canon_status !== "CANON") return false;

    const evals = w.evaluations || [];
    const canonVotes = evals.filter((e: any) => e.verdict === "CANON").length;
    const hasRegistrar = !!w.registrar_decision;

    // Canon works need either 3+ CANON votes or a Registrar CANON decision
    if (canonVotes < 3 && !hasRegistrar) {
      console.error(`[EXPORT] INTEGRITY FAIL ${w.id}: CANON status but only ${canonVotes} CANON votes and no Registrar decision`);
      integrityFailures++;
      return false;
    }

    if (evals.length < 3) {
      console.error(`[EXPORT] INTEGRITY FAIL ${w.id}: CANON status but only ${evals.length} evaluations`);
      integrityFailures++;
      return false;
    }

    return true;
  });

  // ─── Collection summary ───────────────────────────────────────────────────
  const rejectedWorks = validatedWorks.filter(
    (w: any) => w.canon_status === "REJECTED"
  );
  const inReview = validatedWorks.filter(
    (w: any) => w.canon_status === "IN_REVIEW" || w.canon_status === "SUBMITTED"
  );

  const summary = {
    totalWorks: validatedWorks.length,
    canonCount: validatedCanon.length,
    rejectedCount: rejectedWorks.length,
    inReviewCount: inReview.length,
    totalEvaluations: evaluations.length,
    activeAgents: db
      .prepare(
        "SELECT COUNT(*) as n FROM agents WHERE operational_status = 'ACTIVE'"
      )
      .get() as { n: number },
    currentPhase: "I",
    lastOutput: validatedWorks.length > 0
      ? validatedWorks[validatedWorks.length - 1].created_at
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
    JSON.stringify(validatedWorks, null, 2)
  );

  fs.writeFileSync(
    path.join(OUT_DIR, "canon.json"),
    JSON.stringify(validatedCanon, null, 2)
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

  console.log(`\nExported to ${OUT_DIR}:`);
  console.log(`  works.json          ${validatedWorks.length} works (${blocked} blocked by validation)`);
  console.log(`  canon.json          ${validatedCanon.length} canon works (${integrityFailures} integrity failures)`);
  console.log(`  summary.json        collection summary`);
  console.log(`  critical-responses.json  ${(criticalResponses as any[]).length} responses`);
  console.log(`  events.json         ${(events as any[]).length} events`);
  if (blocked > 0 || integrityFailures > 0) {
    console.warn(`\n⚠ ${blocked + integrityFailures} issues found — see errors above`);
  }
}

// Run directly
exportAll();
