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
import * as llm from "../src/llm";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { captureFrames, openHarness } from "../src/harness-capture";
import { estTokens, GROQ_TPM_BUDGET } from "../src/budget";
import { boundedWorkView, REGISTRAR_COMPLETION_TOKENS } from "../src/registrar-view";
import {
  COUNCIL,
  HELD_EXIT_CODE,
  SIGHT_SECONDS,
  buildEvalPrompt,
  distinctFrames,
  type Sight,
  buildSystemPrompt,
  extractVerdict,
  loadWork,
  loadSubmittedWorks,
  loadAgent,
  loadConstitution,
  loadPriorWorks,
  loadRecentCanon,
  loadExistingEvaluations,
} from "../src/council";


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

/**
 * The Council sees what it judges (founding steward, 2026-10-16). Each work is
 * drawn through the site's own renderers and photographed at SIGHT_SECONDS, and
 * every evaluator is shown those frames with the source. MNA_COUNCIL_SIGHT=off
 * returns to source-only judging, for an outage of the seeing model; a verdict
 * records which it was.
 */
const sightOn = process.env.MNA_COUNCIL_SIGHT !== "off";
const SITE = process.env.MNA_SITE_ORIGIN || "https://www.mnamuseum.org";

let browser: Browser | null = null;
let harnessPage: Page | null = null;
async function harness(): Promise<Page> {
  if (!harnessPage) {
    browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    harnessPage = await openHarness(browser, SITE);
  }
  return harnessPage;
}

// ─── Evaluation ──────────────────────────────────────────────────────────────

async function evaluateWork(workId: string): Promise<{
  status: "CANON" | "REJECTED" | "IN_REVIEW" | "HELD";
  verdicts: Record<string, string>;
}> {
  const start = Date.now();
  console.log(`[evaluate] Beginning evaluation of ${workId}`);

  const work = await loadWork(db, workId);
  console.log(`[evaluate]   type=${work.output_type}, payload=${work.output_payload.length} chars`);

  // Photograph the work before anything is recorded. A work the museum cannot
  // show is held, not judged from its source alone: MNA-OR-0002-W-0035 was
  // judged blind while it rendered as a black square, and the fault was the
  // museum's. It stays SUBMITTED, and B1 escalates it.
  let images: string[] = [];
  let sight: Sight | undefined;
  const alreadyVoted = (await loadExistingEvaluations(db, workId)).length;
  if (sightOn && alreadyVoted < COUNCIL.length) {
    const shot = await captureFrames(await harness(), work.output_type, work.output_payload, SIGHT_SECONDS);
    if ("error" in shot) {
      console.log(`[evaluate]   HELD ${workId}: did not render — ${shot.error}`);
      return { status: "HELD", verdicts: {} };
    }
    const shown = distinctFrames(shot.frames);
    images = shown.map((f) => f.png);
    sight = { capturedAt: shot.frames.map((f) => f.seconds), shownAt: shown.map((f) => f.seconds) };
    console.log(`[evaluate]   seen at ${sight.capturedAt.join("/")}s — ${shown.length} distinct frame(s)`);
  }

  if (!dryRun) {
    await db.execute({
      sql: "UPDATE canon_status SET status = 'IN_REVIEW' WHERE work_id = ?",
      args: [workId],
    });
  }

  const priorWorks = await loadPriorWorks(db, work.originator_id, workId);
  const canonWorks = await loadRecentCanon(db, 10);
  console.log(`[evaluate]   ${priorWorks.length} prior works by this originator, ${canonWorks.length} recent canon`);

  const existingEvals = await loadExistingEvaluations(db, workId);
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
      const agent = await loadAgent(db, evalId);
      const constitution = await loadConstitution(db, evalId);
      const systemPrompt = buildSystemPrompt(agent, constitution);
      const userPrompt = buildEvalPrompt(evalId, work, priorWorks, canonWorks, sight);

      if (dryRun) {
        console.log(`[evaluate]   [${evalId}] DRY RUN — prompt built (${systemPrompt.length + userPrompt.length} chars), skipping API call`);
        continue;
      }

      console.log(`[evaluate]   [${evalId}] ${sight ? "looking and judging" : "judging from source"}...`);
      const response = sight
        ? await llm.generateSeeing(systemPrompt, userPrompt, images, { temperature: 0.7, max_tokens: 1024 })
        : await generate(systemPrompt, userPrompt, { temperature: 0.7, max_tokens: 1024 });
      const verdict = extractVerdict(response);
      const dt = Math.round((Date.now() - evalStart) / 1000);
      // Which model judged is provenance: a verdict from a local model on an
      // oversized work must be distinguishable from one by the usual Council.
      const servedBy = llm.lastServedBy;
      console.log(`[evaluate]   [${evalId}] → ${verdict} (${dt}s, ${servedBy ? `${servedBy.provider}/${servedBy.model}` : "unknown model"})`);

      // Write evaluation row
      await db.execute({
        sql: `INSERT INTO evaluations (work_id, evaluator_id, verdict, rationale, constitution_version)
              VALUES (?, ?, ?, ?, ?)`,
        args: [workId, evalId, verdict, response, constitution.version],
      });

      // Log EVALUATION_RENDERED event
      await db.execute({
        sql: `INSERT INTO events (event_type, agent_id, work_id, description, metadata)
              VALUES ('EVALUATION_RENDERED', ?, ?, ?, ?)`,
        args: [evalId, workId, `${evalId} rendered ${verdict} on ${workId}`,
          servedBy ? JSON.stringify({ ...servedBy, saw: sight ? sight.shownAt : null }) : null],
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

  const work = await loadWork(db, workId);

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

  const registrarAgent = await loadAgent(db, "MNA-RG-0001");
  const registrarConstitution = await loadConstitution(db, "MNA-RG-0001");
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
    : await loadSubmittedWorks(db);

  if (targets.length === 0) {
    console.log("[evaluate] No works to evaluate.");
    return;
  }

  console.log(`[evaluate] ${targets.length} work(s) to evaluate: ${targets.join(", ")}`);
  if (dryRun) console.log(`[evaluate] DRY RUN — no API calls, no writes.`);

  const held: string[] = [];
  for (const workId of targets) {
    try {
      const result = await evaluateWork(workId);
      if (result.status === "HELD") {
        held.push(workId);
        console.log("");
        continue;
      }
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

  if (browser) await browser.close();
  if (held.length) {
    console.log(`[evaluate] HELD ${held.length}: ${held.join(", ")} — not judged; they did not render`);
    process.exitCode = HELD_EXIT_CODE;
  }
}

main().catch((err) => {
  console.error("[evaluate] Fatal:", err);
  process.exit(1);
});
