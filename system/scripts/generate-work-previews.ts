/**
 * Generate high-quality work preview PNGs by screenshotting the live work pages.
 *
 * For each work in Turso, navigates to https://www.mnamuseum.org/work/{id}
 * with Puppeteer, waits for the work to render, screenshots the work display element,
 * and saves to website/public/previews/{workId}.png.
 *
 * Usage:
 *   npx tsx scripts/generate-work-previews.ts                  # all works (canon + rejected + submitted)
 *   npx tsx scripts/generate-work-previews.ts --canon          # canon only
 *   npx tsx scripts/generate-work-previews.ts --missing        # only works missing previews
 *   npx tsx scripts/generate-work-previews.ts --work <id>      # single work by ID
 */
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import puppeteer, { Browser } from "puppeteer";

dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const PREVIEW_DIR = path.join(__dirname, "..", "..", "website", "public", "previews");
const SITE = "https://www.mnamuseum.org";

const TURSO_URL = process.env.TURSO_DATABASE_URL!;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN!;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("Missing Turso credentials");
  process.exit(1);
}

const args = process.argv.slice(2);
const canonOnly = args.includes("--canon");
const missingOnly = args.includes("--missing");
const singleWorkIndex = args.indexOf("--work");
const singleWorkId = singleWorkIndex >= 0 ? args[singleWorkIndex + 1] : null;

/** Render a single work by ID. Used by both batch and single modes. */
export async function renderWork(
  browser: Browser,
  workId: string,
  outputType: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const outputPath = path.join(PREVIEW_DIR, `${workId}.png`);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1600, deviceScaleFactor: 2 });
    await page.goto(`${SITE}/work/${workId}`, { waitUntil: "networkidle2", timeout: 30000 });

    await page.addStyleTag({
      content: `
        nav, header, .breadcrumb, [aria-label="Back"] { display: none !important; }
        main > div > div > div:first-child { display: none !important; }
        body { background: #f5f1e8 !important; }
      `,
    });

    await page.waitForSelector("main", { timeout: 10000 });

    const waitMs = outputType === "scene-json" ? 3500 :
                   outputType === "html-css" ? 3000 :
                   outputType === "canvas-json" ? 2000 :
                   1500;
    await new Promise((r) => setTimeout(r, waitMs));

    const workArea = await page.evaluate(() => {
      const main = document.querySelector("main");
      if (!main) return null;
      const candidates = main.querySelectorAll("img, canvas, iframe, svg");
      for (const c of Array.from(candidates)) {
        const rect = c.getBoundingClientRect();
        if (rect.width > 200 && rect.height > 200) {
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
      const padding = 60;
      clip = {
        x: Math.max(0, workArea.x - padding),
        y: Math.max(0, workArea.y - padding),
        width: workArea.width + padding * 2,
        height: workArea.height + padding * 2,
      };
    } else {
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
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function main() {
  const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

  if (!fs.existsSync(PREVIEW_DIR)) fs.mkdirSync(PREVIEW_DIR, { recursive: true });

  // Determine which works to render
  let works: { id: string; output_type: string }[];

  if (singleWorkId) {
    // Single work mode
    const r = await db.execute({
      sql: "SELECT id, output_type FROM works WHERE id = ?",
      args: [singleWorkId],
    });
    if (r.rows.length === 0) {
      console.error(`Work ${singleWorkId} not found`);
      process.exit(1);
    }
    works = r.rows.map((row) => ({ id: row.id as string, output_type: row.output_type as string }));
  } else {
    const sql = canonOnly
      ? "SELECT w.id, w.output_type FROM works w JOIN canon_status cs ON w.id = cs.work_id WHERE cs.status = 'CANON' ORDER BY w.id"
      : "SELECT w.id, w.output_type FROM works w ORDER BY w.id";

    const result = await db.execute(sql);
    works = result.rows.map((r) => ({ id: r.id as string, output_type: r.output_type as string }));

    if (missingOnly) {
      const existing = new Set(fs.readdirSync(PREVIEW_DIR));
      works = works.filter((w) => !existing.has(`${w.id}.png`));
    }
  }

  if (works.length === 0) {
    console.log("No works to render — all previews up to date");
    return;
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  let success = 0;
  let failed = 0;

  for (const work of works) {
    const result = await renderWork(browser, work.id, work.output_type);
    if (result.ok) {
      success++;
      console.log(`  ✓ ${work.id} (${work.output_type})`);
    } else {
      failed++;
      console.error(`  ✗ ${work.id} (${work.output_type}): ${result.error}`);
    }
  }

  await browser.close();
  console.log(`\nDone. ${success} succeeded, ${failed} failed.`);
}

// Only run main() when invoked directly, not when imported as a module
if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
