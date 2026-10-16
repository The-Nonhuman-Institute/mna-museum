/**
 * Putting a work in front of the site's real renderers and photographing it.
 *
 * Shared by the render matrix (MNA-OPS-001 §V E2), which proves each medium
 * renders, and by the Council, which must see a work before judging it. The
 * harness page renders any payload it is handed with no database, so a work
 * can be photographed before the public snapshot holds it.
 */

import fs from "fs";
import os from "os";
import path from "path";
import type { Browser, Page } from "puppeteer";

/**
 * A page carrying the site's own bundle, so renderers are the real ones.
 *
 * The harness route renders whatever payload it is handed. It exists only in
 * development and in this check; it never appears in navigation and records
 * nothing.
 */
export async function openHarness(browser: Browser, site: string): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 900, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log(`     [pageerror] ${String(e).slice(0, 120)}`));
  await page.goto(`${site}/harness`, { waitUntil: "networkidle2", timeout: 90000 });
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
export async function capture(
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

/**
 * Draw a work once and photograph it at each of `seconds` after it began, as
 * base64 PNGs. A renderer error at any moment fails the whole capture: a work
 * that cannot be shown is not judged from part of itself.
 */
export async function captureFrames(
  page: Page,
  type: string,
  payload: string,
  seconds: number[],
): Promise<{ frames: { seconds: number; png: string }[] } | { error: string }> {
  await page.evaluate(
    (t, p) => (window as unknown as { __mnaRender: (t: string, p: string) => void }).__mnaRender(t, p),
    type,
    payload,
  );
  const start = Date.now();
  const frames: { seconds: number; png: string }[] = [];
  for (const at of [...seconds].sort((x, y) => x - y)) {
    await new Promise((r) => setTimeout(r, Math.max(0, start + at * 1000 - Date.now())));
    const target = await page.$("#harness-target");
    if (!target) return { error: "no harness target" };
    const rendererError = await page.$eval("#harness-target", (el) =>
      el.querySelector("[data-render-error]")?.getAttribute("data-render-error") ?? null,
    );
    if (rendererError) return { error: `renderer error at ${at}s: ${rendererError.slice(0, 120)}` };
    const png = (await target.screenshot({ encoding: "base64" })) as string;
    frames.push({ seconds: at, png });
  }
  return { frames };
}

/** A capture as a base64 PNG, the form a vision model takes. The file is removed. */
export async function captureBase64(
  page: Page,
  type: string,
  payload: string,
  waitMs: number,
): Promise<{ png: string } | { error: string }> {
  const c = await capture(page, type, payload, waitMs);
  if ("error" in c) return c;
  try {
    return { png: fs.readFileSync(c.shot).toString("base64") };
  } finally {
    try { fs.unlinkSync(c.shot); } catch { /* already gone */ }
  }
}
