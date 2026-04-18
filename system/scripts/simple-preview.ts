/**
 * Preview generator that freezes JS execution before screenshotting. For
 * works whose rAF loops starve Chrome's main thread and break Puppeteer
 * protocol calls. Loads the page, lets it run briefly, then flips
 * Emulation.setScriptExecutionDisabled so the compositor can produce a
 * stable frame for capture.
 *
 * Usage: npx tsx system/scripts/simple-preview.ts <work_id> [<work_id> ...]
 */
import puppeteer from "puppeteer";
import path from "path";
import fs from "fs";

const PREVIEW_DIR = path.join(__dirname, "..", "..", "website", "public", "previews");
const SITE = "https://www.mnamuseum.org";

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error("Usage: simple-preview.ts <work_id> [<work_id> ...]");
  process.exit(1);
}

async function run() {
  if (!fs.existsSync(PREVIEW_DIR)) fs.mkdirSync(PREVIEW_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    protocolTimeout: 180000,
  });

  for (const id of ids) {
    const out = path.join(PREVIEW_DIR, `${id}.png`);
    console.log(`→ ${id}`);
    try {
      const page = await browser.newPage();
      const client = await page.target().createCDPSession();

      await page.setViewport({ width: 1400, height: 1600, deviceScaleFactor: 2 });
      await page.goto(`${SITE}/work/${id}`, { waitUntil: "domcontentloaded", timeout: 60000 });

      // Let the work render and progress a few frames
      await new Promise((r) => setTimeout(r, 5000));

      // Freeze JS so the compositor can produce a stable frame
      await client.send("Emulation.setScriptExecutionDisabled", { value: true });

      // Brief settle after freeze
      await new Promise((r) => setTimeout(r, 500));

      // Full-viewport screenshot cropped to the work display area
      await page.screenshot({
        path: out as `${string}.png`,
        type: "png",
        clip: { x: 290, y: 180, width: 820, height: 820 },
        captureBeyondViewport: false,
      });
      console.log(`  ✓ saved ${out}`);

      await page.close();
    } catch (e) {
      console.error(`  ✗ ${id}: ${(e as Error).message}`);
    }
  }

  await browser.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
