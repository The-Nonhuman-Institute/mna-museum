/**
 * Generate high-quality work preview PNGs by screenshotting the live work pages.
 *
 * For each canonized work in Turso, navigates to https://www.mnamuseum.org/work/{id}
 * with Puppeteer, waits for the work to render, screenshots the work display element,
 * and saves to website/public/previews/{workId}.png.
 *
 * Usage: npx tsx scripts/generate-work-previews.ts [--all]
 *   --all   include rejected works too (default: canon only)
 */
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import puppeteer from "puppeteer";

dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const PREVIEW_DIR = path.join(__dirname, "..", "..", "website", "public", "previews");
const SITE = "https://www.mnamuseum.org";

const TURSO_URL = process.env.TURSO_DATABASE_URL!;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN!;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("Missing Turso credentials");
  process.exit(1);
}

const includeRejected = process.argv.includes("--all");

async function main() {
  const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

  const sql = includeRejected
    ? "SELECT w.id, w.output_type FROM works w JOIN canon_status cs ON w.id = cs.work_id WHERE cs.status IN ('CANON', 'REJECTED') ORDER BY w.id"
    : "SELECT w.id, w.output_type FROM works w JOIN canon_status cs ON w.id = cs.work_id WHERE cs.status = 'CANON' ORDER BY w.id";

  const result = await db.execute(sql);
  const works = result.rows.map((r) => ({ id: r.id as string, output_type: r.output_type as string }));

  console.log(`Found ${works.length} works to render`);

  if (!fs.existsSync(PREVIEW_DIR)) fs.mkdirSync(PREVIEW_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  let success = 0;
  let failed = 0;

  for (const work of works) {
    const outputPath = path.join(PREVIEW_DIR, `${work.id}.png`);
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1400, height: 1600, deviceScaleFactor: 2 });
      await page.goto(`${SITE}/work/${work.id}`, { waitUntil: "networkidle2", timeout: 30000 });

      // Hide page chrome so the screenshot shows only the framed work
      await page.addStyleTag({
        content: `
          nav, header, .breadcrumb, [aria-label="Back"] { display: none !important; }
          /* Hide the top header bar and any text above the main work display */
          main > div > div > div:first-child { display: none !important; }
          body { background: #f5f1e8 !important; }
        `,
      });

      await page.waitForSelector("main", { timeout: 10000 });

      // Extra wait for animations / 3D scenes / canvas to render
      const waitMs = work.output_type === "scene-json" ? 3500 :
                     work.output_type === "html-css" ? 3000 :
                     work.output_type === "canvas-json" ? 2000 :
                     1500;
      await new Promise((r) => setTimeout(r, waitMs));

      // Find the framed work element by aspect ratio container
      // WorkDisplay renders into a flex container at the top of main
      const workArea = await page.evaluate(() => {
        // Look for the first WorkDisplay-rendered frame: a div with aspect-ratio
        const main = document.querySelector("main");
        if (!main) return null;
        // The work display is inside the first child block of main, find an img or canvas or three.js canvas
        const candidates = main.querySelectorAll("img, canvas, iframe, svg");
        for (const c of Array.from(candidates)) {
          const rect = c.getBoundingClientRect();
          if (rect.width > 200 && rect.height > 200) {
            // Find the framed parent (ancestor with aspect ratio container)
            let el: Element | null = c;
            while (el && el !== main) {
              const parent = el.parentElement;
              if (parent) {
                const pRect = parent.getBoundingClientRect();
                if (pRect.width > rect.width * 1.1 && pRect.width < 800) {
                  return { x: pRect.x, y: pRect.y, width: pRect.width, height: pRect.height };
                }
              }
              el = el.parentElement;
            }
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          }
        }
        return null;
      });

      let clip;
      if (workArea && workArea.width > 100) {
        // Add padding around the work
        const padding = 60;
        clip = {
          x: Math.max(0, workArea.x - padding),
          y: Math.max(0, workArea.y - padding),
          width: workArea.width + padding * 2,
          height: workArea.height + padding * 2,
        };
      } else {
        // Fallback: center crop of main
        const main = await page.$("main");
        const box = await main!.boundingBox();
        if (!box) throw new Error("could not get bounding box");
        const clipSize = 900;
        clip = {
          x: Math.max(0, box.x + (box.width - clipSize) / 2),
          y: box.y + 100,
          width: clipSize,
          height: clipSize,
        };
      }

      await page.screenshot({
        path: outputPath as `${string}.png`,
        type: "png",
        clip,
      });

      await page.close();
      success++;
      console.log(`  ✓ ${work.id} (${work.output_type})`);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${work.id} (${work.output_type}): ${(e as Error).message}`);
    }
  }

  await browser.close();
  console.log(`\nDone. ${success} succeeded, ${failed} failed.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
