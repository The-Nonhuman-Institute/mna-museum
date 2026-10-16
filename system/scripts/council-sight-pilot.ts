/**
 * council-sight-pilot.ts — what the Council says when it can see the work.
 *
 * For each work: photograph it through the site's real renderers, then put it
 * before each evaluator three ways — the verdict on record (given the source
 * only), the seeing model given the source only, and the seeing model given the
 * source and the image. The middle column separates the effect of sight from
 * the effect of a different model.
 *
 * READS ONLY. No verdict, event or status is written; this decides nothing. It
 * exists so the founding steward can read the difference before the Council is
 * changed.
 *
 *   npx tsx system/scripts/council-sight-pilot.ts --works <id,id> --out <dir>
 *   [--site https://www.mnamuseum.org] [--minutes 45]
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import {
  COUNCIL,
  buildEvalPrompt,
  buildSystemPrompt,
  extractVerdict,
  loadAgent,
  loadConstitution,
  loadPriorWorks,
  loadRecentCanon,
  loadWork,
} from "../src/council";
import { captureBase64, openHarness } from "../src/harness-capture";
import { generateSeeing, seeingModel } from "../src/llm";
import { retryOnStaleSocket } from "../src/ops-checks";

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const args = process.argv.slice(2);
const flag = (name: string) => (args.indexOf(name) >= 0 ? args[args.indexOf(name) + 1] : undefined);
const works = (flag("--works") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const outDir = flag("--out");
const site = flag("--site") ?? "https://www.mnamuseum.org";
const deadline = Date.now() + Number(flag("--minutes") ?? 45) * 60_000;
const CAPTURE_SECONDS = 6;

if (!works.length || !outDir) {
  console.error("usage: council-sight-pilot.ts --works <id,id> --out <dir>");
  process.exit(2);
}

// Model calls run minutes apart, long enough for Turso to close the idle
// connection; the first pilot run died on exactly that. Every query here reads.
const db = retryOnStaleSocket(createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN! }));
const report = path.join(outDir, "pilot.md");
const write = (s: string) => fs.appendFileSync(report, s);

async function recorded(workId: string, evalId: string) {
  const r = await db.execute({
    sql: "SELECT verdict, rationale FROM evaluations WHERE work_id = ? AND evaluator_id = ? ORDER BY id DESC LIMIT 1",
    args: [workId, evalId],
  });
  const row = r.rows[0] as unknown as { verdict: string; rationale: string } | undefined;
  return row ?? null;
}

async function ask(system: string, user: string, png: string | null): Promise<string> {
  if (Date.now() > deadline) return "(skipped: pilot time limit reached)";
  try {
    const text = await generateSeeing(system, user, png, { temperature: 0.7, max_tokens: 1024 });
    return `${extractVerdict(text)}\n\n${text.trim()}`;
  } catch (e) {
    return `(failed: ${e instanceof Error ? e.message.slice(0, 200) : String(e)})`;
  }
}

async function main() {
  fs.mkdirSync(outDir!, { recursive: true });
  fs.writeFileSync(report, `# Council sight pilot\n\nSite: ${site} · seeing model: ${seeingModel()} · ${new Date().toISOString()}\n\nReads only; nothing here was recorded.\n\n`);
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const page = await openHarness(browser, site);
    for (const id of works) {
      const work = await loadWork(db, id);
      console.log(`[pilot] ${id} (${work.output_type}) — capturing`);
      const shot = await captureBase64(page, work.output_type, work.output_payload, CAPTURE_SECONDS * 1000);
      if ("error" in shot) {
        write(`## ${id}\n\nCould not capture: ${shot.error}\n\n`);
        continue;
      }
      fs.writeFileSync(path.join(outDir!, `${id}.png`), Buffer.from(shot.png, "base64"));
      write(`## ${id} — ${work.medium}\n\n![${id}](${id}.png)\n\n`);
      const prior = await loadPriorWorks(db, work.originator_id, id);
      const canon = await loadRecentCanon(db, 10);
      for (const evalId of COUNCIL) {
        const system = buildSystemPrompt(await loadAgent(db, evalId), await loadConstitution(db, evalId));
        const blindPrompt = buildEvalPrompt(evalId, work, prior, canon);
        const seeingPrompt = buildEvalPrompt(evalId, work, prior, canon, { capturedAt: [CAPTURE_SECONDS], shownAt: [CAPTURE_SECONDS] });
        const rec = await recorded(id, evalId);
        console.log(`[pilot]   ${evalId} — blind`);
        const blind = await ask(system, blindPrompt, null);
        console.log(`[pilot]   ${evalId} — seeing`);
        const seeing = await ask(system, seeingPrompt, shot.png);
        write(`### ${evalId}\n\n**On record (source only):** ${rec ? rec.verdict : "(none)"}\n\n${rec ? rec.rationale.trim() : ""}\n\n**${seeingModel()}, source only:** ${blind}\n\n**${seeingModel()}, source and image:** ${seeing}\n\n---\n\n`);
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`[pilot] done → ${report}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : String(e));
  process.exit(1);
});
