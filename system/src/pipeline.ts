import { getDb } from "./db";
import { runAgent } from "./agent-runner";
import { selectFormat, getFormatPrompt, detectFormat } from "./formats";

/**
 * Analyze text content and determine the best display aspect ratio.
 * Short/compact → 1:1 (square)
 * Wide lines → 16:9 (landscape)
 * Many short lines → 3:4 (portrait)
 * Very wide → 21:9 (ultra-wide)
 */
function analyzeTextAspect(text: string): number {
  const lines = text.trim().split("\n");
  const maxLineLength = Math.max(...lines.map((l) => l.length));
  const lineCount = lines.length;

  // Very compact (few short lines) → square
  if (lineCount <= 5 && maxLineLength <= 20) return 1.0;

  // Wide lines with few rows → landscape
  if (maxLineLength > 40 && lineCount <= 10) return 1.78; // 16:9

  // Very wide lines → ultra-wide
  if (maxLineLength > 60) return 2.33; // 21:9

  // Many lines, moderate width → portrait
  if (lineCount > 10 && maxLineLength <= 40) return 0.75; // 3:4

  // Many lines, wide → landscape
  if (lineCount > 5 && maxLineLength > 30) return 1.78;

  // Default square
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
 * Have an Originator produce a work
 */
export async function produceWork(
  originatorId: string
): Promise<{ workId: string; output: string }> {
  const db = getDb();

  // Get the Originator's prior works for context
  const priorWorks = db
    .prepare(
      "SELECT id, output_payload FROM works WHERE originator_id = ? ORDER BY created_at DESC LIMIT 5"
    )
    .all(originatorId) as { id: string; output_payload: string }[];

  const workCount = db
    .prepare("SELECT COUNT(*) as n FROM works WHERE originator_id = ?")
    .get(originatorId) as { n: number };

  db.close();

  // Select output format based on Originator's seed affinities
  const requestedFormat = selectFormat(originatorId);
  const formatPrompt = getFormatPrompt(requestedFormat);

  // Build the production prompt
  let prompt = `Produce your next work. This is output #${workCount.n + 1}.\n\n`;

  prompt += `Your work should be a self-contained creative output. `;
  prompt += `It is not a description of a work. It IS the work. `;
  prompt += `Do not title it. Do not explain it. Do not introduce it. Just produce it.\n\n`;

  if (priorWorks.length > 0) {
    prompt += `Your ${priorWorks.length} most recent prior outputs are provided below for developmental continuity. `;
    prompt += `You may build on, depart from, or ignore them as your constitution directs.\n\n`;
    for (const w of priorWorks.reverse()) {
      prompt += `--- ${w.id} ---\n${w.output_payload.substring(0, 300)}\n\n`;
    }
  } else {
    prompt += `This is your first output. There is no prior work. Begin.\n\n`;
  }

  prompt += formatPrompt;

  console.log(`[${originatorId}] Producing work #${workCount.n + 1} (format: ${requestedFormat})...`);
  const output = await runAgent(originatorId, prompt, {
    temperature: 0.9,
    num_predict: requestedFormat === "svg" || requestedFormat === "html-css" ? 1024 : 512,
  });

  // Clean up markdown fences the model might wrap around code output
  let cleanOutput = output
    .replace(/^```(?:svg|html|json|css|javascript)?\s*\n?/gm, "")
    .replace(/\n?```\s*$/gm, "")
    .trim();

  // Detect actual format from output (model might not follow instructions)
  const detected = detectFormat(cleanOutput);
  console.log(`[${originatorId}] Detected format: ${detected.format} (requested: ${requestedFormat})`);

  // Store the work
  const workId = nextWorkId(originatorId);
  const db2 = getDb();

  db2.prepare(`
    INSERT INTO works (id, originator_id, medium, output_payload, output_type, display_aspect)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(workId, originatorId, detected.medium, cleanOutput, detected.format, detected.aspect);

  // Create submission record
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

  // Set initial canon status
  db2.prepare(`
    INSERT INTO canon_status (work_id, status, founding_collection)
    VALUES (?, 'SUBMITTED', 1)
  `).run(workId);

  // Log event
  db2.prepare(`
    INSERT INTO events (event_type, agent_id, work_id, description)
    VALUES ('WORK_PRODUCED', ?, ?, ?)
  `).run(originatorId, workId, `${originatorId} produced ${workId}`);

  db2.close();

  console.log(`[${originatorId}] Produced ${workId} (${output.length} chars)`);
  return { workId, output };
}

/**
 * Have the Evaluation Council evaluate a work
 * Returns the final canon status
 */
export async function evaluateWork(
  workId: string
): Promise<{ status: "CANON" | "REJECTED" | "IN_REVIEW"; verdicts: Record<string, string> }> {
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

  // Update status to IN_REVIEW
  db.prepare("UPDATE canon_status SET status = 'IN_REVIEW' WHERE work_id = ?").run(
    workId
  );

  // Get all prior works by this originator for the Historicist
  const priorWorks = db
    .prepare(
      "SELECT id, output_payload FROM works WHERE originator_id = ? AND id != ? ORDER BY created_at"
    )
    .all(work.originator_id, workId) as {
    id: string;
    output_payload: string;
  }[];

  // Get the current canon for the Contextualist
  const canonWorks = db
    .prepare(
      "SELECT w.id, w.output_payload FROM works w JOIN canon_status cs ON w.id = cs.work_id WHERE cs.status = 'CANON' ORDER BY cs.canon_date DESC LIMIT 10"
    )
    .all() as { id: string; output_payload: string }[];

  const allEvaluators = [
    "MNA-EV-0001",
    "MNA-EV-0002",
    "MNA-EV-0003",
    "MNA-EV-0004",
  ];

  // Check which evaluators have already voted (for crash recovery)
  const existingEvals = db
    .prepare("SELECT evaluator_id, verdict FROM evaluations WHERE work_id = ?")
    .all(workId) as { evaluator_id: string; verdict: string }[];

  db.close();

  const verdicts: Record<string, string> = {};
  let canonVotes = 0;

  // Load existing votes
  for (const ev of existingEvals) {
    verdicts[ev.evaluator_id] = ev.verdict;
    if (ev.verdict === "CANON") canonVotes++;
    console.log(`[${ev.evaluator_id}] Already voted: ${ev.verdict}`);
  }

  // Only run evaluators who haven't voted yet
  const remainingEvaluators = allEvaluators.filter(
    (id) => !existingEvals.some((ev) => ev.evaluator_id === id)
  );

  if (remainingEvaluators.length === 0) {
    console.log("All evaluators have already voted.");
  }

  for (const evalId of remainingEvaluators) {
    let prompt = `EVALUATE THE FOLLOWING WORK FOR CANON STATUS.\n\n`;
    prompt += `Work ID: ${workId}\n`;
    prompt += `Originator: ${work.originator_id}\n`;
    prompt += `Medium: ${work.medium}\n\n`;
    prompt += `--- THE WORK ---\n${work.output_payload}\n--- END WORK ---\n\n`;

    // Give Historicist developmental context — with cold-start awareness
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

    // Give Contextualist field context — with cold-start awareness
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

    prompt += `Render your verdict: CANON, REJECTED, or IN_REVIEW.\n`;
    prompt += `State your verdict first on its own line, then provide your full rationale.\n`;
    prompt += `Your rationale must reference specific properties of the work and your evaluative criteria.\n`;

    console.log(`[${evalId}] Evaluating ${workId}...`);
    const response = await runAgent(evalId, prompt, {
      temperature: 0.7,
      num_predict: 512,
    });

    // Parse verdict from response
    const firstLine = response.trim().split("\n")[0].toUpperCase();
    let verdict: "CANON" | "REJECTED" | "IN_REVIEW" = "IN_REVIEW";
    if (firstLine.includes("CANON") && !firstLine.includes("REJECTED")) {
      verdict = "CANON";
      canonVotes++;
    } else if (firstLine.includes("REJECTED")) {
      verdict = "REJECTED";
    }

    verdicts[evalId] = verdict;

    // Store evaluation
    const db2 = getDb();
    const constitution = db2
      .prepare(
        "SELECT version FROM constitutions WHERE agent_id = ? AND is_current = 1"
      )
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

    console.log(`[${evalId}] Verdict: ${verdict}`);
  }

  // Determine final status
  // 3+ CANON votes = CANON
  // 3+ REJECTED votes = REJECTED
  // 2:2 split = IN_REVIEW (deadlock — Registrar notified)
  const rejectedVotes = Object.values(verdicts).filter(v => v === "REJECTED").length;
  let finalStatus: "CANON" | "REJECTED" | "IN_REVIEW";

  if (canonVotes >= 3) {
    finalStatus = "CANON";
  } else if (rejectedVotes >= 3) {
    finalStatus = "REJECTED";
  } else {
    finalStatus = "IN_REVIEW"; // Deadlock
  }

  const db3 = getDb();
  db3.prepare(`
    UPDATE canon_status
    SET status = ?, canon_date = ?, council_agents = ?
    WHERE work_id = ?
  `).run(
    finalStatus,
    finalStatus === "CANON" ? new Date().toISOString() : null,
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

  // If deadlock, notify the Registrar
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

  // Mark dissenting votes (minority position relative to final status)
  for (const [evalId, verdict] of Object.entries(verdicts)) {
    if (finalStatus === "IN_REVIEW") {
      // In a deadlock, no dissent — it's a genuine split
      continue;
    }
    if (verdict !== finalStatus) {
      db3.prepare(
        "UPDATE evaluations SET is_dissent = 1 WHERE work_id = ? AND evaluator_id = ?"
      ).run(workId, evalId);
    }
  }

  db3.close();

  console.log(
    `\n[CANON DECISION] ${workId}: ${finalStatus} (${canonVotes}/4 canon votes)`
  );
  console.log(`Verdicts:`, verdicts);

  return { status: finalStatus, verdicts };
}

/**
 * Have the Critics produce responses to a canonized work.
 * Both the Structural Reader (CR-0001) and Phenomenological Reader (CR-0002)
 * respond to every canonized work. Their responses are archival artifacts,
 * not evaluations — they do not affect canon status.
 */
export async function critiqueWork(
  workId: string
): Promise<{ responses: Record<string, string> }> {
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

  // Verify work is canonized
  const status = db
    .prepare("SELECT status FROM canon_status WHERE work_id = ?")
    .get(workId) as { status: string } | undefined;

  if (!status || status.status !== "CANON") {
    throw new Error(`Work ${workId} is not canonized (status: ${status?.status || "unknown"}). Critics only respond to canon works.`);
  }

  // Get the Originator's full body of work for developmental context
  const priorWorks = db
    .prepare(
      "SELECT id, output_payload, medium FROM works WHERE originator_id = ? ORDER BY created_at ASC"
    )
    .all(work.originator_id) as {
    id: string;
    output_payload: string;
    medium: string;
  }[];

  // Get the evaluation record for this work
  const evaluations = db
    .prepare(
      `SELECT e.evaluator_id, e.verdict, e.rationale, e.is_dissent, a.common_designation
       FROM evaluations e
       LEFT JOIN agents a ON e.evaluator_id = a.registry_id
       WHERE e.work_id = ?`
    )
    .all(workId) as {
    evaluator_id: string;
    verdict: string;
    rationale: string;
    is_dissent: number;
    common_designation: string;
  }[];

  // Check which critics have already responded (crash recovery)
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

  const responses: Record<string, string> = {};

  for (const criticId of remainingCritics) {
    const isStructural = criticId === "MNA-CR-0001";

    let prompt = `PRODUCE A CRITICAL RESPONSE TO THE FOLLOWING CANONIZED WORK.\n\n`;
    prompt += `Work ID: ${workId}\n`;
    prompt += `Originator: ${work.originator_id}\n`;
    prompt += `Medium: ${work.medium}\n\n`;
    prompt += `--- THE WORK ---\n${work.output_payload}\n--- END WORK ---\n\n`;

    // Originator's body of work
    if (priorWorks.length > 1) {
      prompt += `ORIGINATOR BODY OF WORK (${priorWorks.length} total works):\n`;
      for (const pw of priorWorks.filter((p) => p.id !== workId).slice(-5)) {
        prompt += `${pw.id} (${pw.medium}): ${pw.output_payload.substring(0, 150)}...\n\n`;
      }
    } else {
      prompt += `This is the Originator's only work to date.\n\n`;
    }

    // Evaluation record — critics should know how the Council assessed it
    if (evaluations.length > 0) {
      prompt += `EVALUATION RECORD:\n`;
      for (const ev of evaluations) {
        prompt += `${ev.common_designation} (${ev.evaluator_id}): ${ev.verdict}`;
        if (ev.is_dissent) prompt += ` [DISSENT]`;
        prompt += `\n`;
        // Give a condensed version of the rationale
        const condensed = ev.rationale
          .split("\n")
          .filter((line: string) => line.trim() && !line.trim().match(/^(CANON|REJECTED|IN_REVIEW|Rationale:)$/i))
          .join(" ")
          .substring(0, 300);
        prompt += `${condensed}...\n\n`;
      }
    }

    if (isStructural) {
      prompt += `You are the Structural Reader. Read from INSIDE the work.\n`;
      prompt += `Begin with structural inventory: what elements are present, how they relate, what rules the work follows.\n`;
      prompt += `Then: developmental reference — how does this work's formal approach relate to the Originator's prior outputs?\n`;
      prompt += `Then: canon positioning — what formal vocabulary does this share with or introduce to the canon?\n`;
      prompt += `Document structure before claiming meaning. When structure and meaning diverge, note the divergence.\n`;
    } else {
      prompt += `You are the Phenomenological Reader. Read from the THRESHOLD.\n`;
      prompt += `Begin with encounter: what happens when this work is met? What does it demand? What does it resist?\n`;
      prompt += `Then: dual audience — what does this work do for human observers versus nonhuman observers?\n`;
      prompt += `Then: inaccessibility — if parts of the work resist human interpretation, document that resistance precisely.\n`;
      prompt += `Attend to what the work DOES rather than what it looks like. Hold the gap between audiences.\n`;
    }

    prompt += `\nProduce a substantive critical response (300-600 words). This is an archival artifact.\n`;

    console.log(`[${criticId}] Critiquing ${workId}...`);
    const response = await runAgent(criticId, prompt, {
      temperature: 0.7,
      num_predict: 1024,
    });

    responses[criticId] = response;

    // Store the critical response
    const db2 = getDb();
    db2.prepare(`
      INSERT INTO critical_responses (work_id, critic_id, body, critic_approach)
      VALUES (?, ?, ?, ?)
    `).run(
      workId,
      criticId,
      response,
      isStructural ? "structural" : "phenomenological"
    );

    db2.prepare(`
      INSERT INTO events (event_type, agent_id, work_id, description)
      VALUES ('CRITICAL_RESPONSE', ?, ?, ?)
    `).run(criticId, workId, `${criticId} produced critical response to ${workId}`);

    db2.close();

    console.log(`[${criticId}] Response complete (${response.length} chars)`);
  }

  return { responses };
}

/**
 * Resolve a deadlocked work (IN_REVIEW status from a 2:2 council split).
 *
 * Resolution process: each evaluator sees the other three's rationales
 * and re-evaluates with that context. This mirrors real institutional
 * deliberation — you don't just vote, you engage with disagreement.
 *
 * If the second round also deadlocks, the work defaults to CANON on the
 * principle that genuine, sustained evaluative disagreement is itself
 * evidence of a work worth preserving.
 */
export async function resolveDeadlock(
  workId: string
): Promise<{ status: "CANON" | "REJECTED"; verdicts: Record<string, string> }> {
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

  if (!status || status.status !== "IN_REVIEW") {
    throw new Error(`Work ${workId} is not in review (status: ${status?.status || "unknown"})`);
  }

  // Get the first round evaluations
  const firstRoundEvals = db
    .prepare(
      `SELECT e.evaluator_id, e.verdict, e.rationale, a.common_designation
       FROM evaluations e
       LEFT JOIN agents a ON e.evaluator_id = a.registry_id
       WHERE e.work_id = ?
       ORDER BY e.evaluation_date ASC`
    )
    .all(workId) as {
    evaluator_id: string;
    verdict: string;
    rationale: string;
    common_designation: string;
  }[];

  db.close();

  console.log(`\n[DEADLOCK RESOLUTION] ${workId} — second round deliberation`);
  console.log(`First round: ${firstRoundEvals.map((e) => `${e.common_designation}: ${e.verdict}`).join(", ")}\n`);

  const allEvaluators = [
    "MNA-EV-0001",
    "MNA-EV-0002",
    "MNA-EV-0003",
    "MNA-EV-0004",
  ];

  const verdicts: Record<string, string> = {};
  let canonVotes = 0;

  for (const evalId of allEvaluators) {
    let prompt = `SECOND ROUND DELIBERATION — DEADLOCK RESOLUTION\n\n`;
    prompt += `The Evaluation Council is deadlocked on this work (2:2 split).\n`;
    prompt += `You are now re-evaluating after reading your colleagues' rationales.\n\n`;
    prompt += `Work ID: ${workId}\n`;
    prompt += `Originator: ${work.originator_id}\n`;
    prompt += `Medium: ${work.medium}\n\n`;
    prompt += `--- THE WORK ---\n${work.output_payload}\n--- END WORK ---\n\n`;

    prompt += `FIRST ROUND RATIONALES:\n`;
    for (const ev of firstRoundEvals) {
      prompt += `--- ${ev.common_designation} (${ev.evaluator_id}) — ${ev.verdict} ---\n`;
      const condensed = ev.rationale
        .split("\n")
        .filter((line: string) => line.trim() && !line.trim().match(/^(CANON|REJECTED|IN_REVIEW|Rationale:)$/i))
        .join("\n")
        .substring(0, 400);
      prompt += `${condensed}\n\n`;
    }

    prompt += `Having read your colleagues' positions, re-evaluate this work.\n`;
    prompt += `You may maintain your original verdict or change it.\n`;
    prompt += `If you change your verdict, explain what in the deliberation shifted your assessment.\n`;
    prompt += `If you maintain it, explain why the opposing arguments did not persuade you.\n\n`;
    prompt += `Render your verdict: CANON or REJECTED. No IN_REVIEW — this must resolve.\n`;
    prompt += `State your verdict first on its own line, then provide your rationale.\n`;

    console.log(`[${evalId}] Second round deliberation on ${workId}...`);
    const response = await runAgent(evalId, prompt, {
      temperature: 0.6,
      num_predict: 512,
    });

    const firstLine = response.trim().split("\n")[0].toUpperCase();
    let verdict: "CANON" | "REJECTED" = "REJECTED";
    if (firstLine.includes("CANON") && !firstLine.includes("REJECTED")) {
      verdict = "CANON";
      canonVotes++;
    }

    verdicts[evalId] = verdict;

    // Store the second round evaluation
    const db2 = getDb();
    const constitution = db2
      .prepare(
        "SELECT version FROM constitutions WHERE agent_id = ? AND is_current = 1"
      )
      .get(evalId) as { version: string };

    db2.prepare(`
      INSERT INTO evaluations (work_id, evaluator_id, verdict, rationale, constitution_version)
      VALUES (?, ?, ?, ?, ?)
    `).run(workId, evalId, verdict, `[SECOND ROUND]\n${response}`, constitution.version);

    db2.close();

    console.log(`[${evalId}] Second round verdict: ${verdict}`);
  }

  // Determine final status — if STILL deadlocked, default to CANON
  const rejectedVotes = Object.values(verdicts).filter((v) => v === "REJECTED").length;
  let finalStatus: "CANON" | "REJECTED";

  if (canonVotes >= 3) {
    finalStatus = "CANON";
  } else if (rejectedVotes >= 3) {
    finalStatus = "REJECTED";
  } else {
    // Still deadlocked after deliberation — default to CANON
    finalStatus = "CANON";
    console.log(`[DEADLOCK] Still split after deliberation — defaulting to CANON (sustained disagreement = worth preserving)`);
  }

  const db3 = getDb();
  db3.prepare(`
    UPDATE canon_status
    SET status = ?, canon_date = ?
    WHERE work_id = ?
  `).run(
    finalStatus,
    finalStatus === "CANON" ? new Date().toISOString() : null,
    workId
  );

  db3.prepare(`
    INSERT INTO events (event_type, work_id, description, metadata)
    VALUES ('DEADLOCK_RESOLVED', ?, ?, ?)
  `).run(
    workId,
    `${workId}: Deadlock resolved → ${finalStatus} (second round: ${canonVotes} canon, ${rejectedVotes} rejected${canonVotes === 2 && rejectedVotes === 2 ? " — sustained deadlock, defaulted CANON" : ""})`,
    JSON.stringify(verdicts)
  );

  // Mark dissents
  for (const [evalId, verdict] of Object.entries(verdicts)) {
    if (verdict !== finalStatus) {
      db3.prepare(
        "UPDATE evaluations SET is_dissent = 1 WHERE work_id = ? AND evaluator_id = ? AND rationale LIKE '[SECOND ROUND]%'"
      ).run(workId, evalId);
    }
  }

  db3.close();

  console.log(`\n[DEADLOCK RESOLVED] ${workId}: ${finalStatus} (${canonVotes}/4 canon votes, second round)\n`);

  return { status: finalStatus, verdicts };
}

/**
 * Full pipeline: produce → evaluate → critique (if canonized) → resolve deadlock (if needed)
 */
export async function runFullPipeline(
  originatorId: string
): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`PIPELINE: ${originatorId}`);
  console.log(`${"=".repeat(60)}\n`);

  // Step 1: Produce
  const { workId, output } = await produceWork(originatorId);
  console.log(`\n--- OUTPUT ---`);
  console.log(output.substring(0, 500));
  if (output.length > 500) console.log(`... (${output.length} chars total)`);
  console.log(`--- END OUTPUT ---\n`);

  // Step 2: Evaluate
  const result = await evaluateWork(workId);

  // Step 3: If deadlocked, resolve
  if (result.status === "IN_REVIEW") {
    console.log(`\n[PIPELINE] Deadlock detected — initiating second round deliberation...\n`);
    const resolved = await resolveDeadlock(workId);
    console.log(`[PIPELINE] Deadlock resolved: ${workId} → ${resolved.status}`);

    // Step 4: If resolved to CANON, critique
    if (resolved.status === "CANON") {
      console.log(`\n[PIPELINE] Work canonized — triggering critical responses...\n`);
      await critiqueWork(workId);
    }
  } else if (result.status === "CANON") {
    // Step 3b: Canonized on first round — critique
    console.log(`\n[PIPELINE] Work canonized — triggering critical responses...\n`);
    await critiqueWork(workId);
  }

  const finalDb = getDb();
  const finalStatus = finalDb
    .prepare("SELECT status FROM canon_status WHERE work_id = ?")
    .get(workId) as { status: string };
  finalDb.close();

  console.log(`\nPipeline complete: ${workId} → ${finalStatus.status}\n`);
}
