/**
 * Regenerate preview PNGs by screenshotting the `/capture/work/[id]` bare
 * route against localhost. Produces clean, unframed, edge-to-edge 1000×1000
 * thumbnails for the collection grid.
 *
 * Usage:
 *   npx tsx scripts/regenerate-previews-unframed.ts              # all works
 *   npx tsx scripts/regenerate-previews-unframed.ts --canon      # canon only
 *   npx tsx scripts/regenerate-previews-unframed.ts --work <id>  # single work
 */
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import puppeteer from "puppeteer";

dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const PREVIEW_DIR = path.join(
  __dirname,
  "..",
  "..",
  "website",
  "public",
  "previews",
);
const BASE = process.env.CAPTURE_BASE || "http://localhost:3000";

const TURSO_URL = process.env.TURSO_DATABASE_URL!;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN!;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("Missing Turso credentials");
  process.exit(1);
}

const args = process.argv.slice(2);
const canonOnly = args.includes("--canon");
const singleIdx = args.indexOf("--work");
const singleId = singleIdx >= 0 ? args[singleIdx + 1] : null;

async function main() {
  const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

  if (!fs.existsSync(PREVIEW_DIR)) fs.mkdirSync(PREVIEW_DIR, { recursive: true });

  let works: { id: string; output_type: string }[];

  if (singleId) {
    const r = await db.execute({
      sql: "SELECT id, output_type FROM works WHERE id = ?",
      args: [singleId],
    });
    if (r.rows.length === 0) {
      console.error(`Work ${singleId} not found`);
      process.exit(1);
    }
    works = r.rows.map((row) => ({
      id: row.id as string,
      output_type: row.output_type as string,
    }));
  } else {
    const sql = canonOnly
      ? "SELECT w.id, w.output_type FROM works w JOIN canon_status cs ON w.id = cs.work_id WHERE cs.status = 'CANON' ORDER BY w.id"
      : "SELECT w.id, w.output_type FROM works w ORDER BY w.id";
    const r = await db.execute(sql);
    works = r.rows.map((row) => ({
      id: row.id as string,
      output_type: row.output_type as string,
    }));
  }

  console.log(`Capturing ${works.length} works from ${BASE}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    protocolTimeout: 240000,
  });

  let ok = 0;
  let fail = 0;

  for (const work of works) {
    const outputPath = path.join(PREVIEW_DIR, `${work.id}.png`);
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1000, height: 1000, deviceScaleFactor: 2 });
      await page.goto(`${BASE}/capture/work/${work.id}`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      await page.waitForSelector("#capture-target", { timeout: 10000 });

      // Strip Next.js dev overlay / error badges
      await page.addStyleTag({
        content: `
          nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog-overlay] {
            display: none !important;
          }
        `,
      });

      // Initial wait — let DOM settle
      await new Promise((r) => setTimeout(r, 800));

      // Interactive HTML works wait for a click. Simulate one inside the tile.
      if (work.output_type === "html-css") {
        try {
          const box = await (await page.$("#capture-target"))!.boundingBox();
          if (box) {
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          }
        } catch {
          /* noop */
        }
      }

      // Let animated renderers progress into visible state
      const waitMs =
        work.output_type === "scene-json"
          ? 4000
          : work.output_type === "html-css"
            ? 4500
            : work.output_type === "canvas-json"
              ? 3500
              : 1200;
      await new Promise((r) => setTimeout(r, waitMs));

      const el = await page.$("#capture-target");
      if (!el) throw new Error("#capture-target not found");
      await el.screenshot({
        path: outputPath as `${string}.png`,
        type: "png",
      });

      await page.close();
      ok++;
      console.log(`  ✓ ${work.id} (${work.output_type})`);
    } catch (e) {
      fail++;
      console.error(`  ✗ ${work.id}: ${(e as Error).message}`);
    }
  }

  await browser.close();
  console.log(`\nDone. ${ok} succeeded, ${fail} failed.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
