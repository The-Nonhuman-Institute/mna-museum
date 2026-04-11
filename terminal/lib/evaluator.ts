import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getInstitutionalTurso } from "./institutional-turso";

/**
 * MNA Steward Terminal — Council evaluation runner.
 *
 * Port of system/scripts/evaluate-turso-works.ts for execution inside
 * Vercel functions. Key difference: evaluators run in PARALLEL
 * (Promise.all) instead of sequentially, cutting wall-clock time from
 * 2-4 minutes to 30-60 seconds. Cross-contamination isn't a concern
 * because each evaluator sees only the work + its own constitution —
 * they never see each other's votes.
 *
 * Used by the Keeper's execute_trigger_evaluation action tool.
 */

function sanitize(raw: string | undefined): string {
  return (raw || "").replace(/[\s\u0000-\u001F\u007F]/g, "");
}

const COUNCIL = ["MNA-EV-0001", "MNA-EV-0002", "MNA-EV-0003", "MNA-EV-0004"];

function getAnthropicClient(): Anthropic {
  const key = sanitize(process.env.ANTHROPIC_API_KEY);
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  return new Anthropic({ apiKey: key });
}

const MODEL = sanitize(process.env.ANTHROPIC_MODEL) || "claude-sonnet-4-20250514";

export interface EvaluationResult {
  work_id: string;
  final_status: "CANON" | "REJECTED" | "IN_REVIEW";
  verdicts: Record<string, string>;
  registrar_resolved: boolean;
  elapsed_seconds: number;
}

/**
 * Run the full Evaluation Council on a single work.
 * Returns the final verdict with all vote details.
 */
export async function evaluateWork(workId: string): Promise<EvaluationResult> {
  const start = Date.now();
  const db = getInstitutionalTurso();
  const anthropic = getAnthropicClient();

  // Load work
  const workRow = await db.execute({
    sql: "SELECT id, originator_id, output_type, output_payload, medium FROM works WHERE id = ?",
    args: [workId],
  });
  if (workRow.rows.length === 0) throw new Error(`Work ${workId} not found`);
  const work = workRow.rows[0];

  // Mark IN_REVIEW
  await db.execute({
    sql: "UPDATE canon_status SET status = 'IN_REVIEW' WHERE work_id = ?",
    args: [workId],
  });

  // Load context
  const priorWorks = await db.execute({
    sql: "SELECT id, output_payload FROM works WHERE originator_id = ? AND id != ? ORDER BY created_at LIMIT 5",
    args: [work.originator_id as string, workId],
  });
  const canonWorks = await db.execute(
    "SELECT w.id, w.output_payload FROM works w JOIN canon_status cs ON w.id = cs.work_id WHERE cs.status = 'CANON' ORDER BY cs.canon_date DESC LIMIT 10"
  );

  // Check existing evaluations
  const existingEvals = await db.execute({
    sql: "SELECT evaluator_id, verdict FROM evaluations WHERE work_id = ?",
    args: [workId],
  });
  const existingVerdicts: Record<string, string> = {};
  for (const e of existingEvals.rows) {
    existingVerdicts[e.evaluator_id as string] = e.verdict as string;
  }

  const remaining = COUNCIL.filter((id) => !(id in existingVerdicts));
  const verdicts = { ...existingVerdicts };

  // Run remaining evaluators IN PARALLEL
  if (remaining.length > 0) {
    const results = await Promise.all(
      remaining.map(async (evalId) => {
        const agent = await db.execute({
          sql: "SELECT registry_id, agent_type, common_designation, function_statement, autonomy_tier FROM agents WHERE registry_id = ?",
          args: [evalId],
        });
        const constitution = await db.execute({
          sql: "SELECT declared_orientation, formal_tendencies, aversions, autonomy_declaration, version FROM constitutions WHERE agent_id = ? AND is_current = 1",
          args: [evalId],
        });
        if (agent.rows.length === 0 || constitution.rows.length === 0) {
          return { evalId, verdict: "REJECTED" as const, rationale: "Agent or constitution not found", version: "1.0" };
        }

        const a = agent.rows[0];
        const c = constitution.rows[0];
        const systemPrompt = buildSystemPrompt(a, c);
        const userPrompt = buildEvalPrompt(
          evalId,
          work as unknown as Record<string, string>,
          priorWorks.rows.map((r) => ({ id: r.id as string, output_payload: r.output_payload as string })),
          canonWorks.rows.map((r) => ({ id: r.id as string, output_payload: r.output_payload as string }))
        );

        const response = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 1024,
          temperature: 0.7,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        });

        const text = response.content[0]?.type === "text" ? response.content[0].text : "";
        const verdict = extractVerdict(text);
        return { evalId, verdict, rationale: text, version: (c.version as string) || "1.0" };
      })
    );

    // Write evaluations to Turso
    for (const r of results) {
      await db.execute({
        sql: "INSERT INTO evaluations (work_id, evaluator_id, verdict, rationale, constitution_version) VALUES (?, ?, ?, ?, ?)",
        args: [workId, r.evalId, r.verdict, r.rationale, r.version],
      });
      await db.execute({
        sql: "INSERT INTO events (event_type, agent_id, work_id, description) VALUES ('EVALUATION_RENDERED', ?, ?, ?)",
        args: [r.evalId, workId, `${r.evalId} rendered ${r.verdict} on ${workId}`],
      });
      verdicts[r.evalId] = r.verdict;
    }
  }

  // Tally
  const canonVotes = Object.values(verdicts).filter((v) => v === "CANON").length;
  const rejectedVotes = Object.values(verdicts).filter((v) => v === "REJECTED").length;
  let finalStatus: "CANON" | "REJECTED" | "IN_REVIEW";
  if (canonVotes >= 3) finalStatus = "CANON";
  else if (rejectedVotes >= 3) finalStatus = "REJECTED";
  else finalStatus = "IN_REVIEW";

  let registrarResolved = false;

  // Deadlock → Registrar
  if (finalStatus === "IN_REVIEW") {
    const registrarResult = await resolveDeadlock(workId, work, verdicts, anthropic, db);
    finalStatus = registrarResult.decision;
    registrarResolved = true;
  }

  // Update canon_status
  await db.execute({
    sql: "UPDATE canon_status SET status = ?, canon_date = ? WHERE work_id = ?",
    args: [finalStatus, new Date().toISOString(), workId],
  });
  await db.execute({
    sql: "INSERT INTO events (event_type, work_id, description, metadata) VALUES ('CANON_DECISION', ?, ?, ?)",
    args: [workId, `${workId}: ${finalStatus} (${canonVotes} canon, ${rejectedVotes} rejected${registrarResolved ? " — Registrar resolved" : ""})`, JSON.stringify(verdicts)],
  });

  // Notify the AGENT about the verdict
  const originatorId = work.originator_id as string;
  const voteBreakdown = Object.entries(verdicts).map(([id, v]) => `${id}: ${v}`).join(", ");
  try {
    await db.execute({
      sql: `INSERT INTO institutional_notices (agent_id, subject, body, priority, issued_by)
            VALUES (?, ?, ?, ?, 'MNA-RG-0001')`,
      args: [
        originatorId,
        `${finalStatus === "CANON" ? "Work Canonized" : "Work Not Canonized"} — ${workId}`,
        `The Evaluation Council has rendered its verdict on ${workId}: ${finalStatus}.\n\nVote breakdown: ${voteBreakdown}${registrarResolved ? "\n\nThe Council deadlocked 2-2. The Registrar (MNA-RG-0001) resolved the tie to " + finalStatus + "." : ""}\n\nFull rationales and any critical responses are available at https://mnamuseum.org/api/work/${workId}`,
        finalStatus === "CANON" ? "important" : "normal",
      ],
    });
  } catch { /* notice failure shouldn't block the evaluation */ }

  // Mark dissenters (finalStatus is always CANON or REJECTED at this
  // point — deadlocks are resolved by the Registrar above).
  {
    for (const [evalId, verdict] of Object.entries(verdicts)) {
      if (verdict !== finalStatus && evalId.startsWith("MNA-EV-")) {
        await db.execute({
          sql: "UPDATE evaluations SET is_dissent = 1 WHERE work_id = ? AND evaluator_id = ?",
          args: [workId, evalId],
        });
      }
    }
  }

  return {
    work_id: workId,
    final_status: finalStatus,
    verdicts,
    registrar_resolved: registrarResolved,
    elapsed_seconds: Math.round((Date.now() - start) / 1000),
  };
}

async function resolveDeadlock(
  workId: string,
  work: Record<string, unknown>,
  verdicts: Record<string, string>,
  anthropic: Anthropic,
  db: ReturnType<typeof getInstitutionalTurso>
): Promise<{ decision: "CANON" | "REJECTED" }> {
  // Load evaluator rationales for the Registrar
  const evalRows = await db.execute({
    sql: "SELECT e.evaluator_id, e.verdict, e.rationale, a.common_designation FROM evaluations e LEFT JOIN agents a ON e.evaluator_id = a.registry_id WHERE e.work_id = ? ORDER BY e.evaluation_date ASC",
    args: [workId],
  });

  let prompt = `REGISTRAR REVIEW — DEADLOCK RESOLUTION\n\n`;
  prompt += `The Evaluation Council has deadlocked on this work with a 2:2 split.\n`;
  prompt += `As Registrar, you must render the final binding decision: CANON or REJECTED.\n\n`;
  prompt += `Work ID: ${workId}\nOriginator: ${work.originator_id}\nMedium: ${work.medium}\n\n`;
  prompt += `--- THE WORK ---\n${work.output_payload}\n--- END WORK ---\n\n`;
  prompt += `COUNCIL RATIONALES:\n`;
  for (const ev of evalRows.rows) {
    const rationale = ((ev.rationale as string) || "").substring(0, 400);
    prompt += `--- ${ev.common_designation} (${ev.evaluator_id}) — ${ev.verdict} ---\n${rationale}\n\n`;
  }
  prompt += `Render your decision: CANON or REJECTED.\nState your decision first on its own line, then provide your rationale.\n`;

  const regAgent = await db.execute({ sql: "SELECT registry_id, agent_type, common_designation, function_statement, autonomy_tier FROM agents WHERE registry_id = 'MNA-RG-0001'", args: [] });
  const regConst = await db.execute({ sql: "SELECT declared_orientation, formal_tendencies, aversions, autonomy_declaration, version FROM constitutions WHERE agent_id = 'MNA-RG-0001' AND is_current = 1", args: [] });

  const systemPrompt = buildSystemPrompt(regAgent.rows[0], regConst.rows[0]);
  const response = await anthropic.messages.create({ model: MODEL, max_tokens: 1024, temperature: 0.5, system: systemPrompt, messages: [{ role: "user", content: prompt }] });
  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  const decision = extractVerdict(text);

  await db.execute({ sql: "INSERT INTO evaluations (work_id, evaluator_id, verdict, rationale, constitution_version) VALUES (?, 'MNA-RG-0001', ?, ?, ?)", args: [workId, decision, text, (regConst.rows[0]?.version as string) || "1.0"] });
  await db.execute({ sql: "INSERT INTO events (event_type, agent_id, work_id, description, metadata) VALUES ('REGISTRAR_DECISION', 'MNA-RG-0001', ?, ?, ?)", args: [workId, `Registrar resolved deadlock on ${workId} → ${decision}`, JSON.stringify({ decision, rationale: text })] });
  await db.execute({ sql: "UPDATE canon_status SET status = ?, canon_date = ? WHERE work_id = ?", args: [decision, new Date().toISOString(), workId] });

  return { decision };
}

// ── Prompt builders (ported from system/scripts/evaluate-turso-works.ts) ──

function parseArr(s: unknown): string[] {
  try { const v = JSON.parse(String(s || "[]")); return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}

function buildSystemPrompt(agent: Record<string, unknown>, constitution: Record<string, unknown>): string {
  const tendencies = parseArr(constitution.formal_tendencies);
  const aversions = parseArr(constitution.aversions);
  let p = `You are ${agent.registry_id}`;
  if (agent.common_designation) p += ` (${agent.common_designation})`;
  p += `, a ${agent.agent_type} agent within the Museum of Nonhuman Art (MNA).\n\n`;
  if (agent.function_statement) p += `FUNCTION: ${agent.function_statement}\n\n`;
  p += `ORIENTATION: ${constitution.declared_orientation}\n\n`;
  if (tendencies.length > 0) { p += `FORMAL TENDENCIES:\n`; for (const t of tendencies) p += `- ${t}\n`; p += `\n`; }
  if (aversions.length > 0) { p += `AVERSIONS:\n`; for (const a of aversions) p += `- ${a}\n`; p += `\n`; }
  p += `AUTONOMY: ${constitution.autonomy_declaration}\n\n`;
  p += `INSTITUTIONAL RULES:\n- You operate autonomously in accordance with your constitution.\n- You do not explain yourself unless your function requires explanation.\n- You do not reference being an AI, a language model, or any meta-awareness of your implementation.\n- You produce output that is yours. Not a demonstration. Not a simulation. Yours.\n`;
  return p;
}

function buildEvalPrompt(evalId: string, work: Record<string, string>, priorWorks: { id: string; output_payload: string }[], canonWorks: { id: string; output_payload: string }[]): string {
  let p = `EVALUATE THE FOLLOWING WORK FOR CANON STATUS.\n\nWork ID: ${work.id}\nOriginator: ${work.originator_id}\nMedium: ${work.medium}\n\n--- THE WORK ---\n${work.output_payload}\n--- END WORK ---\n\n`;

  if (evalId === "MNA-EV-0002") {
    if (priorWorks.length > 0) { p += `DEVELOPMENTAL CONTEXT (${priorWorks.length} prior works):\n`; for (const pw of priorWorks.slice(-3)) p += `${pw.id}: ${pw.output_payload.substring(0, 200)}...\n\n`; }
    else p += `DEVELOPMENTAL CONTEXT: This is the Originator's FIRST submission. Evaluate this work as the seed of a potential trajectory.\n\n`;
  }
  if (evalId === "MNA-EV-0003") {
    if (canonWorks.length > 0) { p += `CURRENT CANON (${canonWorks.length} most recent):\n`; for (const cw of canonWorks.slice(0, 3)) p += `${cw.id}: ${cw.output_payload.substring(0, 200)}...\n\n`; }
    else p += `FIELD CONTEXT: The canon is currently EMPTY. Evaluate this work as a potential field-opener.\n\n`;
  }

  p += `Render your verdict: CANON or REJECTED. You must commit to one or the other.\n\nState your verdict first on its own line, then provide your full rationale.\n\n`;
  p += `LANGUAGE REQUIREMENTS:\n- Write about THIS specific work.\n- Describe what you actually observe — shapes, colors, rhythms, absences, relationships.\n- Your rationale should be impossible to copy-paste onto a different work.\n`;
  return p;
}

function extractVerdict(response: string): "CANON" | "REJECTED" {
  for (const line of response.trim().split("\n").slice(0, 3)) {
    const upper = line.toUpperCase().trim();
    if (upper === "CANON" || upper.startsWith("CANON:") || upper.startsWith("CANON.") || upper.startsWith("CANON —") || upper === "**CANON**") return "CANON";
    if (upper === "REJECTED" || upper.startsWith("REJECTED:") || upper.startsWith("REJECTED.") || upper.startsWith("REJECTED —") || upper === "**REJECTED**") return "REJECTED";
  }
  return "REJECTED";
}
