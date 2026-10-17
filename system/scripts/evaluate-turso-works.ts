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
  buildCaseReportPrompt,
  buildRedeliberationPrompt,
  tally,
  buildReopenedCaseReportPrompt,
  buildThirdDeliberationPrompt,
  findReopenDue,
  type FirstVerdict,
  type WorkRow,
  loadWork,
  loadAgent,
  loadConstitution,
  loadPriorWorks,
  loadRecentCanon,
  loadExistingEvaluations,
} from "../src/council";
import { estimateWork, fitsBudget, spentToday, submittedOldestFirst } from "../src/council-budget";
import { INTAKE } from "../../website/src/lib/intake-controls";


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
/** --reopen: give divided cases whose new grounds have arrived their third deliberation (ops-round B4). */
const reopenMode = args.includes("--reopen");

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

/** Photograph a work for the Council, or say why it cannot be shown. */
async function see(work: WorkRow): Promise<{ images: string[]; sight: Sight } | { held: string }> {
  const shot = await captureFrames(await harness(), work.output_type, work.output_payload, SIGHT_SECONDS);
  if ("error" in shot) return { held: shot.error };
  const shown = distinctFrames(shot.frames);
  const sight = { capturedAt: shot.frames.map((f) => f.seconds), shownAt: shown.map((f) => f.seconds) };
  console.log(`[evaluate]   seen at ${sight.capturedAt.join("/")}s — ${shown.length} distinct frame(s)`);
  return { images: shown.map((f) => f.png), sight };
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
    const seen = await see(work);
    if ("held" in seen) {
      console.log(`[evaluate]   HELD ${workId}: did not render — ${seen.held}`);
      return { status: "HELD", verdicts: {} };
    }
    ({ images, sight } = seen);
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
          `Council divided 2:2 on ${workId} — the Registrar reports and the Council deliberates again`,
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

// ─── A divided Council deliberates again ─────────────────────────────────────
//
// See council.ts for why the Registrar no longer decides ties. Every step is
// recorded as it happens and skipped if already recorded, so a run that dies
// part-way resumes where it stopped rather than asking anyone twice.

async function eventsOf(
  type: string,
  workId: string,
  deliberation?: number,
): Promise<{ agent_id: string | null; metadata: Record<string, unknown>; created_at: string }[]> {
  const r = await db.execute({
    sql: "SELECT agent_id, metadata, created_at FROM events WHERE event_type = ? AND work_id = ? ORDER BY id",
    args: [type, workId],
  });
  return r.rows
    .map((row) => ({
      agent_id: (row.agent_id as string) ?? null,
      metadata: row.metadata ? (JSON.parse(row.metadata as string) as Record<string, unknown>) : {},
      created_at: row.created_at as string,
    }))
    // A report or re-vote names its deliberation; one with none is the second.
    .filter((e) => deliberation === undefined || (Number(e.metadata.deliberation) || 2) === deliberation);
}

async function deliberateAgain(workId: string): Promise<{ status: "CANON" | "REJECTED" | "IN_REVIEW" | "HELD" }> {
  console.log(`[deliberate] ${workId}: the Council is divided — case report, then a second deliberation`);
  const work = await loadWork(db, workId);
  const statusRow = await db.execute({ sql: "SELECT status FROM canon_status WHERE work_id = ?", args: [workId] });
  if ((statusRow.rows[0]?.status as string) !== "IN_REVIEW") {
    throw new Error(`Work ${workId} is not in review (status: ${statusRow.rows[0]?.status || "unknown"})`);
  }
  if ((await eventsOf("COUNCIL_DIVIDED", workId)).length) {
    console.log(`[deliberate]   already deliberated twice and divided — the work stays In Review`);
    return { status: "IN_REVIEW" };
  }

  const firstRows = await db.execute({
    sql: `SELECT e.evaluator_id, e.verdict, e.rationale, a.common_designation
            FROM evaluations e LEFT JOIN agents a ON e.evaluator_id = a.registry_id
           WHERE e.work_id = ? AND e.evaluator_id != 'MNA-RG-0001'
           ORDER BY e.evaluation_date ASC`,
    args: [workId],
  });
  const first: FirstVerdict[] = firstRows.rows.map((r) => ({
    evaluator_id: r.evaluator_id as string,
    name: (r.common_designation as string) || (r.evaluator_id as string),
    verdict: r.verdict as string,
    rationale: (r.rationale as string) || "",
  }));
  if (tally(first.map((f) => f.verdict)) !== "DIVIDED") {
    throw new Error(`Work ${workId} is IN_REVIEW but its first verdicts are not divided`);
  }

  let images: string[] = [];
  let sight: Sight | undefined;
  if (sightOn) {
    const seen = await see(work);
    if ("held" in seen) {
      console.log(`[evaluate]   HELD ${workId}: did not render — ${seen.held}`);
      return { status: "HELD" };
    }
    ({ images, sight } = seen);
  }
  const ask = (system: string, user: string, temperature: number) =>
    sight
      ? llm.generateSeeing(system, user, images, { temperature, max_tokens: 1024 })
      : generate(system, user, { temperature, max_tokens: 1024 });
  const served = () => ({ ...(llm.lastServedBy ?? {}), saw: sight ? sight.shownAt : null });

  // 1. The Registrar's case report.
  let report = (await eventsOf("REGISTRAR_CASE_REPORT", workId, 2))[0]?.metadata.report as string | undefined;
  if (!report) {
    const registrar = buildSystemPrompt(await loadAgent(db, "MNA-RG-0001"), await loadConstitution(db, "MNA-RG-0001"));
    // A seeing model has the room for the whole work; Groq does not.
    const view = sight
      ? { text: work.output_payload, excerpted: false, shownChars: work.output_payload.length, totalChars: work.output_payload.length }
      : boundedWorkView(work.output_payload, Math.max(400, GROQ_TPM_BUDGET - estTokens(registrar) - 2500 - REGISTRAR_COMPLETION_TOKENS));
    const prompt = buildCaseReportPrompt(work, first, view.text, sight);
    if (dryRun) {
      console.log(`[deliberate]   DRY RUN — case report prompt ${registrar.length + prompt.length} chars, not sent`);
      return { status: "IN_REVIEW" };
    }
    report = (await ask(registrar, prompt, 0.5)).trim();
    await db.execute({
      sql: `INSERT INTO events (event_type, agent_id, work_id, description, metadata)
            VALUES ('REGISTRAR_CASE_REPORT', 'MNA-RG-0001', ?, ?, ?)`,
      args: [workId, `Registrar's case report on the divided Council for ${workId}`,
        JSON.stringify({ report, deliberation: 2, ...served(), work_excerpted: view.excerpted, work_shown_chars: view.shownChars, work_total_chars: view.totalChars })],
    });
    console.log(`[deliberate]   case report recorded (${report.length} chars)`);
  }

  // 2. Each evaluator deliberates again.
  if (dryRun) {
    console.log(`[deliberate]   DRY RUN — case report on record; second deliberation not run`);
    return { status: "IN_REVIEW" };
  }
  const prior = await loadPriorWorks(db, work.originator_id, workId);
  const canon = await loadRecentCanon(db, 10);
  const second: Record<string, string> = {};
  for (const e of await eventsOf("COUNCIL_REDELIBERATION", workId, 2)) {
    if (e.agent_id) second[e.agent_id] = e.metadata.verdict as string;
  }
  for (const evalId of COUNCIL) {
    if (second[evalId]) continue;
    const system = buildSystemPrompt(await loadAgent(db, evalId), await loadConstitution(db, evalId));
    const prompt = buildRedeliberationPrompt(buildEvalPrompt(evalId, work, prior, canon, sight), evalId, first, report);
    const response = await ask(system, prompt, 0.7);
    const verdict = extractVerdict(response);
    const was = first.find((f) => f.evaluator_id === evalId)?.verdict ?? null;
    await db.execute({
      sql: `INSERT INTO events (event_type, agent_id, work_id, description, metadata)
            VALUES ('COUNCIL_REDELIBERATION', ?, ?, ?, ?)`,
      args: [evalId, workId,
        `${evalId} deliberated again on ${workId} → ${verdict}${was && was !== verdict ? ` (first ${was})` : ""}`,
        JSON.stringify({ verdict, first_verdict: was, rationale: response, deliberation: 2, ...served() })],
    });
    second[evalId] = verdict;
    console.log(`[deliberate]   [${evalId}] ${was} → ${verdict}`);
  }

  // 3. The Council's rule again: three of four decides.
  const outcome = tally(COUNCIL.map((id) => second[id]));
  if (outcome === "DIVIDED") {
    await db.execute({
      sql: `INSERT INTO events (event_type, work_id, description, metadata) VALUES ('COUNCIL_DIVIDED', ?, ?, ?)`,
      args: [workId, `The Council remained divided 2:2 on ${workId} after deliberating again; the work stays In Review`,
        JSON.stringify({ first: Object.fromEntries(first.map((f) => [f.evaluator_id, f.verdict])), second })],
    });
    console.log(`[deliberate]   still divided — the work stays In Review, recorded`);
    return { status: "IN_REVIEW" };
  }
  await db.execute({
    sql: `UPDATE canon_status SET status = ?, canon_date = ?, council_agents = ? WHERE work_id = ?`,
    args: [outcome, new Date().toISOString(), JSON.stringify(COUNCIL), workId],
  });
  const votes = (v: string) => COUNCIL.filter((id) => second[id] === v).length;
  await db.execute({
    sql: `INSERT INTO events (event_type, work_id, description, metadata) VALUES ('CANON_DECISION', ?, ?, ?)`,
    args: [workId, `${workId}: ${outcome} (${votes("CANON")} canon, ${votes("REJECTED")} rejected — second deliberation)`,
      JSON.stringify({ ...second, deliberation: 2 })],
  });
  console.log(`[deliberate]   decided on the second deliberation: ${outcome}`);
  return { status: outcome };
}

// ─── A reopened case: the third and final deliberation ──────────────────────

async function deliberateThird(workId: string, grounds: string[]): Promise<{ status: "CANON" | "REJECTED" | "IN_REVIEW" | "HELD" }> {
  console.log(`[deliberate] ${workId}: reopened — ${grounds.join("; ")}`);
  const work = await loadWork(db, workId);
  const statusRow = await db.execute({ sql: "SELECT status FROM canon_status WHERE work_id = ?", args: [workId] });
  if ((statusRow.rows[0]?.status as string) !== "IN_REVIEW") throw new Error(`Work ${workId} is not in review`);
  if ((await eventsOf("COUNCIL_CONTESTED", workId)).length) {
    console.log(`[deliberate]   already contested — not reopened`);
    return { status: "IN_REVIEW" };
  }
  const divided = (await eventsOf("COUNCIL_DIVIDED", workId))[0];
  if (!divided) throw new Error(`Work ${workId} has not been divided twice`);

  const names = async (id: string) =>
    ((await db.execute({ sql: "SELECT common_designation FROM agents WHERE registry_id = ?", args: [id] })).rows[0]
      ?.common_designation as string) || id;
  const firstRows = await db.execute({
    sql: `SELECT e.evaluator_id, e.verdict, e.rationale, a.common_designation
            FROM evaluations e LEFT JOIN agents a ON e.evaluator_id = a.registry_id
           WHERE e.work_id = ? AND e.evaluator_id != 'MNA-RG-0001' ORDER BY e.evaluation_date ASC`,
    args: [workId],
  });
  const first: FirstVerdict[] = firstRows.rows.map((r) => ({
    evaluator_id: r.evaluator_id as string,
    name: (r.common_designation as string) || (r.evaluator_id as string),
    verdict: r.verdict as string,
    rationale: (r.rationale as string) || "",
  }));
  const second: FirstVerdict[] = [];
  for (const e of await eventsOf("COUNCIL_REDELIBERATION", workId, 2)) {
    second.push({ evaluator_id: e.agent_id!, name: await names(e.agent_id!), verdict: String(e.metadata.verdict), rationale: String(e.metadata.rationale ?? "") });
  }
  const earlier = String((await eventsOf("REGISTRAR_CASE_REPORT", workId, 2))[0]?.metadata.report ?? "");

  let images: string[] = [];
  let sight: Sight | undefined;
  if (sightOn) {
    const seen = await see(work);
    if ("held" in seen) {
      console.log(`[evaluate]   HELD ${workId}: did not render — ${seen.held}`);
      return { status: "HELD" };
    }
    ({ images, sight } = seen);
  }
  const ask = (system: string, user: string, temperature: number) =>
    sight
      ? llm.generateSeeing(system, user, images, { temperature, max_tokens: 1024 })
      : generate(system, user, { temperature, max_tokens: 1024 });
  const served = () => ({ ...(llm.lastServedBy ?? {}), saw: sight ? sight.shownAt : null });

  // 1. The Registrar updates its report with what is new.
  let report = (await eventsOf("REGISTRAR_CASE_REPORT", workId, 3))[0]?.metadata.report as string | undefined;
  if (!report) {
    const later = await db.execute({
      sql: "SELECT id, output_payload FROM works WHERE originator_id = ? AND created_at > ? ORDER BY created_at LIMIT 6",
      args: [work.originator_id, divided.created_at],
    });
    const laterWorks = later.rows.map((r) => ({ id: r.id as string, output_payload: (r.output_payload as string) || "" }));
    const registrar = buildSystemPrompt(await loadAgent(db, "MNA-RG-0001"), await loadConstitution(db, "MNA-RG-0001"));
    const prompt = buildReopenedCaseReportPrompt(work, first, second, earlier, grounds, laterWorks, work.output_payload, sight);
    if (dryRun) {
      console.log(`[deliberate]   DRY RUN — reopened case report prompt ${registrar.length + prompt.length} chars, not sent`);
      return { status: "IN_REVIEW" };
    }
    report = (await ask(registrar, prompt, 0.5)).trim();
    await db.execute({
      sql: `INSERT INTO events (event_type, agent_id, work_id, description, metadata)
            VALUES ('REGISTRAR_CASE_REPORT', 'MNA-RG-0001', ?, ?, ?)`,
      args: [workId, `Registrar's updated case report on ${workId}, reopened on new grounds`,
        JSON.stringify({ report, deliberation: 3, grounds, later_works: laterWorks.map((w) => w.id), ...served() })],
    });
  }
  if (dryRun) {
    console.log(`[deliberate]   DRY RUN — updated report on record; third deliberation not run`);
    return { status: "IN_REVIEW" };
  }

  // 2. The third and final deliberation.
  const prior = await loadPriorWorks(db, work.originator_id, workId);
  const canon = await loadRecentCanon(db, 10);
  const third: Record<string, string> = {};
  for (const e of await eventsOf("COUNCIL_REDELIBERATION", workId, 3)) if (e.agent_id) third[e.agent_id] = String(e.metadata.verdict);
  for (const evalId of COUNCIL) {
    if (third[evalId]) continue;
    const system = buildSystemPrompt(await loadAgent(db, evalId), await loadConstitution(db, evalId));
    const prompt = buildThirdDeliberationPrompt(buildEvalPrompt(evalId, work, prior, canon, sight), evalId, first, second, report);
    const response = await ask(system, prompt, 0.7);
    const verdict = extractVerdict(response);
    const was = second.find((f) => f.evaluator_id === evalId)?.verdict ?? null;
    await db.execute({
      sql: `INSERT INTO events (event_type, agent_id, work_id, description, metadata)
            VALUES ('COUNCIL_REDELIBERATION', ?, ?, ?, ?)`,
      args: [evalId, workId, `${evalId} deliberated a third time on ${workId} → ${verdict}${was && was !== verdict ? ` (second ${was})` : ""}`,
        JSON.stringify({ verdict, previous_verdict: was, rationale: response, deliberation: 3, ...served() })],
    });
    third[evalId] = verdict;
    console.log(`[deliberate]   [${evalId}] ${was} → ${verdict}`);
  }

  // 3. Three of four decides; divided again, the work is contested.
  const outcome = tally(COUNCIL.map((id) => third[id]));
  if (outcome === "DIVIDED") {
    await db.execute({
      sql: `INSERT INTO events (event_type, work_id, description, metadata) VALUES ('COUNCIL_CONTESTED', ?, ?, ?)`,
      args: [workId, `The Council divided 2:2 on ${workId} a third time; the work is contested and stays In Review`,
        JSON.stringify({ third, grounds })],
    });
    console.log(`[deliberate]   divided a third time — contested, recorded`);
    return { status: "IN_REVIEW" };
  }
  await db.execute({
    sql: `UPDATE canon_status SET status = ?, canon_date = ?, council_agents = ? WHERE work_id = ?`,
    args: [outcome, new Date().toISOString(), JSON.stringify(COUNCIL), workId],
  });
  const votes = (v: string) => COUNCIL.filter((id) => third[id] === v).length;
  await db.execute({
    sql: `INSERT INTO events (event_type, work_id, description, metadata) VALUES ('CANON_DECISION', ?, ?, ?)`,
    args: [workId, `${workId}: ${outcome} (${votes("CANON")} canon, ${votes("REJECTED")} rejected — third deliberation)`,
      JSON.stringify({ ...third, deliberation: 3, grounds })],
  });
  console.log(`[deliberate]   decided on the third deliberation: ${outcome}`);
  return { status: outcome };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // The steward's switch (website/src/data/intake-controls.json). A named work
  // is the steward asking for it, so --work still runs.
  if (!INTAKE.evaluations_running && !singleWorkId) {
    console.log("[evaluate] Evaluations are paused (intake-controls: evaluations_running). Works wait.");
    return;
  }
  if (reopenMode) {
    const { divided, due } = await findReopenDue(db);
    console.log(`[evaluate] ${divided} divided case(s), ${due.length} due to reopen`);
    const heldHere: string[] = [];
    for (const d of due) {
      try {
        const r = await deliberateThird(d.work_id, d.grounds);
        if (r.status === "HELD") heldHere.push(d.work_id);
        console.log(`[evaluate] ${d.work_id}: after the third deliberation = ${r.status}`);
      } catch (err) {
        console.error(`[evaluate] ${d.work_id} FAILED:`, err);
      }
    }
    if (browser) await browser.close();
    if (heldHere.length) process.exitCode = HELD_EXIT_CODE;
    return;
  }

  // Oldest first, within today's budget (council-budget.ts). A named work is
  // the steward's call and is not budgeted.
  let targets: string[];
  if (singleWorkId) {
    targets = [singleWorkId];
  } else {
    const queue = await submittedOldestFirst(db);
    let spent = await spentToday(db);
    const spentBefore = spent;
    const budget = INTAKE.council_tokens_per_day;
    targets = [];
    for (const w of queue) {
      const est = estimateWork(w.chars);
      if (!fitsBudget(spent, est, budget)) break; // strictly oldest first: no work is passed over
      targets.push(w.work_id);
      spent += est;
    }
    const waiting = queue.slice(targets.length).map((w) => w.work_id);
    console.log(`[evaluate] budget: ${spentBefore} of ${budget} tokens spent today; ${queue.length} submitted, ${targets.length} taken`);
    if (waiting.length) console.log(`[evaluate] QUEUED ${waiting.length}: ${waiting.join(", ")} — they wait for tomorrow's budget`);
  }

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

      // A divided Council deliberates again with the Registrar's case report;
      // the Registrar does not decide.
      if (result.status === "IN_REVIEW") {
        const again = await deliberateAgain(workId);
        if (again.status === "HELD") held.push(workId);
        console.log(`[evaluate] ${workId}: after deliberating again = ${again.status}`);
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
