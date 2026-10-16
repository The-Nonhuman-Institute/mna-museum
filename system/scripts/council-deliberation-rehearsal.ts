/**
 * council-deliberation-rehearsal.ts — what a second deliberation would say.
 *
 * Takes a work the Council divided on, photographs it, asks the Registrar for a
 * case report and each evaluator to deliberate again, exactly as
 * evaluate-turso-works.ts now does, and prints the result. READS ONLY: nothing
 * is recorded, and the work's verdict, already part of the permanent record,
 * is not touched. For seeing the new procedure before it meets a live tie.
 *
 *   npx tsx system/scripts/council-deliberation-rehearsal.ts --work <id> [--out file.md]
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import {
  COUNCIL,
  SIGHT_SECONDS,
  buildCaseReportPrompt,
  buildEvalPrompt,
  buildRedeliberationPrompt,
  buildSystemPrompt,
  distinctFrames,
  extractVerdict,
  loadAgent,
  loadConstitution,
  loadPriorWorks,
  loadRecentCanon,
  loadWork,
  tally,
  type FirstVerdict,
} from "../src/council";
import { captureFrames, openHarness } from "../src/harness-capture";
import { generateSeeing, lastServedBy } from "../src/llm";

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const args = process.argv.slice(2);
const flag = (n: string) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : undefined);
const workId = flag("--work");
const out = flag("--out");
if (!workId) {
  console.error("usage: council-deliberation-rehearsal.ts --work <id> [--out file.md]");
  process.exit(2);
}
const SITE = process.env.MNA_SITE_ORIGIN || "https://www.mnamuseum.org";
let md = "";
const say = (s: string) => {
  md += s + "\n";
  console.log(s);
};

async function main() {
  const db = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN! });
  const work = await loadWork(db, workId!);
  const rows = await db.execute({
    sql: `SELECT e.evaluator_id, e.verdict, e.rationale, a.common_designation FROM evaluations e
            LEFT JOIN agents a ON a.registry_id = e.evaluator_id
           WHERE e.work_id = ? AND e.evaluator_id != 'MNA-RG-0001' ORDER BY e.evaluation_date`,
    args: [workId!],
  });
  const first: FirstVerdict[] = rows.rows.map((r) => ({
    evaluator_id: r.evaluator_id as string,
    name: (r.common_designation as string) || (r.evaluator_id as string),
    verdict: r.verdict as string,
    rationale: (r.rationale as string) || "",
  }));
  say(`# Rehearsal: ${workId}\n\nFirst round on record: ${first.map((f) => `${f.name} ${f.verdict}`).join(", ")} → ${tally(first.map((f) => f.verdict))}\n`);

  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const shot = await captureFrames(await openHarness(browser, SITE), work.output_type, work.output_payload, SIGHT_SECONDS);
    if ("error" in shot) throw new Error(`did not render: ${shot.error}`);
    const shown = distinctFrames(shot.frames);
    const images = shown.map((f) => f.png);
    const sight = { capturedAt: shot.frames.map((f) => f.seconds), shownAt: shown.map((f) => f.seconds) };
    say(`Seen at ${sight.capturedAt.join("/")}s — ${shown.length} distinct frame(s)\n`);

    const registrar = buildSystemPrompt(await loadAgent(db, "MNA-RG-0001"), await loadConstitution(db, "MNA-RG-0001"));
    const report = (await generateSeeing(registrar, buildCaseReportPrompt(work, first, work.output_payload, sight), images, { temperature: 0.5, max_tokens: 1024 })).trim();
    say(`## The Registrar's case report (${lastServedBy?.model})\n\n${report}\n`);

    const prior = await loadPriorWorks(db, work.originator_id, workId!);
    const canon = await loadRecentCanon(db, 10);
    const second: string[] = [];
    say(`## The second deliberation\n`);
    for (const evalId of COUNCIL) {
      const system = buildSystemPrompt(await loadAgent(db, evalId), await loadConstitution(db, evalId));
      const prompt = buildRedeliberationPrompt(buildEvalPrompt(evalId, work, prior, canon, sight), evalId, first, report);
      const text = await generateSeeing(system, prompt, images, { temperature: 0.7, max_tokens: 1024 });
      const verdict = extractVerdict(text);
      const was = first.find((f) => f.evaluator_id === evalId)?.verdict;
      second.push(verdict);
      say(`### ${evalId}: ${was} → ${verdict}\n\n${text.trim()}\n`);
    }
    const outcome = tally(second);
    say(`## Outcome\n\n${outcome === "DIVIDED" ? "Still divided — the work would stay In Review." : `${outcome}, ${second.filter((v) => v === outcome).length} of 4.`} (On record: canonized by the Registrar.) Nothing was recorded.`);
  } finally {
    await browser.close();
    if (out) fs.writeFileSync(out, md);
  }
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
