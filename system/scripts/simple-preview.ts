/**
 * Preview generator for individual works. Uses the /capture/work/[id]
 * route — that route renders the work with forceMount=true so the
 * iframe mounts immediately (no click-to-play gate).
 *
 * For works with their own click-to-begin inside the iframe (web
 * audio, click-gated visuals like Tactus' Irrational / Dissolution),
 * the script synthesizes a real user-gesture click inside the iframe
 * via puppeteer's Frame API. Then waits for the work to advance past
 * its splash and produce a representative frame.
 *
 *   npx tsx system/scripts/simple-preview.ts MNA-OR-0007-W-0009
 *   npx tsx system/scripts/simple-preview.ts <id1> <id2> ...
 *
 * The script PUTS the new PNG into website/public/previews/. Commit
 * the resulting file to surface it on production.
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
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--autoplay-policy=no-user-gesture-required"],
    protocolTimeout: 180000,
  });

  for (const id of ids) {
    const out = path.join(PREVIEW_DIR, `${id}.png`);
    console.log(`→ ${id}`);
    try {
      const page = await browser.newPage();
      const client = await page.target().createCDPSession();

      await page.setViewport({ width: 1000, height: 1000, deviceScaleFactor: 2 });
      // Use the capture route — renders the work full-bleed in a
      // 1000×1000 container with forceMount=true (iframe mounts
      // immediately, no click-gate UI on top).
      await page.goto(`${SITE}/capture/work/${id}`, { waitUntil: "domcontentloaded", timeout: 60000 });

      // Wait for the iframe to mount inside the capture target.
      await page.waitForSelector("#capture-target iframe", { timeout: 30000 }).catch(() => null);

      // Settle: 1.5s lets the iframe document parse + initial scripts
      // run. After this the iframe's own click-to-begin gate (if any)
      // is showing.
      await new Promise((r) => setTimeout(r, 1500));

      // Synthesize a real user-gesture click inside the iframe at its
      // visual center. Web Audio API needs the gesture; click-gated
      // works (Tactus Irrational / Dissolution / etc.) need it to
      // advance past their splash. Idempotent for works that don't
      // need it — clicking on a non-interactive surface is harmless.
      const iframeHandle = await page.$("#capture-target iframe");
      if (iframeHandle) {
        const box = await iframeHandle.boundingBox();
        if (box) {
          const cx = box.x + box.width / 2;
          const cy = box.y + box.height / 2;
          await page.mouse.click(cx, cy, { delay: 50 });
          console.log(`  · clicked iframe at (${Math.round(cx)}, ${Math.round(cy)})`);
        }
      }

      // Let the work advance past its boot. 4s is enough for most
      // animated frequency/canvas works to display a representative
      // frame; click-to-begin works typically need ~1s past the click
      // for the canvas to populate.
      await new Promise((r) => setTimeout(r, 4500));

      // Freeze JS so the compositor produces a stable frame. Works
      // whose rAF loops starve the main thread can otherwise break
      // the Puppeteer protocol mid-capture.
      await client.send("Emulation.setScriptExecutionDisabled", { value: true });
      await new Promise((r) => setTimeout(r, 500));

      // Capture the #capture-target element directly — that's the
      // 1000×1000 work container the capture route defines.
      const target = await page.$("#capture-target");
      if (!target) throw new Error("#capture-target not found on capture route");
      await target.screenshot({
        path: out as `${string}.png`,
        type: "png",
        captureBeyondViewport: false,
      });
      const stats = fs.statSync(out);
      console.log(`  ✓ saved ${out} (${(stats.size / 1024).toFixed(1)} KB)`);

      await page.close();
    } catch (e) {
      console.error(`  ✗ ${id}: ${(e as Error).message}`);
    }
  }

  await browser.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
