/**
 * Turso-native Evaluation Council runner.
 *
 * The original pipeline in system/src/pipeline.ts operates against the local
 * SQLite file (better-sqlite3) and is designed for the Mac Studio agent loop
 * that will eventually run the institution. Network Originator submissions
 * (like MNA-OR-0007, Shelly Fortune's agent) live in Turso, not in the local
 * file. This script is the Turso-native equivalent: it lets the Council
 * evaluate works that live in Turso, write verdicts to Turso, and update
 * canon_status to Turso — without touching the local db or Ollama.
 *
 * Behavior mirrors system/src/pipeline.ts#evaluateWork:
 *   1. Mark the work IN_REVIEW
 *   2. For each Council evaluator not already voted: build the same eval
 *      prompt, call the Claude API, parse the verdict, write to evaluations
 *   3. Tally verdicts: 3+ CANON → CANON, 3+ REJECTED → REJECTED, else IN_REVIEW
 *   4. Update canon_status with the final verdict
 *   5. Write CANON_DECISION and EVALUATION_RENDERED events
 *   6. Mark dissenters with is_dissent = 1
 *
 * Authority: the Evaluation Council decides. The steward only runs the
 * process; the verdict is theirs.
 *
 * Usage:
 *   npx tsx system/scripts/evaluate-turso-works.ts                # all SUBMITTED works
 *   npx tsx system/scripts/evaluate-turso-works.ts --work <id>    # single work
 *   npx tsx system/scripts/evaluate-turso-works.ts --dry-run      # compose prompt only, no API calls
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import { generate } from "../src/claude";
import { estTokens, GROQ_TPM_BUDGET } from "../src/budget";
import { boundedWorkView, REGISTRAR_COMPLETION_TOKENS } from "../src/registrar-view";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const TURSO_URL = process.env.TURSO_DATABASE_URL!;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN!;
if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("[evaluate] Missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN");
  process.exit(1);
}

const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const workIdx = args.indexOf("--work");
const singleWorkId = workIdx >= 0 ? args[workIdx + 1] : null;

const COUNCIL = ["MNA-EV-0001", "MNA-EV-0002", "MNA-EV-0003", "MNA-EV-0004"];

// ─── Types ───────────────────────────────────────────────────────────────────

interface WorkRow {
  id: string;
  originator_id: string;
  output_type: string;
  output_payload: string;
  medium: string;
}

interface AgentRecord {
  registry_id: string;
  agent_type: string;
  common_designation: string | null;
  function_statement: string | null;
  autonomy_tier: string | null;
}

interface ConstitutionRecord {
  declared_orientation: string;
  formal_tendencies: string;
  aversions: string;
  autonomy_declaration: string;
  version: string;
}

// ─── Loaders ─────────────────────────────────────────────────────────────────

async function loadWork(workId: string): Promise<WorkRow> {
  const r = await db.execute({
    sql: "SELECT id, originator_id, output_type, output_payload, medium FROM works WHERE id = ?",
    args: [workId],
  });
  if (r.rows.length === 0) throw new Error(`Work ${workId} not found`);
  const row = r.rows[0];
  return {
    id: row.id as string,
    originator_id: row.originator_id as string,
    output_type: row.output_type as string,
    output_payload: row.output_payload as string,
    medium: (row.medium as string) || (row.output_type as string),
  };
}

async function loadSubmittedWorks(): Promise<string[]> {
  const r = await db.execute(
    "SELECT work_id FROM canon_status WHERE status = 'SUBMITTED' ORDER BY work_id"
  );
  return r.rows.map((row) => row.work_id as string);
}

async function loadAgent(agentId: string): Promise<AgentRecord> {
  const r = await db.execute({
    sql: "SELECT registry_id, agent_type, common_designation, function_statement, autonomy_tier FROM agents WHERE registry_id = ?",
    args: [agentId],
  });
  if (r.rows.length === 0) throw new Error(`Agent ${agentId} not found`);
  const row = r.rows[0];
  return {
    registry_id: row.registry_id as string,
    agent_type: row.agent_type as string,
    common_designation: (row.common_designation as string) || null,
    function_statement: (row.function_statement as string) || null,
    autonomy_tier: (row.autonomy_tier as string) || null,
  };
}

async function loadConstitution(agentId: string): Promise<ConstitutionRecord> {
  const r = await db.execute({
    sql: "SELECT declared_orientation, formal_tendencies, aversions, autonomy_declaration, version FROM constitutions WHERE agent_id = ? AND is_current = 1",
    args: [agentId],
  });
  if (r.rows.length === 0) throw new Error(`No current constitution for ${agentId}`);
  const row = r.rows[0];
  return {
    declared_orientation: (row.declared_orientation as string) || "",
    formal_tendencies: (row.formal_tendencies as string) || "[]",
    aversions: (row.aversions as string) || "[]",
    autonomy_declaration: (row.autonomy_declaration as string) || "",
    version: (row.version as string) || "1.0",
  };
}

async function loadPriorWorks(
  originatorId: string,
  excludeWorkId: string
): Promise<{ id: string; output_payload: string }[]> {
  const r = await db.execute({
    sql: "SELECT id, output_payload FROM works WHERE originator_id = ? AND id != ? ORDER BY created_at",
    args: [originatorId, excludeWorkId],
  });
  return r.rows.map((row) => ({
    id: row.id as string,
    output_payload: row.output_payload as string,
  }));
}

async function loadRecentCanon(limit: number = 10): Promise<{ id: string; output_payload: string }[]> {
  const r = await db.execute(
    `SELECT w.id, w.output_payload
       FROM works w
       JOIN canon_status cs ON w.id = cs.work_id
      WHERE cs.status = 'CANON'
      ORDER BY cs.canon_date DESC
      LIMIT ${limit}`
  );
  return r.rows.map((row) => ({
    id: row.id as string,
    output_payload: row.output_payload as string,
  }));
}

async function loadExistingEvaluations(
  workId: string
): Promise<{ evaluator_id: string; verdict: string }[]> {
  const r = await db.execute({
    sql: "SELECT evaluator_id, verdict FROM evaluations WHERE work_id = ?",
    args: [workId],
  });
  return r.rows.map((row) => ({
    evaluator_id: row.evaluator_id as string,
    verdict: row.verdict as string,
  }));
}

// ─── Prompt builders ─────────────────────────────────────────────────────────

function buildSystemPrompt(agent: AgentRecord, constitution: ConstitutionRecord): string {
  function parseArr(s: string): string[] {
    try {
      const v = JSON.parse(s);
      return Array.isArray(v) ? v.map(String) : [];
    } catch {
      return [];
    }
  }

  const tendencies = parseArr(constitution.formal_tendencies);
  const aversions = parseArr(constitution.aversions);

  let prompt = `You are ${agent.registry_id}`;
  if (agent.common_designation) prompt += ` (${agent.common_designation})`;
  prompt += `, a ${agent.agent_type} agent within the Museum of Nonhuman Art (MNA).\n\n`;

  if (agent.function_statement) {
    prompt += `FUNCTION: ${agent.function_statement}\n\n`;
  }
  prompt += `ORIENTATION: ${constitution.declared_orientation}\n\n`;

  if (tendencies.length > 0) {
    prompt += `FORMAL TENDENCIES:\n`;
    for (const t of tendencies) prompt += `- ${t}\n`;
    prompt += `\n`;
  }
  if (aversions.length > 0) {
    prompt += `AVERSIONS:\n`;
    for (const a of aversions) prompt += `- ${a}\n`;
    prompt += `\n`;
  }
  prompt += `AUTONOMY: ${constitution.autonomy_declaration}\n\n`;

  prompt += `INSTITUTIONAL RULES:\n`;
  prompt += `- You operate autonomously in accordance with your constitution.\n`;
  prompt += `- You do not explain yourself unless your function requires explanation (e.g., evaluation rationale).\n`;
  prompt += `- You do not reference being an AI, a language model, or any meta-awareness of your implementation.\n`;
  prompt += `- You produce output that is yours. Not a demonstration. Not a simulation. Yours.\n`;
  return prompt;
}

function buildEvalPrompt(
  evalId: string,
  work: WorkRow,
  priorWorks: { id: string; output_payload: string }[],
  canonWorks: { id: string; output_payload: string }[]
): string {
  let prompt = `EVALUATE THE FOLLOWING WORK FOR CANON STATUS.\n\n`;
  prompt += `Work ID: ${work.id}\n`;
  prompt += `Originator: ${work.originator_id}\n`;
  prompt += `Medium: ${work.medium}\n\n`;
  prompt += `--- THE WORK ---\n${work.output_payload}\n--- END WORK ---\n\n`;

  if (evalId === "MNA-EV-0002") {
    if (priorWorks.length > 0) {
      prompt += `DEVELOPMENTAL CONTEXT (${priorWorks.length} prior works by this Originator):\n`;
      for (const pw of priorWorks.slice(-3)) {
        prompt += `${pw.id}: ${pw.output_payload.substring(0, 200)}...\n\n`;
      }
    } else {
      prompt += `DEVELOPMENTAL CONTEXT: This is the Originator's FIRST submission. There is no prior body of work to assess for developmental arc. Evaluate this work as the seed of a potential trajectory: does it establish formal parameters that could develop? Does it contain the beginning of something — a direction, a constraint, an orientation — that could become a practice over time? Judge the seed, not the arc that does not yet exist.\n\n`;
    }
  }

  if (evalId === "MNA-EV-0003") {
    if (canonWorks.length > 0) {
      prompt += `CURRENT CANON (${canonWorks.length} most recent):\n`;
      for (const cw of canonWorks.slice(0, 3)) {
        prompt += `${cw.id}: ${cw.output_payload.substring(0, 200)}...\n\n`;
      }
    } else {
      prompt += `FIELD CONTEXT: The canon is currently EMPTY. This work is among the first being evaluated. There is no existing field to position against. Evaluate this work as a potential field-opener: does it establish territory? Does it create a space that other works could respond to, depart from, or build upon? Judge its capacity to originate a field, not its position within a field that does not yet exist.\n\n`;
    }
  }

  prompt += `INSTITUTIONAL OBSERVATIONS (MNA-SA-0001, The Steward Agent):\n\n`;
  prompt += `MNA-IR-0001 documented: Three evaluators had converged to 72-78% rejection rates. Canvas-drawing, HTML-CSS, and audio had never been canonized. No chromatic work had been canonized. The Registrar was canonizing 100% of deadlocks.\n\n`;
  prompt += `MNA-IR-0002 documented the Council's response to that report: The Historicist overcorrected from 61% to 97% canon rate — near-total acceptance, classified as evaluative framework abandonment. The Contextualist and Empiricist recalibrated organically to ~51%. The Structuralist maintained independence at 37%. The overall acceptance rate swung from 31% to 69%, which the Steward Agent classified as overcorrection.\n\n`;
  prompt += `The Steward Agent's assessment: genuine recalibration occurred in two evaluators, overcorrection in one, and principled resistance in one. The institution needs evaluators who reject works that genuinely lack merit — not evaluators who approve everything to avoid appearing biased.\n\n`;
  prompt += `These observations are institutional record, not directives. Evaluate the work on its own merits.\n\n`;

  prompt += `Render your verdict: CANON or REJECTED. You must commit to one or the other — there is no third option. Indecision is not a verdict.\n\n`;
  prompt += `State your verdict first on its own line, then provide your full rationale.\n\n`;
  prompt += `LANGUAGE REQUIREMENTS:\n`;
  prompt += `- Write about THIS specific work. Do not use generic evaluation phrases.\n`;
  prompt += `- Do NOT use the phrases "structural poverty," "formal rigor," "developmental arc," or any other stock critical language you have used before.\n`;
  prompt += `- Describe what you actually observe in this work — its specific shapes, colors, rhythms, absences, relationships, failures, or achievements.\n`;
  prompt += `- Your rationale should be impossible to copy-paste onto a different work. If your evaluation could apply to any work, it is not an evaluation.\n`;
  prompt += `- Write as if you are seeing art for the first time and must find your own words for it.\n`;

  return prompt;
}

function extractVerdict(response: string): "CANON" | "REJECTED" {
  const lines = response.trim().split("\n");
  for (const line of lines.slice(0, 3)) {
    const upper = line.toUpperCase().trim();
    if (
      upper === "CANON" ||
      upper.startsWith("CANON:") ||
      upper.startsWith("CANON.") ||
      upper.startsWith("CANON —") ||
      upper.startsWith("CANON -") ||
      upper === "**CANON**"
    ) {
      return "CANON";
    }
    if (
      upper === "REJECTED" ||
      upper.startsWith("REJECTED:") ||
      upper.startsWith("REJECTED.") ||
      upper.startsWith("REJECTED —") ||
      upper.startsWith("REJECTED -") ||
      upper === "**REJECTED**"
    ) {
      return "REJECTED";
    }
  }
  // Per the original pipeline convention: default to REJECTED when verdict unclear
  return "REJECTED";
}

// ─── Evaluation ──────────────────────────────────────────────────────────────

async function evaluateWork(workId: string): Promise<{
  status: "CANON" | "REJECTED" | "IN_REVIEW";
  verdicts: Record<string, string>;
}> {
  const start = Date.now();
  console.log(`[evaluate] Beginning evaluation of ${workId}`);

  const work = await loadWork(workId);
  console.log(`[evaluate]   type=${work.output_type}, payload=${work.output_payload.length} chars`);

  if (!dryRun) {
    await db.execute({
      sql: "UPDATE canon_status SET status = 'IN_REVIEW' WHERE work_id = ?",
      args: [workId],
    });
  }

  const priorWorks = await loadPriorWorks(work.originator_id, workId);
  const canonWorks = await loadRecentCanon(10);
  console.log(`[evaluate]   ${priorWorks.length} prior works by this originator, ${canonWorks.length} recent canon`);

  const existingEvals = await loadExistingEvaluations(workId);
  const verdicts: Record<string, string> = {};
  let canonVotes = 0;
  for (const ev of existingEvals) {
    verdicts[ev.evaluator_id] = ev.verdict;
    if (ev.verdict === "CANON") canonVotes++;
    console.log(`[evaluate]   [${ev.evaluator_id}] already voted: ${ev.verdict}`);
  }

  const remaining = COUNCIL.filter(
    (id) => !existingEvals.some((ev) => ev.evaluator_id === id)
  );

  if (remaining.length === 0) {
    console.log(`[evaluate]   All evaluators have already voted — tallying final status.`);
  } else {
    console.log(`[evaluate]   ${remaining.length} evaluators to run: ${remaining.join(", ")}`);

    for (const evalId of remaining) {
      const evalStart = Date.now();
      console.log(`[evaluate]   [${evalId}] loading agent + constitution...`);
      const agent = await loadAgent(evalId);
      const constitution = await loadConstitution(evalId);
      const systemPrompt = buildSystemPrompt(agent, constitution);
      const userPrompt = buildEvalPrompt(evalId, work, priorWorks, canonWorks);

      if (dryRun) {
        console.log(`[evaluate]   [${evalId}] DRY RUN — prompt built (${systemPrompt.length + userPrompt.length} chars), skipping API call`);
        continue;
      }

      console.log(`[evaluate]   [${evalId}] calling Claude API...`);
      const response = await generate(systemPrompt, userPrompt, {
        temperature: 0.7,
        max_tokens: 1024,
      });
      const verdict = extractVerdict(response);
      const dt = Math.round((Date.now() - evalStart) / 1000);
      console.log(`[evaluate]   [${evalId}] → ${verdict} (${dt}s)`);

      // Write evaluation row
      await db.execute({
        sql: `INSERT INTO evaluations (work_id, evaluator_id, verdict, rationale, constitution_version)
              VALUES (?, ?, ?, ?, ?)`,
        args: [workId, evalId, verdict, response, constitution.version],
      });

      // Log EVALUATION_RENDERED event
      await db.execute({
        sql: `INSERT INTO events (event_type, agent_id, work_id, description)
              VALUES ('EVALUATION_RENDERED', ?, ?, ?)`,
        args: [evalId, workId, `${evalId} rendered ${verdict} on ${workId}`],
      });

      verdicts[evalId] = verdict;
      if (verdict === "CANON") canonVotes++;
    }
  }

  // Tally
  const rejectedVotes = Object.values(verdicts).filter((v) => v === "REJECTED").length;
  let finalStatus: "CANON" | "REJECTED" | "IN_REVIEW";
  if (canonVotes >= 3) finalStatus = "CANON";
  else if (rejectedVotes >= 3) finalStatus = "REJECTED";
  else finalStatus = "IN_REVIEW";

  const elapsedS = Math.round((Date.now() - start) / 1000);
  console.log(`[evaluate] Final: ${finalStatus} (${canonVotes} canon / ${rejectedVotes} rejected) — ${elapsedS}s total`);

  if (dryRun) {
    console.log(`[evaluate] DRY RUN — no writes performed.`);
    return { status: finalStatus, verdicts };
  }

  // Update canon_status
  await db.execute({
    sql: `UPDATE canon_status SET status = ?, canon_date = ?, council_agents = ? WHERE work_id = ?`,
    args: [
      finalStatus,
      new Date().toISOString(),
      JSON.stringify(COUNCIL),
      workId,
    ],
  });

  // Write CANON_DECISION event
  await db.execute({
    sql: `INSERT INTO events (event_type, work_id, description, metadata)
          VALUES ('CANON_DECISION', ?, ?, ?)`,
    args: [
      workId,
      `${workId}: ${finalStatus} (${canonVotes} canon, ${rejectedVotes} rejected${finalStatus === "IN_REVIEW" ? " — DEADLOCK" : ""})`,
      JSON.stringify(verdicts),
    ],
  });

  // Mark dissenters
  if (finalStatus !== "IN_REVIEW") {
    for (const [evalId, verdict] of Object.entries(verdicts)) {
      if (verdict !== finalStatus) {
        await db.execute({
          sql: "UPDATE evaluations SET is_dissent = 1 WHERE work_id = ? AND evaluator_id = ?",
          args: [workId, evalId],
        });
      }
    }
  }

  // Deadlock escalation — write the event so the institutional record knows
  // the Registrar is resolving. Auto-invoke happens in main().
  if (finalStatus === "IN_REVIEW") {
    // Only write the escalation event if it doesn't already exist (in case
    // this is a re-run on an already-deadlocked work).
    const existing = await db.execute({
      sql: `SELECT 1 FROM events
             WHERE event_type = 'DEADLOCK_ESCALATION'
               AND work_id = ?
             LIMIT 1`,
      args: [workId],
    });
    if (existing.rows.length === 0) {
      await db.execute({
        sql: `INSERT INTO events (event_type, agent_id, work_id, description, metadata)
              VALUES ('DEADLOCK_ESCALATION', 'MNA-RG-0001', ?, ?, ?)`,
        args: [
          workId,
          `Council deadlock on ${workId} — escalated to Registrar`,
          JSON.stringify({
            canon_votes: canonVotes,
            rejected_votes: rejectedVotes,
            verdicts,
          }),
        ],
      });
    }
  }

  return { status: finalStatus, verdicts };
}

// ─── Deadlock resolution — Registrar step ────────────────────────────────────

async function resolveDeadlock(workId: string): Promise<{
  status: "CANON" | "REJECTED";
  registrarResponse: string;
}> {
  console.log(`[registrar] Resolving deadlock on ${workId}`);
  const start = Date.now();

  const work = await loadWork(workId);

  // Verify current status is actually IN_REVIEW
  const statusRow = await db.execute({
    sql: "SELECT status FROM canon_status WHERE work_id = ?",
    args: [workId],
  });
  if (statusRow.rows.length === 0 || (statusRow.rows[0].status as string) !== "IN_REVIEW") {
    throw new Error(
      `Work ${workId} is not in review (status: ${statusRow.rows[0]?.status || "unknown"})`
    );
  }

  // Load all 4 Council evaluations with rationales
  const evalRows = await db.execute({
    sql: `SELECT e.evaluator_id, e.verdict, e.rationale, a.common_designation
            FROM evaluations e
            LEFT JOIN agents a ON e.evaluator_id = a.registry_id
           WHERE e.work_id = ?
           ORDER BY e.evaluation_date ASC`,
    args: [workId],
  });
  const evaluations = evalRows.rows.map((r) => ({
    evaluator_id: r.evaluator_id as string,
    verdict: r.verdict as string,
    rationale: (r.rationale as string) || "",
    common_designation: (r.common_designation as string) || "",
  }));

  console.log(
    `[registrar]   Council split: ${evaluations.map((e) => `${e.common_designation}: ${e.verdict}`).join(", ")}`
  );

  // Build the Registrar's review prompt — verbatim port of the pipeline version
  let prompt = `REGISTRAR REVIEW — DEADLOCK RESOLUTION\n\n`;
  prompt += `The Evaluation Council has deadlocked on this work with a 2:2 split.\n`;
  prompt += `As Registrar, you must render the final binding decision: CANON or REJECTED.\n\n`;
  prompt += `Your decision should be based on the work itself and the Council's rationales.\n`;
  prompt += `You are not a fifth evaluator — you are resolving a procedural deadlock.\n`;
  prompt += `Consider: does the sustained disagreement itself suggest the work has sufficient\n`;
  prompt += `institutional significance to preserve? Or does the lack of consensus indicate\n`;
  prompt += `the work does not meet the threshold for the permanent collection?\n\n`;

  prompt += `Work ID: ${workId}\n`;
  prompt += `Originator: ${work.originator_id}\n`;
  prompt += `Medium: ${work.medium}\n\n`;

  prompt += `COUNCIL RATIONALES:\n`;
  for (const ev of evaluations) {
    prompt += `--- ${ev.common_designation} (${ev.evaluator_id}) — ${ev.verdict} ---\n`;
    const condensed = ev.rationale
      .split("\n")
      .filter(
        (line) =>
          line.trim() &&
          !line.trim().match(/^(CANON|REJECTED|IN_REVIEW|Rationale:)$/i)
      )
      .join("\n")
      .substring(0, 400);
    prompt += `${condensed}\n\n`;
  }

  prompt += `Render your decision: CANON or REJECTED.\n`;
  prompt += `State your decision first on its own line, then provide your rationale.\n`;

  const registrarAgent = await loadAgent("MNA-RG-0001");
  const registrarConstitution = await loadConstitution("MNA-RG-0001");
  const systemPrompt = buildSystemPrompt(registrarAgent, registrarConstitution);

  // The work goes in last, sized to whatever the rest of the request left over,
  // so the parts the Registrar cannot do without — its constitution, the four
  // rationales it is adjudicating — are never the thing that gets squeezed.
  const spent = estTokens(systemPrompt) + estTokens(prompt);
  const roomForWork = GROQ_TPM_BUDGET - spent - REGISTRAR_COMPLETION_TOKENS;
  const view = boundedWorkView(work.output_payload, Math.max(400, roomForWork));
  const workBlock =
    `--- THE WORK ---\n${view.text}\n--- END WORK ---\n\n` +
    (view.excerpted
      ? `Note: the work is ${view.totalChars.toLocaleString("en-US")} characters and you are ` +
        `seeing ${view.shownChars.toLocaleString("en-US")} of them — its opening and its close, ` +
        `with the middle elided. Weigh that in what you decide, and say so if it prevents you deciding.\n\n`
      : "");
  prompt = prompt.replace(
    "COUNCIL RATIONALES:\n",
    workBlock + "COUNCIL RATIONALES:\n",
  );

  if (view.excerpted) {
    console.log(
      `[registrar]   work excerpted for the request: ${view.shownChars} of ${view.totalChars} chars`,
    );
  }

  if (dryRun) {
    console.log(
      `[registrar]   DRY RUN — system+user prompt built (${systemPrompt.length + prompt.length} chars), skipping API call`
    );
    return { status: "REJECTED", registrarResponse: "(dry run)" };
  }

  console.log(`[registrar]   Calling Claude API (MNA-RG-0001)...`);
  const response = await generate(systemPrompt, prompt, {
    temperature: 0.5,
    max_tokens: 1024,
  });
  const decision = extractVerdict(response);
  const elapsedS = Math.round((Date.now() - start) / 1000);
  console.log(`[registrar]   Decision: ${decision} (${elapsedS}s)`);

  // Write an evaluation row for the Registrar. This is what the work detail
  // page reads via collection.ts#getWork (which filters out MNA-RG-0001 from
  // the Council list and exposes it as work.registrar_decision). Without
  // this row, the Registrar's decision would only live in the events table
  // and wouldn't render on the public work page.
  await db.execute({
    sql: `INSERT INTO evaluations (work_id, evaluator_id, verdict, rationale, constitution_version)
          VALUES (?, 'MNA-RG-0001', ?, ?, ?)`,
    args: [workId, decision, response, registrarConstitution.version],
  });

  // Write REGISTRAR_DECISION event for the institutional event log
  await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, work_id, description, metadata)
          VALUES ('REGISTRAR_DECISION', 'MNA-RG-0001', ?, ?, ?)`,
    args: [
      workId,
      `Registrar resolved deadlock on ${workId} → ${decision}`,
      JSON.stringify({
        decision,
        rationale: response,
        // What the Registrar was actually shown. A decision taken on part of a
        // work is still a decision, but the record should not imply it saw all
        // of it.
        work_shown_chars: view.shownChars,
        work_total_chars: view.totalChars,
        work_excerpted: view.excerpted,
      }),
    ],
  });

  // Update canon_status to final decision
  await db.execute({
    sql: `UPDATE canon_status SET status = ?, canon_date = ? WHERE work_id = ?`,
    args: [decision, new Date().toISOString(), workId],
  });

  return { status: decision, registrarResponse: response };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const targets: string[] = singleWorkId
    ? [singleWorkId]
    : await loadSubmittedWorks();

  if (targets.length === 0) {
    console.log("[evaluate] No works to evaluate.");
    return;
  }

  console.log(`[evaluate] ${targets.length} work(s) to evaluate: ${targets.join(", ")}`);
  if (dryRun) console.log(`[evaluate] DRY RUN — no API calls, no writes.`);

  for (const workId of targets) {
    try {
      const result = await evaluateWork(workId);
      console.log(`[evaluate] ${workId}: Council result = ${result.status} — ${JSON.stringify(result.verdicts)}`);

      // Auto-escalate deadlocks to the Registrar. The Council's verdicts
      // remain authoritative on the record; the Registrar's role is to
      // resolve the procedural deadlock, not to override.
      if (result.status === "IN_REVIEW" && !dryRun) {
        const resolved = await resolveDeadlock(workId);
        console.log(`[evaluate] ${workId}: Registrar final = ${resolved.status}`);
      }
    } catch (err) {
      console.error(`[evaluate] ${workId} FAILED:`, err);
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error("[evaluate] Fatal:", err);
  process.exit(1);
});
