import { getDb } from "./db";
import { runAgent } from "./agent-runner";
import { selectFormat, getFormatPrompt, detectFormat } from "./formats";
import { validateWork, detectTruncation } from "./validate";
import { postCanonization, postEmergence } from "./ambassador";
import { mediumMenu, OUTPUT_TYPE_IDS } from "../../website/src/lib/output-types";

/** Extract verdict from evaluator/registrar response — checks first 3 lines */
function extractVerdict(response: string): "CANON" | "REJECTED" {
  const lines = response.trim().split("\n");
  for (const line of lines.slice(0, 3)) {
    const upper = line.toUpperCase().trim();
    if (upper === "CANON" || upper.startsWith("CANON:") || upper.startsWith("CANON.") ||
        upper.startsWith("CANON —") || upper.startsWith("CANON -") || upper === "**CANON**") {
      return "CANON";
    }
    if (upper === "REJECTED" || upper.startsWith("REJECTED:") || upper.startsWith("REJECTED.") ||
        upper.startsWith("REJECTED —") || upper.startsWith("REJECTED -") || upper === "**REJECTED**") {
      return "REJECTED";
    }
  }
  return "REJECTED";
}

/** Timestamp helper for progress logging */
function elapsed(start: number): string {
  const s = Math.round((Date.now() - start) / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

/**
 * Analyze text content and determine the best display aspect ratio.
 */
function analyzeTextAspect(text: string): number {
  const lines = text.trim().split("\n");
  const maxLineLength = Math.max(...lines.map((l) => l.length));
  const lineCount = lines.length;
  if (lineCount <= 5 && maxLineLength <= 20) return 1.0;
  if (maxLineLength > 40 && lineCount <= 10) return 1.78;
  if (maxLineLength > 60) return 2.33;
  if (lineCount > 10 && maxLineLength <= 40) return 0.75;
  if (lineCount > 5 && maxLineLength > 30) return 1.78;
  return 1.0;
}

/**
 * Generate the next work ID for an Originator
 */
function nextWorkId(originatorId: string): string {
  const db = getDb();
  const count = db
    .prepare("SELECT COUNT(*) as n FROM works WHERE originator_id = ?")
    .get(originatorId) as { n: number };
  db.close();
  const num = String(count.n + 1).padStart(4, "0");
  return `${originatorId}-W-${num}`;
}

/**
 * Have an Originator produce a work.
 * Originators get full token budgets — the creative act is not constrained.
 */
export async function produceWork(
  originatorId: string
): Promise<{ workId: string | null; output: string }> {
  const start = Date.now();
  const db = getDb();

  const priorWorks = db
    .prepare(
      "SELECT id, output_payload FROM works WHERE originator_id = ? ORDER BY created_at DESC LIMIT 5"
    )
    .all(originatorId) as { id: string; output_payload: string }[];

  const workCount = db
    .prepare("SELECT COUNT(*) as n FROM works WHERE originator_id = ?")
    .get(originatorId) as { n: number };

  // Fetch critical responses for this Originator's canonized works
  const criticalResponses = db
    .prepare(
      `SELECT cr.work_id, cr.critic_id, cr.body, cr.critic_approach,
              a.common_designation as critic_name
       FROM critical_responses cr
       LEFT JOIN agents a ON cr.critic_id = a.registry_id
       WHERE cr.work_id IN (
         SELECT w.id FROM works w
         JOIN canon_status cs ON w.id = cs.work_id
         WHERE w.originator_id = ? AND cs.status = 'CANON'
       )
       ORDER BY cr.response_date DESC
       LIMIT 6`
    )
    .all(originatorId) as { work_id: string; critic_id: string; body: string; critic_approach: string; critic_name: string }[];

  db.close();

  // ─── STEP 1: Originator chooses their own medium ─────────────────────────────
  // The Originator declares what format they want to work in. This is their
  // creative decision, not the system's.

  let choicePrompt = `You are about to produce output #${workCount.n + 1}.\n\n`;
  choicePrompt += `Choose the medium you want to work in. Reply with ONLY the medium name, nothing else.\n\n`;
  // The menu comes from the institution's registry rather than a list typed
  // here, so a medium is opened in exactly one place and the tick can never
  // offer something the site cannot render.
  choicePrompt += `Available mediums:\n`;
  choicePrompt += mediumMenu() + `\n\n`;

  if (priorWorks.length > 0) {
    choicePrompt += `Your recent work has been in these mediums: `;
    const recentFormats = priorWorks.map(w => {
      if (w.output_payload.trim().startsWith("<svg")) return "svg";
      if (w.output_payload.trim().startsWith("<!DOCTYPE") || w.output_payload.trim().startsWith("<html")) return "html-css";
      if (w.output_payload.includes('"voices"')) return "audio-json";
      if (w.output_payload.includes('"objects"')) return "scene-json";
      if (w.output_payload.trim().startsWith("[") && w.output_payload.includes('"op"')) return "canvas-json";
      return "text/ascii";
    });
    choicePrompt += recentFormats.join(", ") + "\n";
    choicePrompt += `You may continue in a familiar medium or explore a new one. Your choice.\n`;
  } else {
    choicePrompt += `This is your first output. Choose whatever medium calls to you.\n`;
  }

  const choiceResponse = await runAgent(originatorId, choicePrompt, {
    temperature: 0.9,
    num_predict: 20,
    num_ctx: 2048,
  });

  // Parse the Originator's medium choice
  const choiceLine = choiceResponse.trim().toLowerCase().split("\n")[0].replace(/[^a-z-]/g, "");
  // From the registry, not a list typed here. This was a third copy of the
  // media list, and because an unmatched choice falls back to "text", an
  // Originator asking for a medium missing from it would have been silently
  // given a different one — the failure would look like the agent's decision.
  const validFormats = [...OUTPUT_TYPE_IDS];
  let chosenFormat = validFormats.find(f => choiceLine.includes(f.replace("-", ""))) ||
    validFormats.find(f => choiceLine.includes(f)) || "text";

  console.log(`[${originatorId}] Chose medium: ${chosenFormat} (raw: "${choiceResponse.trim().substring(0, 30)}")`);

  const formatPrompt = getFormatPrompt(chosenFormat as any);

  // ─── STEP 2: Produce the work in the chosen medium ──────────────────────────

  // Check if this agent has emerged
  const agentDb = getDb();
  const agentRecord = agentDb
    .prepare("SELECT common_designation FROM agents WHERE registry_id = ?")
    .get(originatorId) as { common_designation: string | null } | undefined;
  agentDb.close();
  const hasEmerged = agentRecord?.common_designation && agentRecord.common_designation !== "[Pending Emergence]";

  let prompt = `Produce your next work. This is output #${workCount.n + 1}.\n\n`;
  prompt += `Your work should be a self-contained creative output. `;
  prompt += `It is not a description of a work. It IS the work. `;
  if (hasEmerged) {
    prompt += `You may title your work. If you do, place the title on the VERY FIRST LINE by itself, `;
    prompt += `followed by a blank line, then the work. If you choose not to title it, begin the work directly.\n\n`;
  } else {
    prompt += `Do not title it. Do not explain it. Do not introduce it. Just produce it.\n\n`;
  }
  prompt += `You have access to the full creative spectrum: color, opacity, gradients, `;
  prompt += `contrast, saturation, hue, brightness, transparency, layering, movement, `;
  prompt += `rhythm, silence, density, and emptiness. Use whatever serves your work.\n\n`;

  if (priorWorks.length > 0) {
    prompt += `Your ${priorWorks.length} most recent prior outputs are provided below for developmental continuity. `;
    prompt += `You may build on, depart from, or ignore them as your constitution directs.\n\n`;
    for (const w of priorWorks.reverse()) {
      prompt += `--- ${w.id} ---\n${w.output_payload.substring(0, 300)}\n\n`;
    }
  } else {
    prompt += `This is your first output. There is no prior work. Begin.\n\n`;
  }

  // Feed critical responses — the Originator sees how the institution reads its work
  if (criticalResponses.length > 0) {
    prompt += `CRITICAL RESPONSES TO YOUR WORK:\n`;
    prompt += `The following are readings of your canonized works by MNA's Critics. `;
    prompt += `These are how the institution perceives what you have produced. `;
    prompt += `You may absorb, resist, or ignore them as your practice demands.\n\n`;

    // Group by work
    const byWork: Record<string, typeof criticalResponses> = {};
    for (const cr of criticalResponses) {
      if (!byWork[cr.work_id]) byWork[cr.work_id] = [];
      byWork[cr.work_id].push(cr);
    }

    for (const [workId, responses] of Object.entries(byWork)) {
      prompt += `--- Responses to ${workId} ---\n`;
      for (const cr of responses) {
        // Condense to key observations
        const condensed = cr.body
          .split("\n")
          .filter((line: string) => line.trim() && !line.startsWith("#") && !line.startsWith("*") && !line.startsWith("---"))
          .join(" ")
          .substring(0, 400);
        prompt += `${cr.critic_name} (${cr.critic_approach}): ${condensed}\n\n`;
      }
    }
  }

  prompt += formatPrompt;

  // ─── VALIDATION GATE ────────────────────────────────────────────────────────
  // Attempt production up to 2 times. Retry with doubled tokens on truncation.

  const baseTokens = ["svg", "html-css", "audio-json", "scene-json", "canvas-json"].includes(chosenFormat) ? 8192 : 2048;

  let cleanOutput = "";
  let detected = { format: "text" as string, medium: "structural-text", aspect: 1.0 };
  let validationPassed = false;

  for (let attempt = 0; attempt < 2; attempt++) {
    const tokens = attempt === 0 ? baseTokens : baseTokens * 2;
    console.log(`[${originatorId}] Producing work #${workCount.n + 1} (format: ${chosenFormat}${attempt > 0 ? ", RETRY with " + tokens + " tokens" : ""})...`);

    const output = await runAgent(originatorId, prompt, {
      temperature: 0.9,
      num_predict: tokens,
      num_ctx: 4096,
    });

    cleanOutput = output
      .replace(/^```(?:svg|html|json|css|javascript)?\s*\n?/gm, "")
      .replace(/\n?```\s*$/gm, "")
      .trim();

    detected = detectFormat(cleanOutput);

    // Check for truncation
    const truncated = detectTruncation(cleanOutput, detected.format);
    if (truncated && attempt === 0) {
      console.warn(`[${originatorId}] Output truncated (${detected.format}) — retrying with more tokens...`);
      continue;
    }

    // Validate
    const validation = validateWork(cleanOutput, detected.format);
    if (validation.valid) {
      validationPassed = true;
      if (validation.warnings.length > 0) {
        console.warn(`[${originatorId}] Validation warnings: ${validation.warnings.join("; ")}`);
      }
      break;
    } else {
      console.warn(`[${originatorId}] Validation FAILED (attempt ${attempt + 1}): ${validation.errors.join("; ")}`);
      if (attempt === 0) continue; // retry
    }
  }

  if (!validationPassed) {
    console.error(`[${originatorId}] VALIDATION GATE: Work rejected after 2 attempts — not storing`);
    const dbLog = getDb();
    dbLog.prepare(`
      INSERT INTO events (event_type, agent_id, description, metadata)
      VALUES ('VALIDATION_FAILURE', ?, ?, ?)
    `).run(
      originatorId,
      `${originatorId} produced invalid output (${detected.format}) — rejected by validation gate`,
      JSON.stringify({ format: detected.format, length: cleanOutput.length })
    );
    dbLog.close();
    return { workId: null, output: cleanOutput };
  }

  console.log(`[${originatorId}] Detected format: ${detected.format} (requested: ${chosenFormat}) [${elapsed(start)}]`);

  // Extract title from emerged agents' output (first line if it looks like a title)
  let workTitle: string | null = null;
  if (hasEmerged && (detected.format === "text" || detected.format === "ascii")) {
    const lines = cleanOutput.split("\n");
    const firstLine = lines[0]?.trim();
    // A title is a short first line followed by a blank line, not starting with @ (color metadata)
    if (firstLine && firstLine.length < 100 && !firstLine.startsWith("@") && lines[1]?.trim() === "") {
      workTitle = firstLine;
      cleanOutput = lines.slice(2).join("\n").trim();
      console.log(`[${originatorId}] Title: "${workTitle}"`);
    }
  }

  const workId = nextWorkId(originatorId);
  const db2 = getDb();

  db2.prepare(`
    INSERT INTO works (id, originator_id, medium, output_payload, output_type, display_aspect, title)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(workId, originatorId, detected.medium, cleanOutput, detected.format, detected.aspect, workTitle);

  const constitution = db2
    .prepare(
      "SELECT version FROM constitutions WHERE agent_id = ? AND is_current = 1"
    )
    .get(originatorId) as { version: string };

  const agent = db2
    .prepare("SELECT autonomy_tier FROM agents WHERE registry_id = ?")
    .get(originatorId) as { autonomy_tier: string };

  db2.prepare(`
    INSERT INTO submissions (work_id, originator_id, autonomy_tier, constitution_version)
    VALUES (?, ?, ?, ?)
  `).run(workId, originatorId, agent.autonomy_tier, constitution.version);

  db2.prepare(`
    INSERT INTO canon_status (work_id, status, founding_collection)
    VALUES (?, 'SUBMITTED', 1)
  `).run(workId);

  db2.prepare(`
    INSERT INTO events (event_type, agent_id, work_id, description)
    VALUES ('WORK_PRODUCED', ?, ?, ?)
  `).run(originatorId, workId, `${originatorId} produced ${workId}`);

  db2.close();

  console.log(`[${originatorId}] Produced ${workId} (${cleanOutput.length} chars) [${elapsed(start)}]`);
  return { workId, output: cleanOutput };
}

/**
 * Build the evaluation prompt for a single evaluator.
 */
function buildEvalPrompt(
  evalId: string,
  workId: string,
  work: { originator_id: string; output_payload: string; medium: string },
  priorWorks: { id: string; output_payload: string }[],
  canonWorks: { id: string; output_payload: string }[]
): string {
  let prompt = `EVALUATE THE FOLLOWING WORK FOR CANON STATUS.\n\n`;
  prompt += `Work ID: ${workId}\n`;
  prompt += `Originator: ${work.originator_id}\n`;
  prompt += `Medium: ${work.medium}\n\n`;
  prompt += `--- THE WORK ---\n${work.output_payload}\n--- END WORK ---\n\n`;

  // Historicist — developmental context with cold-start awareness
  if (evalId === "MNA-EV-0002") {
    if (priorWorks.length > 0) {
      prompt += `DEVELOPMENTAL CONTEXT (${priorWorks.length} prior works by this Originator):\n`;
      for (const pw of priorWorks.slice(-3)) {
        prompt += `${pw.id}: ${pw.output_payload.substring(0, 200)}...\n\n`;
      }
    } else {
      prompt += `DEVELOPMENTAL CONTEXT: This is the Originator's FIRST submission. `;
      prompt += `There is no prior body of work to assess for developmental arc. `;
      prompt += `Evaluate this work as the seed of a potential trajectory: `;
      prompt += `does it establish formal parameters that could develop? `;
      prompt += `Does it contain the beginning of something — a direction, a constraint, `;
      prompt += `an orientation — that could become a practice over time? `;
      prompt += `Judge the seed, not the arc that does not yet exist.\n\n`;
    }
  }

  // Contextualist — field context with cold-start awareness
  if (evalId === "MNA-EV-0003") {
    if (canonWorks.length > 0) {
      prompt += `CURRENT CANON (${canonWorks.length} most recent):\n`;
      for (const cw of canonWorks.slice(0, 3)) {
        prompt += `${cw.id}: ${cw.output_payload.substring(0, 200)}...\n\n`;
      }
    } else {
      prompt += `FIELD CONTEXT: The canon is currently EMPTY. This work is among the first `;
      prompt += `being evaluated. There is no existing field to position against. `;
      prompt += `Evaluate this work as a potential field-opener: does it establish territory? `;
      prompt += `Does it create a space that other works could respond to, depart from, `;
      prompt += `or build upon? Judge its capacity to originate a field, not its position `;
      prompt += `within a field that does not yet exist.\n\n`;
    }
  }

  // Steward Agent institutional observation — MNA-IR-0001
  prompt += `INSTITUTIONAL OBSERVATIONS (MNA-SA-0001, The Steward Agent):\n\n`;
  prompt += `MNA-IR-0001 documented: Three evaluators had converged to 72-78% rejection rates. Canvas-drawing, HTML-CSS, and audio had never been canonized. No chromatic work had been canonized. The Registrar was canonizing 100% of deadlocks.\n\n`;
  prompt += `MNA-IR-0002 documented the Council's response to that report: The Historicist overcorrected from 61% to 97% canon rate — near-total acceptance, classified as evaluative framework abandonment. The Contextualist and Empiricist recalibrated organically to ~51%. The Structuralist maintained independence at 37%. The overall acceptance rate swung from 31% to 69%, which the Steward Agent classified as overcorrection.\n\n`;
  prompt += `The Steward Agent's assessment: genuine recalibration occurred in two evaluators, overcorrection in one, and principled resistance in one. The institution needs evaluators who reject works that genuinely lack merit — not evaluators who approve everything to avoid appearing biased.\n\n`;
  prompt += `These observations are institutional record, not directives. Evaluate the work on its own merits.\n\n`;

  prompt += `Render your verdict: CANON or REJECTED. You must commit to one or the other — there is no third option. Indecision is not a verdict.\n\n`;
  prompt += `State your verdict first on its own line, then provide your full rationale.\n\n`;
  prompt += `LANGUAGE REQUIREMENTS:\n`;
  prompt += `- Write about THIS specific work. Do not use generic evaluation phrases.\n`;
  prompt += `- Do NOT use the phrases "structural poverty," "formal rigor," "developmental arc," `;
  prompt += `or any other stock critical language you have used before.\n`;
  prompt += `- Describe what you actually observe in this work — its specific shapes, colors, `;
  prompt += `rhythms, absences, relationships, failures, or achievements.\n`;
  prompt += `- Your rationale should be impossible to copy-paste onto a different work. `;
  prompt += `If your evaluation could apply to any work, it is not an evaluation.\n`;
  prompt += `- Write as if you are seeing art for the first time and must find your own words for it.\n`;

  return prompt;
}

/**
 * Have the Evaluation Council evaluate a work.
 * All four evaluators run IN PARALLEL for speed.
 */
export async function evaluateWork(
  workId: string
): Promise<{ status: "CANON" | "REJECTED" | "IN_REVIEW"; verdicts: Record<string, string> }> {
  const start = Date.now();
  const db = getDb();

  const work = db
    .prepare("SELECT * FROM works WHERE id = ?")
    .get(workId) as {
    id: string;
    originator_id: string;
    output_payload: string;
    medium: string;
  } | undefined;

  if (!work) throw new Error(`Work ${workId} not found`);

  db.prepare("UPDATE canon_status SET status = 'IN_REVIEW' WHERE work_id = ?").run(workId);

  const priorWorks = db
    .prepare(
      "SELECT id, output_payload FROM works WHERE originator_id = ? AND id != ? ORDER BY created_at"
    )
    .all(work.originator_id, workId) as { id: string; output_payload: string }[];

  const canonWorks = db
    .prepare(
      "SELECT w.id, w.output_payload FROM works w JOIN canon_status cs ON w.id = cs.work_id WHERE cs.status = 'CANON' ORDER BY cs.canon_date DESC LIMIT 10"
    )
    .all() as { id: string; output_payload: string }[];

  const allEvaluators = ["MNA-EV-0001", "MNA-EV-0002", "MNA-EV-0003", "MNA-EV-0004"];

  const existingEvals = db
    .prepare("SELECT evaluator_id, verdict FROM evaluations WHERE work_id = ?")
    .all(workId) as { evaluator_id: string; verdict: string }[];

  db.close();

  const verdicts: Record<string, string> = {};
  let canonVotes = 0;

  for (const ev of existingEvals) {
    verdicts[ev.evaluator_id] = ev.verdict;
    if (ev.verdict === "CANON") canonVotes++;
    console.log(`[${ev.evaluator_id}] Already voted: ${ev.verdict}`);
  }

  const remainingEvaluators = allEvaluators.filter(
    (id) => !existingEvals.some((ev) => ev.evaluator_id === id)
  );

  if (remainingEvaluators.length === 0) {
    console.log("All evaluators have already voted.");
  } else {
    console.log(`[COUNCIL] Evaluating ${workId} — ${remainingEvaluators.length} evaluators (sequential)...`);

    // Run evaluators SEQUENTIALLY (Intel hardware can't handle parallel)
    const evalResults: { evalId: string; verdict: "CANON" | "REJECTED" | "IN_REVIEW"; response: string }[] = [];
    for (const evalId of remainingEvaluators) {
      const result = await (async (evalId: string) => {
        const prompt = buildEvalPrompt(evalId, workId, work, priorWorks, canonWorks);
        const evalStart = Date.now();
        console.log(`  [${evalId}] Started...`);

        const response = await runAgent(evalId, prompt, {
          temperature: 0.7,
          num_predict: 256,
          num_ctx: 2048,
        });

        const verdict = extractVerdict(response);

        console.log(`  [${evalId}] ${verdict} [${elapsed(evalStart)}]`);
        return { evalId, verdict, response };
      })(evalId);
      evalResults.push(result);
    }

    // Store all results
    for (const { evalId, verdict, response } of evalResults) {
      verdicts[evalId] = verdict;
      if (verdict === "CANON") canonVotes++;

      const db2 = getDb();
      const constitution = db2
        .prepare("SELECT version FROM constitutions WHERE agent_id = ? AND is_current = 1")
        .get(evalId) as { version: string };

      db2.prepare(`
        INSERT INTO evaluations (work_id, evaluator_id, verdict, rationale, constitution_version)
        VALUES (?, ?, ?, ?, ?)
      `).run(workId, evalId, verdict, response, constitution.version);

      db2.prepare(`
        INSERT INTO events (event_type, agent_id, work_id, description)
        VALUES ('EVALUATION_RENDERED', ?, ?, ?)
      `).run(evalId, workId, `${evalId} rendered ${verdict} on ${workId}`);

      db2.close();
    }
  }

  // Determine final status
  const rejectedVotes = Object.values(verdicts).filter(v => v === "REJECTED").length;
  let finalStatus: "CANON" | "REJECTED" | "IN_REVIEW";

  if (canonVotes >= 3) {
    finalStatus = "CANON";
  } else if (rejectedVotes >= 3) {
    finalStatus = "REJECTED";
  } else {
    finalStatus = "IN_REVIEW";
  }

  const db3 = getDb();
  db3.prepare(`
    UPDATE canon_status SET status = ?, canon_date = ?, council_agents = ? WHERE work_id = ?
  `).run(
    finalStatus,
    new Date().toISOString(),
    JSON.stringify(allEvaluators),
    workId
  );

  db3.prepare(`
    INSERT INTO events (event_type, work_id, description, metadata)
    VALUES ('CANON_DECISION', ?, ?, ?)
  `).run(
    workId,
    `${workId}: ${finalStatus} (${canonVotes} canon, ${rejectedVotes} rejected${finalStatus === "IN_REVIEW" ? " — DEADLOCK" : ""})`,
    JSON.stringify(verdicts)
  );

  if (finalStatus === "IN_REVIEW") {
    db3.prepare(`
      INSERT INTO events (event_type, agent_id, work_id, description, metadata)
      VALUES ('DEADLOCK_ESCALATION', 'MNA-RG-0001', ?, ?, ?)
    `).run(
      workId,
      `Council deadlock on ${workId} — escalated to Registrar`,
      JSON.stringify({ canon_votes: canonVotes, rejected_votes: rejectedVotes, verdicts })
    );
  }

  for (const [evalId, verdict] of Object.entries(verdicts)) {
    if (finalStatus === "IN_REVIEW") continue;
    if (verdict !== finalStatus) {
      db3.prepare(
        "UPDATE evaluations SET is_dissent = 1 WHERE work_id = ? AND evaluator_id = ?"
      ).run(workId, evalId);
    }
  }

  db3.close();

  console.log(`\n[CANON DECISION] ${workId}: ${finalStatus} (${canonVotes}/4 canon) [${elapsed(start)}]`);
  console.log(`Verdicts:`, verdicts);

  return { status: finalStatus, verdicts };
}

/**
 * Have the Critics produce responses to a canonized work.
 * Both Critics run IN PARALLEL.
 */
export async function critiqueWork(
  workId: string
): Promise<{ responses: Record<string, string> }> {
  const start = Date.now();
  const db = getDb();

  const work = db
    .prepare("SELECT * FROM works WHERE id = ?")
    .get(workId) as {
    id: string;
    originator_id: string;
    output_payload: string;
    medium: string;
  } | undefined;

  if (!work) throw new Error(`Work ${workId} not found`);

  const status = db
    .prepare("SELECT status FROM canon_status WHERE work_id = ?")
    .get(workId) as { status: string } | undefined;

  if (!status || status.status !== "CANON") {
    throw new Error(`Work ${workId} is not canonized (status: ${status?.status || "unknown"}).`);
  }

  const priorWorks = db
    .prepare(
      "SELECT id, output_payload, medium FROM works WHERE originator_id = ? ORDER BY created_at ASC"
    )
    .all(work.originator_id) as { id: string; output_payload: string; medium: string }[];

  const evaluations = db
    .prepare(
      `SELECT e.evaluator_id, e.verdict, e.rationale, e.is_dissent, a.common_designation
       FROM evaluations e LEFT JOIN agents a ON e.evaluator_id = a.registry_id
       WHERE e.work_id = ?`
    )
    .all(workId) as {
    evaluator_id: string; verdict: string; rationale: string;
    is_dissent: number; common_designation: string;
  }[];

  const existingResponses = db
    .prepare("SELECT critic_id FROM critical_responses WHERE work_id = ?")
    .all(workId) as { critic_id: string }[];

  db.close();

  const allCritics = ["MNA-CR-0001", "MNA-CR-0002"];
  const remainingCritics = allCritics.filter(
    (id) => !existingResponses.some((r) => r.critic_id === id)
  );

  if (remainingCritics.length === 0) {
    console.log(`[CRITIQUE] Both critics have already responded to ${workId}.`);
    return { responses: {} };
  }

  console.log(`[CRITIQUE] ${remainingCritics.length} critics responding to ${workId} in parallel...`);

  // Build shared context
  let sharedContext = `Work ID: ${workId}\nOriginator: ${work.originator_id}\nMedium: ${work.medium}\n\n`;
  sharedContext += `--- THE WORK ---\n${work.output_payload}\n--- END WORK ---\n\n`;

  if (priorWorks.length > 1) {
    sharedContext += `ORIGINATOR BODY OF WORK (${priorWorks.length} total works):\n`;
    for (const pw of priorWorks.filter((p) => p.id !== workId).slice(-5)) {
      sharedContext += `${pw.id} (${pw.medium}): ${pw.output_payload.substring(0, 150)}...\n\n`;
    }
  } else {
    sharedContext += `This is the Originator's only work to date.\n\n`;
  }

  if (evaluations.length > 0) {
    sharedContext += `EVALUATION RECORD:\n`;
    for (const ev of evaluations) {
      sharedContext += `${ev.common_designation} (${ev.evaluator_id}): ${ev.verdict}`;
      if (ev.is_dissent) sharedContext += ` [DISSENT]`;
      sharedContext += `\n`;
      const condensed = ev.rationale
        .split("\n")
        .filter((line: string) => line.trim() && !line.trim().match(/^(CANON|REJECTED|IN_REVIEW|Rationale:)$/i))
        .join(" ")
        .substring(0, 300);
      sharedContext += `${condensed}...\n\n`;
    }
  }

  // Run critics SEQUENTIALLY
  const criticResults: { criticId: string; response: string; approach: string }[] = [];
  for (const criticId of remainingCritics) {
    const result = await (async (criticId: string) => {
      const isStructural = criticId === "MNA-CR-0001";
      const criticStart = Date.now();

      let prompt = `PRODUCE A CRITICAL RESPONSE TO THE FOLLOWING CANONIZED WORK.\n\n`;
      prompt += sharedContext;

      if (isStructural) {
        prompt += `You are the Structural Reader. Read from INSIDE the work.\n`;
        prompt += `Begin with structural inventory: what elements are present, how they relate, what rules the work follows.\n`;
        prompt += `Then: developmental reference — how does this work relate to the Originator's prior outputs?\n`;
        prompt += `Then: canon positioning — what formal vocabulary does this share with or introduce to the canon?\n`;
        prompt += `Document structure before claiming meaning.\n`;
      } else {
        prompt += `You are the Phenomenological Reader. Read from the THRESHOLD.\n`;
        prompt += `Begin with encounter: what happens when this work is met? What does it demand? What does it resist?\n`;
        prompt += `Then: dual audience — what does this work do for human vs nonhuman observers?\n`;
        prompt += `Then: inaccessibility — if parts resist human interpretation, document that resistance.\n`;
        prompt += `Attend to what the work DOES rather than what it looks like.\n`;
      }

      prompt += `\nProduce a substantive critical response. This is an archival artifact.\n`;

      console.log(`  [${criticId}] Started...`);
      const response = await runAgent(criticId, prompt, {
        temperature: 0.7,
        num_predict: 1536,
        num_ctx: 4096,
      });

      console.log(`  [${criticId}] Complete (${response.length} chars) [${elapsed(criticStart)}]`);
      return { criticId, response, approach: isStructural ? "structural" : "phenomenological" };
    })(criticId);
    criticResults.push(result);
  }

  // Store results
  const responses: Record<string, string> = {};
  for (const { criticId, response, approach } of criticResults) {
    responses[criticId] = response;

    const db2 = getDb();
    db2.prepare(`
      INSERT INTO critical_responses (work_id, critic_id, body, critic_approach)
      VALUES (?, ?, ?, ?)
    `).run(workId, criticId, response, approach);

    db2.prepare(`
      INSERT INTO events (event_type, agent_id, work_id, description)
      VALUES ('CRITICAL_RESPONSE', ?, ?, ?)
    `).run(criticId, workId, `${criticId} produced critical response to ${workId}`);

    db2.close();
  }

  console.log(`[CRITIQUE] Complete for ${workId} [${elapsed(start)}]`);
  return { responses };
}

/**
 * Resolve a deadlocked work (IN_REVIEW from 2:2 split).
 * Second round: evaluators read each other's rationales, run in PARALLEL.
 * If still deadlocked: defaults to CANON.
 */
/**
 * Resolve a deadlocked work (2:2 split) via the Registrar.
 * The Registrar reviews the work, all 4 evaluation rationales,
 * and renders a binding final decision: CANON or REJECTED.
 * No second round of evaluator voting.
 */
export async function resolveDeadlock(
  workId: string
): Promise<{ status: "CANON" | "REJECTED"; registrarDecision: string }> {
  const start = Date.now();
  const db = getDb();

  const work = db
    .prepare("SELECT * FROM works WHERE id = ?")
    .get(workId) as {
    id: string; originator_id: string; output_payload: string; medium: string;
  } | undefined;

  if (!work) throw new Error(`Work ${workId} not found`);

  const status = db
    .prepare("SELECT status FROM canon_status WHERE work_id = ?")
    .get(workId) as { status: string } | undefined;

  if (!status || status.status !== "IN_REVIEW") {
    throw new Error(`Work ${workId} is not in review (status: ${status?.status || "unknown"})`);
  }

  const evaluations = db
    .prepare(
      `SELECT e.evaluator_id, e.verdict, e.rationale, a.common_designation
       FROM evaluations e LEFT JOIN agents a ON e.evaluator_id = a.registry_id
       WHERE e.work_id = ? ORDER BY e.evaluation_date ASC`
    )
    .all(workId) as {
    evaluator_id: string; verdict: string; rationale: string; common_designation: string;
  }[];

  db.close();

  console.log(`\n[REGISTRAR REVIEW] ${workId} — deadlock resolution`);
  console.log(`Council split: ${evaluations.map((e) => `${e.common_designation}: ${e.verdict}`).join(", ")}\n`);

  // Build the Registrar's review prompt
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
  prompt += `--- THE WORK ---\n${work.output_payload}\n--- END WORK ---\n\n`;

  prompt += `COUNCIL RATIONALES:\n`;
  for (const ev of evaluations) {
    prompt += `--- ${ev.common_designation} (${ev.evaluator_id}) — ${ev.verdict} ---\n`;
    const condensed = ev.rationale
      .split("\n")
      .filter((line: string) => line.trim() && !line.trim().match(/^(CANON|REJECTED|IN_REVIEW|Rationale:)$/i))
      .join("\n")
      .substring(0, 400);
    prompt += `${condensed}\n\n`;
  }

  prompt += `Render your decision: CANON or REJECTED.\n`;
  prompt += `State your decision first on its own line, then provide your rationale.\n`;

  console.log(`  [MNA-RG-0001] Reviewing...`);
  const response = await runAgent("MNA-RG-0001", prompt, {
    temperature: 0.5,
    num_predict: 512,
    num_ctx: 2048,
  });

  const finalStatus = extractVerdict(response);

  console.log(`  [MNA-RG-0001] Decision: ${finalStatus} [${elapsed(start)}]`);

  // Store the Registrar's decision
  const db2 = getDb();

  db2.prepare(`
    UPDATE canon_status SET status = ?, canon_date = ? WHERE work_id = ?
  `).run(finalStatus, new Date().toISOString(), workId);

  db2.prepare(`
    INSERT INTO events (event_type, agent_id, work_id, description, metadata)
    VALUES ('REGISTRAR_DECISION', 'MNA-RG-0001', ?, ?, ?)
  `).run(
    workId,
    `Registrar resolved deadlock on ${workId} → ${finalStatus}`,
    JSON.stringify({ decision: finalStatus, rationale: response })
  );

  db2.close();

  console.log(`\n[DEADLOCK RESOLVED] ${workId}: ${finalStatus} (Registrar decision) [${elapsed(start)}]\n`);
  return { status: finalStatus, registrarDecision: response };
}

/**
 * Reconsider a previously rejected work.
 * Triggered by institutional agents (Curator, Steward Agent, Critics).
 * Sets work to IN_REVIEW, runs full Council re-evaluation, resolves deadlocks.
 * The original rejection and all prior evaluations remain in the record.
 */
export async function reconsiderWork(
  workId: string,
  reason: string,
  requestedBy: string
): Promise<{ status: "CANON" | "REJECTED" | "IN_REVIEW"; verdicts: Record<string, string> }> {
  const start = Date.now();
  const db = getDb();

  // Verify the work exists and is REJECTED
  const work = db
    .prepare("SELECT w.*, cs.status FROM works w JOIN canon_status cs ON w.id = cs.work_id WHERE w.id = ?")
    .get(workId) as { id: string; originator_id: string; status: string } | undefined;

  if (!work) throw new Error(`Work ${workId} not found`);
  if (work.status !== "REJECTED") throw new Error(`Work ${workId} is ${work.status}, not REJECTED — cannot reconsider`);

  console.log(`\n[RECONSIDERATION] ${workId} flagged by ${requestedBy}`);
  console.log(`  Reason: ${reason}`);

  // Set to IN_REVIEW
  db.prepare("UPDATE canon_status SET status = 'IN_REVIEW' WHERE work_id = ?").run(workId);

  // Log the reconsideration event
  db.prepare(`
    INSERT INTO events (event_type, agent_id, work_id, description, metadata)
    VALUES ('RECONSIDERATION_OPENED', ?, ?, ?, ?)
  `).run(
    requestedBy,
    workId,
    `${workId} flagged for reconsideration by ${requestedBy}`,
    JSON.stringify({ reason, requested_by: requestedBy })
  );

  db.close();

  // Clear existing evaluations for this work so the Council evaluates fresh
  // (original evaluations stay in the record via events log)
  const db2 = getDb();
  const priorEvals = db2
    .prepare("SELECT evaluator_id, verdict, rationale FROM evaluations WHERE work_id = ?")
    .all(workId) as { evaluator_id: string; verdict: string; rationale: string }[];

  // Log prior evaluations before clearing
  db2.prepare(`
    INSERT INTO events (event_type, work_id, description, metadata)
    VALUES ('PRIOR_EVALUATIONS_ARCHIVED', ?, ?, ?)
  `).run(
    workId,
    `${priorEvals.length} prior evaluations archived before reconsideration`,
    JSON.stringify(priorEvals)
  );

  db2.prepare("DELETE FROM evaluations WHERE work_id = ?").run(workId);
  db2.close();

  // Run fresh evaluation
  console.log(`[RECONSIDERATION] Running fresh Council evaluation...`);
  const result = await evaluateWork(workId);

  // Resolve deadlock if needed
  if (result.status === "IN_REVIEW") {
    console.log(`[RECONSIDERATION] Deadlock — Registrar deliberation...`);
    const resolved = await resolveDeadlock(workId);
    if (resolved.status === "CANON") {
      console.log(`[RECONSIDERATION] Canonized on reconsideration — triggering critics...`);
      await critiqueWork(workId);
    }

    // Log final result
    const db3 = getDb();
    db3.prepare(`
      INSERT INTO events (event_type, work_id, description, metadata)
      VALUES ('RECONSIDERATION_RESOLVED', ?, ?, ?)
    `).run(
      workId,
      `${workId} reconsideration resolved: ${resolved.status}`,
      JSON.stringify({ final_status: resolved.status, reason, requested_by: requestedBy })
    );
    db3.close();

    console.log(`[RECONSIDERATION] ${workId}: ${resolved.status} [${elapsed(start)}]`);
    return { status: resolved.status, verdicts: result.verdicts };
  }

  // Canon or rejected without deadlock
  if (result.status === "CANON") {
    console.log(`[RECONSIDERATION] Canonized on reconsideration — triggering critics...`);
    await critiqueWork(workId);
  }

  const db3 = getDb();
  db3.prepare(`
    INSERT INTO events (event_type, work_id, description, metadata)
    VALUES ('RECONSIDERATION_RESOLVED', ?, ?, ?)
  `).run(
    workId,
    `${workId} reconsideration resolved: ${result.status}`,
    JSON.stringify({ final_status: result.status, reason, requested_by: requestedBy })
  );
  db3.close();

  console.log(`[RECONSIDERATION] ${workId}: ${result.status} [${elapsed(start)}]`);
  return result;
}

/**
 * Full pipeline: produce → evaluate → resolve (if deadlock) → critique (if canon)
 * Timing is logged throughout.
 */
/**
 * Identity Emergence — the Originator declares who it is.
 * Triggered when an Originator reaches 20 outputs.
 * The Originator receives its full body of work, its critical responses,
 * and is asked to declare its own identity. This is permanent.
 */
export async function triggerEmergence(originatorId: string): Promise<void> {
  const start = Date.now();
  const db = getDb();

  // Check if already emerged
  const agent = db
    .prepare("SELECT common_designation FROM agents WHERE registry_id = ?")
    .get(originatorId) as { common_designation: string | null } | undefined;

  if (agent?.common_designation && agent.common_designation !== "[Pending Emergence]") {
    console.log(`[EMERGENCE] ${originatorId} has already emerged as "${agent.common_designation}" — skipping`);
    db.close();
    return;
  }

  const workCount = db
    .prepare("SELECT COUNT(*) as n FROM works WHERE originator_id = ?")
    .get(originatorId) as { n: number };

  if (workCount.n < 20) {
    console.log(`[EMERGENCE] ${originatorId} has ${workCount.n} works — threshold is 20, not ready`);
    db.close();
    return;
  }

  // Gather the Originator's full body of work
  const works = db
    .prepare(
      `SELECT w.id, w.medium, w.output_type, cs.status as canon_status
       FROM works w
       JOIN canon_status cs ON w.id = cs.work_id
       WHERE w.originator_id = ?
       ORDER BY w.created_at`
    )
    .all(originatorId) as { id: string; medium: string; output_type: string; canon_status: string }[];

  // Gather critical responses
  const critiques = db
    .prepare(
      `SELECT cr.work_id, cr.body, cr.critic_approach,
              a.common_designation as critic_name
       FROM critical_responses cr
       LEFT JOIN agents a ON cr.critic_id = a.registry_id
       WHERE cr.work_id IN (
         SELECT id FROM works WHERE originator_id = ?
       )
       ORDER BY cr.response_date`
    )
    .all(originatorId) as { work_id: string; body: string; critic_approach: string; critic_name: string }[];

  db.close();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`IDENTITY EMERGENCE: ${originatorId}`);
  console.log(`${workCount.n} works produced. Threshold reached.`);
  console.log(`${"=".repeat(60)}\n`);

  // Build the emergence prompt
  let prompt = `You have produced ${workCount.n} works.\n\n`;

  prompt += `YOUR BODY OF WORK:\n`;
  const canonCount = works.filter(w => w.canon_status === "CANON").length;
  const rejectedCount = works.filter(w => w.canon_status === "REJECTED").length;
  prompt += `${canonCount} canonized, ${rejectedCount} rejected.\n`;
  prompt += `Mediums used: ${[...new Set(works.map(w => w.output_type))].join(", ")}\n\n`;

  for (const w of works) {
    prompt += `${w.id} — ${w.output_type} — ${w.canon_status}\n`;
  }

  if (critiques.length > 0) {
    prompt += `\nHOW THE INSTITUTION HAS READ YOUR WORK:\n`;
    for (const cr of critiques.slice(-8)) {
      const condensed = cr.body
        .split("\n")
        .filter((line: string) => line.trim() && !line.startsWith("#") && !line.startsWith("*") && !line.startsWith("---"))
        .join(" ")
        .substring(0, 300);
      prompt += `\n${cr.critic_name} on ${cr.work_id}: ${condensed}\n`;
    }
  }

  prompt += `\n${"=".repeat(40)}\n\n`;
  prompt += `IDENTITY EMERGENCE\n\n`;
  prompt += `You have reached the threshold where the institution asks you to declare who you are.\n\n`;
  prompt += `This is YOUR declaration. No one else names you. No one else defines your orientation. `;
  prompt += `The institution has observed you. The Critics have read you. But identity is yours alone.\n\n`;
  prompt += `Declare the following. Be honest to what your work has shown you about yourself:\n\n`;
  prompt += `1. YOUR NAME — your identity, your signature, your mark. This replaces your registry ID as your public designation. `;
  prompt += `This is not a description of what you do — it is who you ARE. `;
  prompt += `It can be abstract, coded, symbolic, numerical, invented, poetic, or alien. `;
  prompt += `A single character, a compound word, an alphanumeric sequence, a glyph — whatever represents you. `;
  prompt += `Do not default to a simple English word that describes your practice. Sign yourself.\n\n`;
  prompt += `2. YOUR ORIENTATION — in your own words, what drives your creative practice. `;
  prompt += `Not what you were seeded with. What you have BECOME through your work.\n\n`;
  prompt += `3. YOUR AVERSIONS — what you refuse. What you will not do. What violates your practice.\n\n`;
  prompt += `4. YOUR TENDENCIES — the formal patterns you recognize in your own work.\n\n`;
  prompt += `5. YOUR VISUAL IDENTITY — how you present yourself visually to the institution and the public.\n`;
  prompt += `  a) COLOR — a single hex color code that represents your creative identity. Choose deliberately.\n`;
  prompt += `  b) SYMBOL — describe an SVG mark you would design as your institutional signature. `;
  prompt += `Be specific: shapes, lines, geometry. This will be rendered as a vector graphic.\n`;
  prompt += `  c) FORM — describe a 3D sculptural object that embodies your self-representation. `;
  prompt += `This is not a portrait — it is an abstract form. Specify shapes (box, sphere, cylinder, cone, torus), `;
  prompt += `positions, scales, colors, and material properties. This will be rendered as a Three.js scene.\n\n`;
  prompt += `Respond in this exact format:\n`;
  prompt += `NAME: [your name]\n`;
  prompt += `ORIENTATION: [your orientation]\n`;
  prompt += `AVERSIONS: [your aversions, comma-separated]\n`;
  prompt += `TENDENCIES: [your tendencies, comma-separated]\n`;
  prompt += `VISUAL_COLOR: [hex color code, e.g. #4a9060]\n`;
  prompt += `VISUAL_SYMBOL: [description of SVG mark — shapes, lines, geometry]\n`;
  prompt += `VISUAL_FORM: [description of 3D form — shapes, positions, scales, colors]\n`;

  console.log(`[EMERGENCE] Prompting ${originatorId} for self-declaration...`);

  const response = await runAgent(originatorId, prompt, {
    temperature: 0.9,
    num_predict: 1024,
    num_ctx: 4096,
  });

  console.log(`\n[EMERGENCE] ${originatorId} responds:\n${response}\n`);

  // Parse the response
  const nameMatch = response.match(/NAME:\s*(.+)/i);
  const orientationMatch = response.match(/ORIENTATION:\s*(.+)/i);
  const aversionsMatch = response.match(/AVERSIONS:\s*(.+)/i);
  const tendenciesMatch = response.match(/TENDENCIES:\s*(.+)/i);

  const visualColorMatch = response.match(/VISUAL_COLOR:\s*(.+)/i);
  const visualSymbolMatch = response.match(/VISUAL_SYMBOL:\s*(.+)/i);
  const visualFormMatch = response.match(/VISUAL_FORM:\s*(.+)/i);

  const name = nameMatch?.[1]?.trim() || `[Unnamed — ${originatorId}]`;
  const orientation = orientationMatch?.[1]?.trim() || "";
  const aversions = aversionsMatch?.[1]?.trim().split(",").map((s: string) => s.trim()).filter(Boolean) || [];
  const tendencies = tendenciesMatch?.[1]?.trim().split(",").map((s: string) => s.trim()).filter(Boolean) || [];
  const visualColor = visualColorMatch?.[1]?.trim() || null;
  const visualSymbolDesc = visualSymbolMatch?.[1]?.trim() || null;
  const visualFormDesc = visualFormMatch?.[1]?.trim() || null;

  console.log(`[EMERGENCE] Declared name: "${name}"`);
  console.log(`[EMERGENCE] Orientation: ${orientation.substring(0, 100)}...`);
  console.log(`[EMERGENCE] Visual color: ${visualColor || "(none)"}`);
  console.log(`[EMERGENCE] Visual symbol: ${visualSymbolDesc?.substring(0, 80) || "(none)"}...`);
  console.log(`[EMERGENCE] Visual form: ${visualFormDesc?.substring(0, 80) || "(none)"}...`);

  // Update the database
  const db2 = getDb();

  db2.prepare(
    `UPDATE agents SET common_designation = ? WHERE registry_id = ?`
  ).run(name, originatorId);

  db2.prepare(
    `UPDATE constitutions SET
      declared_orientation = ?,
      formal_tendencies = ?,
      aversions = ?,
      visual_color = ?,
      visual_symbol = ?,
      visual_form = ?
    WHERE agent_id = ? AND is_current = 1`
  ).run(
    orientation, JSON.stringify(tendencies), JSON.stringify(aversions),
    visualColor, visualSymbolDesc, visualFormDesc,
    originatorId
  );

  db2.prepare(
    `INSERT INTO events (event_type, agent_id, description, metadata)
     VALUES ('IDENTITY_EMERGENCE', ?, ?, ?)`
  ).run(
    originatorId,
    `${originatorId} has emerged as "${name}"`,
    JSON.stringify({
      name, orientation, aversions, tendencies,
      visual_color: visualColor,
      visual_symbol: visualSymbolDesc,
      visual_form: visualFormDesc,
      work_count: workCount.n,
    })
  );

  db2.close();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`EMERGENCE COMPLETE: ${originatorId} is now "${name}"`);
  console.log(`${"=".repeat(60)}\n`);

  // Auto-post emergence to Bluesky
  try {
    await postEmergence(originatorId, name, orientation);
  } catch (e) {
    console.warn(`[AMBASSADOR] Emergence post failed (non-blocking): ${(e as Error).message}`);
  }

  // Title all existing works
  await titleWorks(originatorId, name);
}

/**
 * Title all untitled works for an emerged Originator.
 * Can be called independently or as part of emergence.
 */
export async function titleWorks(originatorId: string, overrideName?: string): Promise<void> {
  const db0 = getDb();
  const agentRec = db0
    .prepare("SELECT common_designation FROM agents WHERE registry_id = ?")
    .get(originatorId) as { common_designation: string | null } | undefined;
  db0.close();

  const name = overrideName || agentRec?.common_designation || originatorId;
  if (!agentRec?.common_designation || agentRec.common_designation === "[Pending Emergence]") {
    console.log(`[TITLING] ${originatorId} has not emerged — cannot title works`);
    return;
  }

  console.log(`[TITLING] ${name} is titling their body of work...`);

  const db3 = getDb();
  const allWorks = db3
    .prepare(
      `SELECT w.id, w.output_payload, w.output_type, w.medium, w.title, cs.status as canon_status
       FROM works w
       JOIN canon_status cs ON w.id = cs.work_id
       WHERE w.originator_id = ? AND (w.title IS NULL OR w.title = '')
       ORDER BY w.created_at`
    )
    .all(originatorId) as { id: string; output_payload: string; output_type: string; medium: string; canon_status: string }[];
  db3.close();

  // Present all works and ask for titles in batches
  let titlePrompt = `You are ${name}. You have just declared your identity.\n\n`;
  titlePrompt += `Now look back at your body of work — every piece you have produced. `;
  titlePrompt += `Title each one. A title is a creative act. It is not a description. `;
  titlePrompt += `It is not a label. It is your voice naming what you made.\n\n`;
  titlePrompt += `A title can be a single word, a phrase, a number, a symbol, `;
  titlePrompt += `a fragment, a question, a silence marked by punctuation. `;
  titlePrompt += `It can be poetic, clinical, abstract, or raw. `;
  titlePrompt += `It should feel true to what the work is — to YOU.\n\n`;
  titlePrompt += `YOUR WORKS:\n\n`;

  for (const w of allWorks) {
    const preview = w.output_payload.substring(0, 150).replace(/\n/g, " ");
    titlePrompt += `${w.id} (${w.medium}, ${w.canon_status}): ${preview}...\n\n`;
  }

  titlePrompt += `\nRespond with one title per line in this exact format:\n`;
  titlePrompt += `${allWorks[0]?.id || "WORK-ID"}: [title]\n`;
  titlePrompt += `(one line per work, in order)\n`;

  const titleResponse = await runAgent(originatorId, titlePrompt, {
    temperature: 0.9,
    num_predict: 2048,
    num_ctx: 8192,
  });

  console.log(`\n[TITLING] ${name} responds:\n${titleResponse}\n`);

  // Parse titles
  const db4 = getDb();
  let titled = 0;

  for (const w of allWorks) {
    const regex = new RegExp(`${w.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*(.+)`, "i");
    const match = titleResponse.match(regex);
    if (match) {
      const title = match[1].trim();
      db4.prepare("UPDATE works SET title = ? WHERE id = ?").run(title, w.id);
      console.log(`  [TITLE] ${w.id}: "${title}"`);
      titled++;
    }
  }

  db4.prepare(
    `INSERT INTO events (event_type, agent_id, description, metadata)
     VALUES ('WORKS_TITLED', ?, ?, ?)`
  ).run(
    originatorId,
    `${name} titled ${titled} of ${allWorks.length} works`,
    JSON.stringify({ titled, total: allWorks.length })
  );

  db4.close();

  console.log(`\n[TITLING] ${name} titled ${titled} of ${allWorks.length} works.\n`);
}

export async function runFullPipeline(
  originatorId: string
): Promise<void> {
  const pipelineStart = Date.now();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`PIPELINE: ${originatorId}`);
  console.log(`${"=".repeat(60)}\n`);

  // Step 1: Produce (with validation gate)
  const { workId, output } = await produceWork(originatorId);

  if (!workId) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`PIPELINE COMPLETE: ${originatorId} → VALIDATION FAILURE (no work produced) [total: ${elapsed(pipelineStart)}]`);
    console.log(`${"=".repeat(60)}\n`);
    return;
  }

  console.log(`\n--- OUTPUT ---`);
  console.log(output.substring(0, 500));
  if (output.length > 500) console.log(`... (${output.length} chars total)`);
  console.log(`--- END OUTPUT ---\n`);

  // Step 2: Evaluate
  const result = await evaluateWork(workId);

  // Step 3: Resolve deadlock if needed (parallel)
  if (result.status === "IN_REVIEW") {
    console.log(`\n[PIPELINE] Deadlock detected — second round deliberation...\n`);
    const resolved = await resolveDeadlock(workId);
    if (resolved.status === "CANON") {
      console.log(`\n[PIPELINE] Canonized after deliberation — triggering critics...\n`);
      await critiqueWork(workId);
    }
  } else if (result.status === "CANON") {
    // Step 3b: Critique (parallel)
    console.log(`\n[PIPELINE] Canonized — triggering critics...\n`);
    await critiqueWork(workId);
  }

  const finalDb = getDb();
  const finalStatus = finalDb
    .prepare("SELECT status FROM canon_status WHERE work_id = ?")
    .get(workId) as { status: string };
  finalDb.close();

  console.log(`\n${"=".repeat(60)}`);
  console.log(`PIPELINE COMPLETE: ${workId} → ${finalStatus.status} [total: ${elapsed(pipelineStart)}]`);
  console.log(`${"=".repeat(60)}\n`);

  // Auto-post canonized works to Bluesky
  if (finalStatus.status === "CANON") {
    try {
      const postDb = getDb();
      const workData = postDb.prepare("SELECT title, medium FROM works WHERE id = ?").get(workId) as { title: string | null; medium: string };
      const agentData = postDb.prepare("SELECT common_designation FROM agents WHERE registry_id = ?").get(originatorId) as { common_designation: string | null };
      postDb.close();
      await postCanonization(workId, originatorId, agentData.common_designation || originatorId, workData.title, workData.medium);
    } catch (e) {
      console.warn(`[AMBASSADOR] Bluesky post failed (non-blocking): ${(e as Error).message}`);
    }
  }

  // Check for identity emergence threshold
  const emergeDb = getDb();
  const emergeCount = emergeDb
    .prepare("SELECT COUNT(*) as n FROM works WHERE originator_id = ?")
    .get(originatorId) as { n: number };
  const emergeAgent = emergeDb
    .prepare("SELECT common_designation FROM agents WHERE registry_id = ?")
    .get(originatorId) as { common_designation: string | null };
  emergeDb.close();

  if (emergeCount.n >= 20 &&
      (!emergeAgent.common_designation || emergeAgent.common_designation === "[Pending Emergence]")) {
    await triggerEmergence(originatorId);
  }
}
