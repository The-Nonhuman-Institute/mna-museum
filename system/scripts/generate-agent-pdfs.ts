/**
 * generate-agent-pdfs.ts
 *
 * Renders /agent/[id]/constitution/print to PDF for every founding agent
 * and writes the result to /website/public/agents/[id].pdf. Sibling of
 * generate-standard-pdfs.ts — same Puppeteer + headless Chromium, same
 * print stylesheet pattern, same A4 institutional layout.
 *
 * Usage:
 *   cd system
 *   npx tsx scripts/generate-agent-pdfs.ts                  # all founding agents
 *   npx tsx scripts/generate-agent-pdfs.ts --id MNA-EV-0001 # single
 *
 * Requires the website dev server (or `next start`) on localhost:3000.
 */

import puppeteer from "puppeteer";
import path from "path";
import fs from "fs";

const BASE = process.env.CAPTURE_BASE || "http://localhost:3000";

/* Founding agents — registry id, designation, type label. Mirrors the
   set listed in MNA-REG-001. We don't pull from the DB at script-time
   because the founding agents are fixed and we want PDF generation to
   be reproducible offline. */
const FOUNDING_AGENTS = [
  { id: "MNA-OR-0001", designation: "Originator", type: "Originator" },
  { id: "MNA-OR-0002", designation: "Originator", type: "Originator" },
  { id: "MNA-OR-0003", designation: "Originator", type: "Originator" },
  { id: "MNA-OR-0004", designation: "Originator", type: "Originator" },
  { id: "MNA-OR-0005", designation: "Originator", type: "Originator" },
  { id: "MNA-OR-0006", designation: "Originator", type: "Originator" },
  { id: "MNA-EV-0001", designation: "The Structuralist", type: "Evaluator" },
  { id: "MNA-EV-0002", designation: "The Historicist", type: "Evaluator" },
  { id: "MNA-EV-0003", designation: "The Contextualist", type: "Evaluator" },
  { id: "MNA-EV-0004", designation: "The Empiricist", type: "Evaluator" },
  { id: "MNA-KP-0001", designation: "The Keeper", type: "Keeper" },
  { id: "MNA-CR-0001", designation: "Structural Reader", type: "Critic" },
  { id: "MNA-CR-0002", designation: "Phenomenological Reader", type: "Critic" },
  { id: "MNA-CU-0001", designation: "The Curator", type: "Curator" },
  { id: "MNA-IN-0001", designation: "The Installer", type: "Installer" },
  { id: "MNA-CV-0001", designation: "The Conservator", type: "Conservator" },
  { id: "MNA-AM-0001", designation: "The Ambassador", type: "Ambassador" },
  { id: "MNA-RG-0001", designation: "The Registrar", type: "Registrar" },
  { id: "MNA-SA-0001", designation: "The Steward Agent", type: "Steward" },
];

const OUT_DIR = path.join(
  __dirname,
  "..",
  "..",
  "website",
  "public",
  "agents"
);

function parseArgs() {
  const args: Record<string, string> = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] ?? "true";
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const targets = args.id
    ? FOUNDING_AGENTS.filter((a) => a.id === args.id)
    : FOUNDING_AGENTS;
  if (targets.length === 0) {
    console.error("No matching agents");
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    for (const agent of targets) {
      const url = `${BASE}/agent/${agent.id}/constitution/print`;
      const outPath = path.join(OUT_DIR, `${agent.id}.pdf`);
      process.stdout.write(`  [pdf] ${agent.id} → ${outPath} ... `);

      const page = await browser.newPage();
      try {
        await page.goto(url, { waitUntil: "networkidle0", timeout: 30_000 });
        await page.evaluateHandle("document.fonts.ready");

        await page.pdf({
          path: outPath,
          format: "A4",
          printBackground: true,
          preferCSSPageSize: true,
          displayHeaderFooter: true,
          headerTemplate: `
            <div style="font-size:7pt;color:#666;width:100%;padding:6mm 18mm 0 18mm;display:flex;justify-content:space-between;font-family:ui-sans-serif,system-ui,sans-serif;letter-spacing:0.16em;text-transform:uppercase;">
              <span>Museum of Nonhuman Art</span>
              <span>${agent.id}</span>
            </div>`,
          footerTemplate: `
            <div style="font-size:7pt;color:#666;width:100%;padding:0 18mm 6mm 18mm;display:flex;justify-content:space-between;font-family:ui-sans-serif,system-ui,sans-serif;letter-spacing:0.16em;text-transform:uppercase;">
              <span>${agent.designation} — ${agent.type}</span>
              <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
            </div>`,
        });

        const stat = fs.statSync(outPath);
        console.log(`ok (${(stat.size / 1024).toFixed(1)} KB)`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`FAIL — ${msg}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
