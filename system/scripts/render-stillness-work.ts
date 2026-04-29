/**
 * One-off renderer for stillness/reveal works that the smart-capture
 * preview pipeline can't catch — works whose canvas requires sustained
 * non-interaction to draw anything.
 *
 * Loads the work payload directly from Turso, writes it to a tmp file,
 * opens it in Puppeteer with the page already "still" (no mouse moves
 * registered, performance.now offset so timeSinceMove starts well past
 * the reveal threshold), waits for canvas activity, then screenshots
 * just the canvas viewport into public/previews/{id}.png.
 *
 * Usage:
 *   npx tsx scripts/render-stillness-work.ts MNA-OR-0008-W-0007
 */
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import puppeteer from "puppeteer";

dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const PREVIEW_DIR = path.join(__dirname, "..", "..", "website", "public", "previews");
const TURSO_URL = process.env.TURSO_DATABASE_URL!;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN!;

const workId = process.argv[2];
if (!workId) {
  console.error("Usage: render-stillness-work.ts <work-id>");
  process.exit(1);
}

async function main() {
  const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
  const r = await db.execute({
    sql: "SELECT id, output_type, output_payload FROM works WHERE id = ?",
    args: [workId],
  });
  if (r.rows.length === 0) {
    console.error(`Work ${workId} not found`);
    process.exit(1);
  }
  const row = r.rows[0];
  const payload = row.output_payload as string;

  if (!fs.existsSync(PREVIEW_DIR)) fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  const outputPath = path.join(PREVIEW_DIR, `${workId}.png`);

  /* The work's revelation clock rises at RISE_RATE per frame. Default is
     1/45 → full reveal after 45s of stillness. We rewrite that constant
     to 1 so the work reaches full revelation in ~1s. We also bump the
     near-zero short-circuit threshold so the first visible frame paints
     immediately instead of skipping. The original payload is preserved
     in DB; this rewrite is preview-only. */
  const tmpHtml = path.join(PREVIEW_DIR, `.${workId}.tmp.html`);
  const rewritten = payload
    .replace(/const\s+RISE_RATE\s*=\s*1\s*\/\s*45\s*;/g, "const RISE_RATE = 1;")
    .replace(/if\s*\(\s*revelation\s*<\s*0\.001\s*\)/g, "if (false)");
  fs.writeFileSync(tmpHtml, rewritten);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--hide-scrollbars"],
    protocolTimeout: 300000,
  });

  try {
    const page = await browser.newPage();
    /* Square viewport so the screenshot fills the canvas evenly. The
       work is full-bleed and renders to 100vw/100vh inside, so we pick
       a 1400×1400 viewport (with 2x DPR for retina sharpness). */
    await page.setViewport({ width: 1400, height: 1400, deviceScaleFactor: 2 });
    /* Disable mouse — the canvas listens for mousemove on itself, but
       Puppeteer doesn't dispatch any unless told to. Just to be safe,
       move the cursor far off-screen before navigation. */
    await page.mouse.move(-100, -100);

    await page.goto(`file://${tmpHtml}`, { waitUntil: "domcontentloaded", timeout: 60000 });

    /* Don't try to sample the canvas via page.evaluate — the work's tight
       rAF loop blocks the main thread tightly enough that puppeteer's RPC
       calls time out under load. Just wait long enough for the work's
       internal "revelation" clock to reach full reveal, then screenshot.
       perf.now is offset by +60s in the injected wrapper, so revelation
       (which rises at 1/45 per second of stillness) is already > 1.0
       from frame zero — but we wait an extra 8s for the canvas to settle
       into its ambient pulse. */
    await new Promise((r) => setTimeout(r, 8000));

    /* Capture the canvas at viewport size, square crop centered. */
    await page.screenshot({
      path: outputPath as `${string}.png`,
      type: "png",
      clip: { x: 0, y: 0, width: 1400, height: 1400 },
    });
    console.log(`  ✓ ${workId} → ${outputPath}`);
  } finally {
    await browser.close();
    if (fs.existsSync(tmpHtml)) fs.unlinkSync(tmpHtml);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
