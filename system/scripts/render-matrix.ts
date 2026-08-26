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

/** Draw a payload and report how much of the frame is not the background. */
async function renderAndMeasure(page: Page, type: string, payload: string, waitMs: number) {
  await page.evaluate(
    (t, p) => (window as unknown as { __mnaRender: (t: string, p: string) => void }).__mnaRender(t, p),
    type,
    payload,
  );
  await new Promise((r) => setTimeout(r, waitMs));
  return page.evaluate(async () => {
    const host = document.getElementById("harness-target");
    if (!host) return { ok: false, colours: 0, reason: "no harness target" };
    const canvases = Array.from(host.querySelectorAll("canvas")) as HTMLCanvasElement[];
    const svgs = host.querySelectorAll("svg");
    const iframes = host.querySelectorAll("iframe");
    // An audio work paints a control, not an image; presence of the control is
    // the render. Everything else must put marks on a surface.
    const buttons = host.querySelectorAll("button");

    const out = document.createElement("canvas");
    out.width = 400;
    out.height = 400;
    const ctx = out.getContext("2d");
    if (!ctx) return { ok: false, colours: 0, reason: "no 2d context" };

    let drew = false;
    for (const c of canvases) {
      if (c.width > 1 && c.height > 1) {
        try { ctx.drawImage(c, 0, 0, 400, 400); drew = true; } catch { /* tainted */ }
      }
    }
    if (!drew && svgs.length > 0) {
      const svg = svgs[0] as SVGElement;
      const clone = svg.cloneNode(true) as SVGElement;
      clone.setAttribute("width", "400");
      clone.setAttribute("height", "400");
      const src = new XMLSerializer().serializeToString(clone);
      const img = new Image();
      const ok = await new Promise<boolean>((res) => {
        img.onload = () => res(true);
        img.onerror = () => res(false);
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src);
      });
      if (ok) { ctx.drawImage(img, 0, 0, 400, 400); drew = true; }
    }

    if (!drew) {
      // html-css renders in a sandboxed iframe that cannot be drawn to a
      // canvas. Its presence and size is the strongest available evidence.
      if (iframes.length > 0) {
        const r = (iframes[0] as HTMLIFrameElement).getBoundingClientRect();
        return { ok: r.width > 50 && r.height > 50, colours: -1, reason: `iframe ${Math.round(r.width)}x${Math.round(r.height)}` };
      }
      if (buttons.length > 0) return { ok: true, colours: -1, reason: "control rendered" };
      const text = (host.textContent || "").trim();
      if (text.length > 10) return { ok: true, colours: -1, reason: `text ${text.length} chars` };
      return { ok: false, colours: 0, reason: "nothing painted" };
    }

    const data = ctx.getImageData(0, 0, 400, 400).data;
    const seen = new Set<number>();
    for (let i = 0; i < data.length; i += 4) {
      seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
      if (seen.size > 8) break;
    }
    return { ok: seen.size >= 2, colours: seen.size, reason: `${seen.size >= 8 ? "8+" : seen.size} colours` };
  });
}

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
        const r = await renderAndMeasure(page, id, INGREDIENT_FIXTURES[id], 12000);
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
