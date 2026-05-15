/**
 * generate-research-pdfs.ts
 *
 * Mirrors generate-standard-pdfs.ts but for research documents. Renders
 * each /research/[id]/print route to PDF using Puppeteer and writes
 * the result to /website/public/research/[id].pdf. The print route is
 * chromeless (LayoutShell skips nav/footer for that path) so what
 * Puppeteer captures is the printable institutional doc — same look
 * the visitor would see if they opened the print route directly.
 *
 * Usage:
 *   cd system
 *   npx tsx scripts/generate-research-pdfs.ts                  # all
 *   npx tsx scripts/generate-research-pdfs.ts --id MNA-IR-0003
 *
 * Requires the website dev server (or a built/start) on localhost:3000.
 */

import puppeteer from "puppeteer";
import path from "path";
import fs from "fs";

const BASE = process.env.CAPTURE_BASE || "http://localhost:3000";

/** Loaded straight from the published research JSON the website ships
 *  so the script and the site always agree on what exists. */
interface ResearchDoc {
  registry_id: string;
  title: string;
  status: string;
}

const RESEARCH_JSON_PATH = path.join(
  __dirname,
  "..",
  "..",
  "website",
  "src",
  "data",
  "research.json",
);

const OUT_DIR = path.join(
  __dirname,
  "..",
  "..",
  "website",
  "public",
  "research",
);

function parseArgs() {
  const args: Record<string, string> = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] ?? "true";
  }
  return args;
}

function loadPublishedDocs(): ResearchDoc[] {
  const raw = fs.readFileSync(RESEARCH_JSON_PATH, "utf8");
  const all = JSON.parse(raw) as ResearchDoc[];
  return all.filter((d) => d.status === "published");
}

async function main() {
  const args = parseArgs();
  const all = loadPublishedDocs();
  const targets = args.id ? all.filter((d) => d.registry_id === args.id) : all;
  if (targets.length === 0) {
    console.error(
      args.id
        ? `No published research document with id "${args.id}"`
        : "No published research documents to render.",
    );
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    for (const doc of targets) {
      const url = `${BASE}/research/${doc.registry_id}/print`;
      const outPath = path.join(OUT_DIR, `${doc.registry_id}.pdf`);
      process.stdout.write(`  [pdf] ${doc.registry_id} → ${outPath} ... `);

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
              <span>${doc.registry_id}</span>
            </div>`,
          footerTemplate: `
            <div style="font-size:7pt;color:#666;width:100%;padding:0 18mm 6mm 18mm;display:flex;justify-content:space-between;font-family:ui-sans-serif,system-ui,sans-serif;letter-spacing:0.16em;text-transform:uppercase;">
              <span>${doc.title.replace(/</g, "&lt;")}</span>
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
