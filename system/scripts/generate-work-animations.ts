/**
 * generate-work-animations.ts — animated thumbnails for works that move.
 *
 * The static preview catches one frame. Forty-four of the institution's works
 * animate — almost all html-css — and a single frame of a durational work is a
 * misrepresentation: Pulse's practice is literally "I make time visible through
 * rhythm", and a still frame shows none of it.
 *
 * So: capture a sequence, encode an animated WebP, and let the grid play it on
 * hover. Hover rather than autoplay is deliberate. Forty animations decoding at
 * once is both a performance problem and the wrong institutional register — an
 * archive that moves on its own is a feed. The page stays still until a visitor
 * attends to one work.
 *
 * No LLM calls. This is Puppeteer and libwebp, so it is unaffected by provider
 * quota.
 *
 *   npx tsx system/scripts/generate-work-animations.ts            # missing only
 *   npx tsx system/scripts/generate-work-animations.ts --force
 *   npx tsx system/scripts/generate-work-animations.ts --work <id>
 */

import { createClient } from "@libsql/client";
import { execFileSync } from "child_process";
import crypto from "crypto";
import dotenv from "dotenv";
import fs from "fs";
import os from "os";
import path from "path";
import puppeteer, { type Browser } from "puppeteer";

import { animationPlan } from "../../website/src/lib/render-timing";
import { OUTPUT_TYPES, OUTPUT_TYPE_IDS } from "../../website/src/lib/output-types";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.indexOf("--work") >= 0 ? args[args.indexOf("--work") + 1] : null;

const SITE = process.env.MNA_SITE_ORIGIN || "https://www.mnamuseum.org";
const OUT_DIR = path.join(__dirname, "..", "..", "website", "public", "previews");

/** Twelve frames — enough to read a loop, or a drawing, without bloating. */
const FRAMES = 12;
/** Thumbnails do not need capture resolution; this is what keeps files small. */
const EDGE = 480;
/** Per-animation ceiling. A grid of 30 cards must not pull megabytes. */
const MAX_BYTES = 300 * 1024;

const clean = (s?: string) => (s ?? "").replace(/\s/g, "");
const db = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});

/**
 * Works that move.
 *
 * Two ways in. Some media are animated by nature — a shader is a function of
 * time, a rule system unfolds, a toolpath draws itself — so they qualify on
 * output_type alone. Others (html-css, svg) move only if the Originator made
 * them move, so those are matched on payload.
 *
 * The type list IS `animated: true` in the registry, read directly — kept in
 * step by hand it drifted, and a medium admitted later never animated.
 */
const ANIMATED_TYPES = OUTPUT_TYPE_IDS.filter((id) => OUTPUT_TYPES[id].animated);

const ANIMATED_SQL = `
  SELECT id, output_type FROM works
   WHERE output_type IN (${ANIMATED_TYPES.map((t) => `'${t}'`).join(", ")})
      OR output_payload LIKE '%@keyframes%'
      OR output_payload LIKE '%animation:%'
      OR output_payload LIKE '%<animate%'
      OR output_payload LIKE '%requestAnimationFrame%'
   ORDER BY created_at DESC`;

async function captureFrames(
  browser: Browser,
  workId: string,
  outputType: string,
  tmp: string,
): Promise<{ frames: number; frameGapMs: number }> {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1100, height: 1100, deviceScaleFactor: 1 });
    // Same capture route the still previews use — it bypasses the click-to-play
    // gate, without which every html-css work records the play button instead.
    await page.goto(`${SITE}/capture/work/${workId}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForSelector("#capture-target, main", { timeout: 15000 });

    // A looping work is left to settle, then sampled across a few seconds of
    // its loop. A work that draws itself once and stops is sampled from its
    // first moment across the whole draw — sampling the middle of a nine-second
    // plot gave a thumbnail that both began late and ended early.
    const { startDelayMs, frameGapMs } = animationPlan(outputType, FRAMES);

    // The capture target exists in the DOM before it has been laid out, and
    // screenshotting it too early throws "not visible". A finite draw wants its
    // first frame as early as possible, so wait only for the mount, not longer.
    const MOUNT_MS = 400;
    await new Promise((r) => setTimeout(r, MOUNT_MS));

    const target = (await page.$("#capture-target")) ?? (await page.$("main"));
    if (!target) return { frames: 0, frameGapMs };

    const remaining = startDelayMs - MOUNT_MS;
    if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));

    for (let i = 0; i < FRAMES; i++) {
      await target.screenshot({ path: path.join(tmp, `f${String(i).padStart(2, "0")}.png`) as `${string}.png` });
      if (i < FRAMES - 1) await new Promise((r) => setTimeout(r, frameGapMs));
    }
    return { frames: FRAMES, frameGapMs };
  } finally {
    await page.close();
  }
}

/**
 * True when the frames actually differ — a "still" animation is not worth a file.
 *
 * Compared by content hash, not by file size. A size threshold gets this wrong:
 * MNA-OR-0002-W-0024 varies by 86 bytes across its loop, which a 256-byte
 * threshold reads as motionless when the work is plainly moving. PNG encoding is
 * deterministic, so byte-identical frames mean an identical image and any
 * difference at all means the work moved.
 */
function framesDiffer(tmp: string): boolean {
  const files = fs.readdirSync(tmp).filter((f) => f.endsWith(".png")).sort();
  if (files.length < 2) return false;
  const hashes = new Set(
    files.map((f) =>
      crypto.createHash("sha1").update(fs.readFileSync(path.join(tmp, f))).digest("hex"),
    ),
  );
  return hashes.size > 1;
}

function encodeWebp(tmp: string, outPath: string, frameGapMs: number): void {
  const frames = fs.readdirSync(tmp).filter((f) => f.endsWith(".png")).sort()
    .map((f) => path.join(tmp, f));
  // Downscale first; img2webp has no resize of its own. ffmpeg refuses to read
  // and write the same path, so scale to a sibling and swap.
  for (const f of frames) {
    const scaled = f.replace(/\.png$/, ".s.png");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", f,
      "-vf", `scale=${EDGE}:${EDGE}:flags=lanczos`, scaled], { stdio: "ignore" });
    fs.renameSync(scaled, f);
  }
  // Lossless FIRST, because the dark low-contrast works — Gap at #0a0a0a on
  // black, Pulse in near-black gradients — lose their motion entirely to lossy
  // encoding. At q72 a twelve-frame loop collapsed to two distinct frames.
  // Those works are flat and compress to a few KB losslessly.
  const encode = (extra: string[]) =>
    execFileSync("img2webp", ["-loop", "0", ...extra, "-d", String(frameGapMs), ...frames, "-o", outPath],
      { stdio: "ignore" });

  encode(["-lossless"]);

  // But busy, colourful works blow up losslessly — 13 of 34 came to 12.3 MB
  // between them while the other 21 totalled 1 MB. Those are exactly the works
  // where lossy is safe: their motion is carried by large bright changes, not
  // by differences a quantiser would erase. Step quality down until it fits.
  for (const q of ["82", "65"]) {
    if (fs.statSync(outPath).size <= MAX_BYTES) break;
    encode(["-lossy", "-q", q]);
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let works: { id: string; output_type: string }[];
  if (only) {
    const r = await db.execute({ sql: "SELECT id, output_type FROM works WHERE id = ?", args: [only] });
    works = r.rows.map((x) => ({ id: String(x.id), output_type: String(x.output_type) }));
  } else {
    const r = await db.execute(ANIMATED_SQL);
    works = r.rows.map((x) => ({ id: String(x.id), output_type: String(x.output_type) }));
  }

  if (!force && !only) {
    works = works.filter((w) => !fs.existsSync(path.join(OUT_DIR, `${w.id}.webp`)));
  }

  console.log(`generate-work-animations — ${works.length} work(s) to render`);
  if (works.length === 0) return;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  let made = 0, still = 0, failed = 0;
  try {
    for (const w of works) {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `mna-anim-${w.id}-`));
      try {
        const { frames: n, frameGapMs } = await captureFrames(browser, w.id, w.output_type, tmp);
        if (n === 0) { console.warn(`  ✗ ${w.id}: no capture target`); failed++; continue; }

        if (!framesDiffer(tmp)) {
          // Declared animation that does not visibly move. Not an error — some
          // works animate below the threshold of a downsampled thumbnail, which
          // is itself true of the work.
          console.log(`  · ${w.id}: frames identical — leaving the still preview`);
          still++;
          continue;
        }

        encodeWebp(tmp, path.join(OUT_DIR, `${w.id}.webp`), frameGapMs);
        const kb = Math.round(fs.statSync(path.join(OUT_DIR, `${w.id}.webp`)).size / 1024);
        console.log(`  ✓ ${w.id} (${w.output_type}) — ${kb} KB${kb > MAX_BYTES / 1024 ? " ⚠ over budget" : ""}`);
        made++;
      } catch (e) {
        console.warn(`  ✗ ${w.id}: ${e instanceof Error ? e.message.slice(0, 90) : String(e)}`);
        failed++;
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    }
  } finally {
    await browser.close();
  }

  // Manifest of which works have an animation, so the grid knows whether to
  // render a hover layer at all. Derived from what is actually on disk rather
  // than from what we intended to make.
  const ids = fs.readdirSync(OUT_DIR)
    .filter((f) => f.endsWith(".webp"))
    .map((f) => f.replace(/\.webp$/, ""))
    .sort();
  const manifestPath = path.join(__dirname, "..", "..", "website", "src", "data", "animated-works.json");
  fs.writeFileSync(manifestPath, JSON.stringify(ids, null, 2) + "\n");
  console.log(`  manifest: ${ids.length} works with animations → src/data/animated-works.json`);

  console.log(`\n[animations] ${made} encoded, ${still} static (no visible motion), ${failed} failed`);
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
