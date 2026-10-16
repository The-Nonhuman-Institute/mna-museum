/**
 * render-matrix.ts — MNA-OPS-001 §V, checks E2 and E3.
 *
 * Proves that every medium in the registry renders something, and that every
 * medium shares as the file it promises. It uses fixtures rather than works, so
 * a medium is proven before an Originator relies on it — three media were
 * opened in August and none was exercised end to end until a real work arrived,
 * which is how a typeface came to share as a card bearing its own ID and an
 * audio work came to play silence.
 *
 * Nothing here is submitted, recorded, or shown to anyone. The fixtures are
 * scaffolding, not works.
 *
 * Needs a browser, so it runs in the operations round rather than in CI.
 *
 *   npx tsx system/scripts/render-matrix.ts
 *   npx tsx system/scripts/render-matrix.ts --only shader-glsl,typeface-json
 *   npx tsx system/scripts/render-matrix.ts --render-only
 */

import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import puppeteer, { type Browser, type Page } from "puppeteer";

import { FIXTURES, INGREDIENT_FIXTURES } from "../../website/tests/fixtures/media";
import { HOST_TYPE_IDS, OUTPUT_TYPES, OUTPUT_TYPE_IDS } from "../../website/src/lib/output-types";

const args = process.argv.slice(2);
const renderOnly = args.includes("--render-only");
const onlyArg = args.indexOf("--only") >= 0 ? args[args.indexOf("--only") + 1] : null;
const ONLY = onlyArg ? new Set(onlyArg.split(",").map((s) => s.trim())) : null;
const SITE = process.env.MNA_SITE_ORIGIN || "https://www.mnamuseum.org";

interface Result {
  medium: string;
  check: "render" | "ingredient" | "share";
  ok: boolean;
  detail: string;
}

const results: Result[] = [];
const note = (r: Result) => {
  results.push(r);
  console.log(`  ${r.ok ? "✓" : "✗"} ${r.medium.padEnd(16)} ${r.check.padEnd(11)} ${r.detail}`);
};

/**
 * A page carrying the site's own bundle, so renderers are the real ones.
 *
 * The harness route renders whatever payload it is handed. It exists only in
 * development and in this check; it never appears in navigation and records
 * nothing.
 */
async function harness(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 900, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log(`     [pageerror] ${String(e).slice(0, 120)}`));
  await page.goto(`${SITE}/harness`, { waitUntil: "networkidle2", timeout: 90000 });
  return page;
}

/**
 * Draw a payload and report whether anything was actually painted.
 *
 * Measured by screenshotting the element, NOT by drawImage-ing the page's
 * canvases into another canvas. That was the first approach and it reported
 * scene-json as blank while the scene rendered perfectly: reading back from a
 * WebGL canvas returns nothing unless the context was created with
 * preserveDrawingBuffer, which three.js does not do by default. The metric was
 * broken, not the renderer.
 *
 * A screenshot is what a visitor sees, which is the only thing worth asserting
 * on, and it is how the preview generator has always worked.
 */
async function capture(
  page: Page,
  type: string,
  payload: string,
  waitMs: number,
): Promise<{ shot: string } | { error: string }> {
  await page.evaluate(
    (t, p) => (window as unknown as { __mnaRender: (t: string, p: string) => void }).__mnaRender(t, p),
    type,
    payload,
  );
  await new Promise((r) => setTimeout(r, waitMs));

  const target = await page.$("#harness-target");
  if (!target) return { error: "no harness target" };

  // A renderer's error message is text, and text has plenty of colours. Asked
  // only "did anything paint", E2 passed a shader that failed to compile.
  const rendererError = await page.$eval("#harness-target", (el) =>
    el.querySelector("[data-render-error]")?.getAttribute("data-render-error") ?? null,
  );
  if (rendererError) return { error: `renderer error: ${rendererError.slice(0, 70)}` };

  // html-css renders in a sandboxed iframe. It is captured like everything
  // else, because a screenshot sees through an iframe where a canvas cannot.
  const shot = path.join(os.tmpdir(), `mna-matrix-${type.replace(/[^a-z0-9-]/gi, "")}-${Date.now()}.png`);
  await target.screenshot({ path: shot as `${string}.png` });
  return { shot };
}

/** Run a Pillow script over screenshots, removing them afterwards. */
function measure(script: string, shots: string[]): number | string {
  try {
    const n = Number(execFileSync("python3", ["-c", script, ...shots], { encoding: "utf8" }).trim());
    return Number.isFinite(n) ? n : "could not measure";
  } catch (e) {
    return `measure failed: ${e instanceof Error ? e.message.slice(0, 60) : String(e)}`;
  } finally {
    for (const s of shots) try { fs.unlinkSync(s); } catch { /* already gone */ }
  }
}

async function renderAndMeasure(page: Page, type: string, payload: string, waitMs: number) {
  const c = await capture(page, type, payload, waitMs);
  if ("error" in c) return { ok: false, reason: c.error };
  const colours = measure(COUNT_COLOURS, [c.shot]);
  if (typeof colours === "string") return { ok: false, reason: colours };
  // An audio work paints a control, not an image, and a text work paints
  // glyphs — both clear this easily. A frame that never painted is one
  // colour.
  return { ok: colours >= 2, reason: `${colours >= 64 ? "64+" : colours} colours` };
}

/**
 * Whether a host's surface actually shows, judged against the same host without it.
 *
 * "Did anything paint" cannot answer this: the host paints whether or not its
 * material does. The canvas fixture is a background and one rectangle, so with
 * its shader surface missing it is two colours, and E2 passed it — through
 * every round from 2026-10-03, while MNA-OR-0002-W-0035's five shader surfaces
 * drew nothing on the site.
 *
 * So the host is drawn twice, with and without its surface, for the same time
 * (a rule system unfolds, and a later capture gains colours for that reason
 * alone), and the surface must bring colours the bare host never shows.
 * Counting new colours rather than comparing totals is what lets a graph pass:
 * its nodes are a few pixels each, so its material adds dozens of colours, not
 * thousands, where a canvas rectangle adds thousands.
 */
const NEW_COLOURS_FROM_SURFACE = 32;

async function ingredientShows(page: Page, host: string, payload: string) {
  const withSurface = await capture(page, host, payload, 12000);
  if ("error" in withSurface) return { ok: false, reason: withSurface.error };
  const bare = await capture(page, host, JSON.stringify(stripSurfaces(JSON.parse(payload))), 12000);
  if ("error" in bare) {
    try { fs.unlinkSync(withSurface.shot); } catch { /* already gone */ }
    return { ok: false, reason: `bare host: ${bare.error}` };
  }
  const added = measure(NEW_COLOURS, [withSurface.shot, bare.shot]);
  if (typeof added === "string") return { ok: false, reason: added };
  return {
    ok: added >= NEW_COLOURS_FROM_SURFACE,
    reason: `${added >= 4096 ? "4096+" : added} colours the bare host does not have`,
  };
}

/** The same spec with every `surface` removed, at any depth. */
function stripSurfaces(spec: unknown): unknown {
  if (Array.isArray(spec)) return spec.map(stripSurfaces);
  if (!spec || typeof spec !== "object") return spec;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(spec)) if (k !== "surface") out[k] = stripSurfaces(v);
  return out;
}

const COUNT_COLOURS = `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGB")
seen = set()
for px in im.getdata():
    seen.add(px)
    if len(seen) >= 64:
        break
print(len(seen))
`;

/** Colours in the first screenshot that never appear in the second, to 4096. */
const NEW_COLOURS = `
import sys
from PIL import Image
bare = set(Image.open(sys.argv[2]).convert("RGB").getdata())
added = set()
for px in Image.open(sys.argv[1]).convert("RGB").getdata():
    if px not in bare:
        added.add(px)
        if len(added) >= 4096:
            break
print(len(added))
`;

async function main() {
  const media = OUTPUT_TYPE_IDS.filter((id) => !ONLY || ONLY.has(id));
  console.log(`render-matrix — ${media.length} medium(s) against ${SITE}\n`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await harness(browser);

    // ── E2: every medium renders ──
    for (const id of media) {
      // A rule system or toolpath unfolds; give it its declared time.
      const wait = OUTPUT_TYPES[id].animated ? 9500 : 2500;
      try {
        const r = await renderAndMeasure(page, id, FIXTURES[id], wait);
        note({ medium: id, check: "render", ok: r.ok, detail: r.reason });
      } catch (e) {
        note({ medium: id, check: "render", ok: false, detail: e instanceof Error ? e.message.slice(0, 90) : String(e) });
      }
    }

    // ── E2b: every host renders its ingredient ──
    for (const id of HOST_TYPE_IDS.filter((h) => !ONLY || ONLY.has(h))) {
      try {
        // The ingredient mounts its own renderer offscreen first, so this is
        // slower than the plain path by design.
        const r = await ingredientShows(page, id, INGREDIENT_FIXTURES[id]);
        note({ medium: id, check: "ingredient", ok: r.ok, detail: r.reason });
      } catch (e) {
        note({ medium: id, check: "ingredient", ok: false, detail: e instanceof Error ? e.message.slice(0, 90) : String(e) });
      }
    }

    // ── E3: every medium shares as what it promised ──
    if (!renderOnly) {
      for (const id of media) {
        try {
          const r = await page.evaluate(
            async (t, p) => (window as unknown as {
              __mnaShare: (t: string, p: string) => Promise<{ kind: string; name: string; type: string; size: number; head: string } | null>;
            }).__mnaShare(t, p),
            id,
            FIXTURES[id],
          );
          if (!r) { note({ medium: id, check: "share", ok: false, detail: "produced no file" }); continue; }

          const brand = Buffer.from(r.head, "hex").toString("latin1");
          let ok = r.size > 1000;
          let detail = `${r.kind} ${r.type} ${Math.round(r.size / 1024)}KB`;

          if (r.kind === "video") {
            // VP9 in an .mp4 is unplayable on Apple devices, and every video
            // the museum shared was encoded that way.
            const isAvc = /avc1/.test(brand) || /avc1/.test(r.type);
            const isVp9 = /vp09/.test(brand);
            ok = ok && isAvc && !isVp9;
            detail += isVp9 ? " — VP9, unplayable on Apple" : isAvc ? " — H.264" : " — codec unknown";
          } else if (r.kind === "audio") {
            const isWav = brand.startsWith("RIFF");
            ok = ok && isWav;
            detail += isWav ? " — RIFF/WAVE" : " — not a WAV";
          } else {
            const isPng = r.head.startsWith("89504e47");
            ok = ok && isPng;
            detail += isPng ? " — PNG" : " — not a PNG";
          }
          note({ medium: id, check: "share", ok, detail });
        } catch (e) {
          note({ medium: id, check: "share", ok: false, detail: e instanceof Error ? e.message.slice(0, 90) : String(e) });
        }
      }
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n─── ${results.length - failed.length}/${results.length} passed ───`);
  if (failed.length) {
    for (const f of failed) console.log(`  ✗ ${f.medium} ${f.check}: ${f.detail}`);
  }

  const out = process.env.RENDER_MATRIX_OUTPUT;
  if (out) fs.writeFileSync(out, JSON.stringify({ ran_at: new Date().toISOString(), results }, null, 2));

  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : String(e));
  process.exit(1);
});
