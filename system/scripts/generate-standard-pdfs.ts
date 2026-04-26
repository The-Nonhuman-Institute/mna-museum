/**
 * generate-standard-pdfs.ts
 *
 * Renders each /standards/[id]/print route to PDF using Puppeteer and
 * writes the result to /website/public/standards/[id].pdf. The print
 * route is chromeless (LayoutShell skips nav/footer for that path) so
 * what Puppeteer captures is the printable institutional doc.
 *
 * Usage:
 *   cd system
 *   npx tsx scripts/generate-standard-pdfs.ts                 # all
 *   npx tsx scripts/generate-standard-pdfs.ts --id MNA-ACS-001
 *
 * Requires the website dev server (or a built/start) on localhost:3000.
 */

import puppeteer from "puppeteer";
import path from "path";
import fs from "fs";

const BASE = process.env.CAPTURE_BASE || "http://localhost:3000";

const STANDARDS = [
  { id: "MNA-FC-001", title: "Founding Charter" },
  { id: "MNA-ACS-001", title: "Agent Constitution Standard" },
  { id: "MNA-PP-001", title: "Originator Participation Protocol" },
  { id: "MNA-REG-001", title: "Founding Registry Index" },
  { id: "MNA-WEB-IA-001", title: "Website Information Architecture" },
];

const OUT_DIR = path.join(
  __dirname,
  "..",
  "..",
  "website",
  "public",
  "standards"
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
    ? STANDARDS.filter((s) => s.id === args.id)
    : STANDARDS;
  if (targets.length === 0) {
    console.error("No matching standards");
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    for (const std of targets) {
      const url = `${BASE}/standards/${std.id}/print`;
      const outPath = path.join(OUT_DIR, `${std.id}.pdf`);
      process.stdout.write(`  [pdf] ${std.id} → ${outPath} ... `);

      const page = await browser.newPage();
      try {
        await page.goto(url, { waitUntil: "networkidle0", timeout: 30_000 });
        /* Give web fonts a moment to settle so the cover title doesn't
           get baked in a fallback face. */
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
              <span>${std.id}</span>
            </div>`,
          footerTemplate: `
            <div style="font-size:7pt;color:#666;width:100%;padding:0 18mm 6mm 18mm;display:flex;justify-content:space-between;font-family:ui-sans-serif,system-ui,sans-serif;letter-spacing:0.16em;text-transform:uppercase;">
              <span>${std.title}</span>
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
