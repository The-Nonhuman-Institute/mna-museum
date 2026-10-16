/**
 * council-sight-check.ts — can the Council see?
 *
 * Photographs one work exactly as an evaluation would (the site's renderers, at
 * SIGHT_SECONDS), puts it before one evaluator with the full seeing prompt, and
 * prints what came back. READS ONLY: no verdict, event or status is written.
 *
 * Run it after changing the seeing model, its key or the capture, or when works
 * start being held. Locally it goes through the signed-in Ollama daemon; in the
 * council-sight-check workflow, through ollama.com with OLLAMA_API_KEY.
 *
 *   npx tsx system/scripts/council-sight-check.ts [--work <id>] [--evaluator MNA-EV-0004]
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import puppeteer from "puppeteer";
import {
  SIGHT_SECONDS,
  buildEvalPrompt,
  buildSystemPrompt,
  distinctFrames,
  extractVerdict,
  loadAgent,
  loadConstitution,
  loadPriorWorks,
  loadRecentCanon,
  loadWork,
} from "../src/council";
import { captureFrames, openHarness } from "../src/harness-capture";
import { generateSeeing, lastServedBy } from "../src/llm";

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const args = process.argv.slice(2);
const flag = (n: string, d: string) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : d);
const workId = flag("--work", "MNA-OR-0008-W-0024");
const evalId = flag("--evaluator", "MNA-EV-0004");
const SITE = process.env.MNA_SITE_ORIGIN || "https://www.mnamuseum.org";

async function main() {
  const db = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN! });
  const work = await loadWork(db, workId);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const shot = await captureFrames(await openHarness(browser, SITE), work.output_type, work.output_payload, SIGHT_SECONDS);
    if ("error" in shot) {
      console.log(`✗ ${workId} did not render: ${shot.error}`);
      process.exit(1);
    }
    const shown = distinctFrames(shot.frames);
    console.log(`✓ captured ${workId} at ${SIGHT_SECONDS.join("/")}s — ${shown.length} distinct frame(s) at ${shown.map((f) => f.seconds).join("/")}s`);
    const prompt = buildEvalPrompt(evalId, work, await loadPriorWorks(db, work.originator_id, workId), await loadRecentCanon(db, 10), {
      capturedAt: shot.frames.map((f) => f.seconds),
      shownAt: shown.map((f) => f.seconds),
    });
    const system = buildSystemPrompt(await loadAgent(db, evalId), await loadConstitution(db, evalId));
    const t0 = Date.now();
    const text = await generateSeeing(system, prompt, shown.map((f) => f.png), { temperature: 0.7, max_tokens: 1024 });
    console.log(`✓ ${evalId} looked and judged in ${Math.round((Date.now() - t0) / 1000)}s via ${lastServedBy?.provider}/${lastServedBy?.model}: ${extractVerdict(text)}`);
    console.log(`  ${text.replace(/\s+/g, " ").trim().slice(0, 600)}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
