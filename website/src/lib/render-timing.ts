/**
 * render-timing.ts — how long a work needs before it looks like itself.
 *
 * Some media draw themselves once and stop. MNA-OR-0008-W-0013 is a plotter
 * path whose header declares "the pen is down for 0.5208% of this path" — it
 * spends nine seconds laying down a boustrophedon raster, and a screenshot
 * taken at 1.5s catches sixty percent of its ink. The work was not
 * misrendered; it was photographed mid-sentence.
 *
 * The durations lived inside the renderers, where the capture scripts could
 * not see them, so the scripts guessed. This module is the one place that
 * knows, and the renderers now read it too — a duration changed in a renderer
 * used to silently invalidate every preview of that medium.
 */

/**
 * Media that draw progressively and then hold still, with the wall-clock
 * length of the draw. A capture is only representative once this has elapsed;
 * an animation of one of these should span it rather than sample its middle.
 */
export const FINITE_DRAW_MS: Record<string, number> = {
  "instruction-set": 9000,
  "rule-json": 8000,
};

/**
 * Media that never finish — they loop or drift indefinitely. The value is how
 * long to wait for the work to reach its steady state, not its length.
 */
const LOOPING_SETTLE_MS: Record<string, number> = {
  "scene-json": 3500,
  "html-css": 4000,
  "canvas-json": 3000,
};

const DEFAULT_SETTLE_MS = 1500;

/** Grace past the final frame, so a capture never races the last paint. */
const FINISHED_GRACE_MS = 700;

/**
 * Extra time for a work that consumes another medium as material.
 *
 * An ingredient is rendered by mounting its own renderer offscreen and reading
 * what it paints, which the host then shows through its marks. That round trip
 * costs seconds, and it starts only after the host has mounted — so a capture
 * timed for the host alone photographs the work before its material arrives,
 * and the shared image is the untextured version.
 */
const INGREDIENT_SETTLE_MS = 3500;

/** Cheap structural test — the payload declares a surface somewhere. */
export function declaresIngredient(payload: string | null | undefined): boolean {
  return !!payload && /"surface"\s*:\s*\{/.test(payload);
}

/**
 * Settle time for a specific work, accounting for any ingredient it declares.
 * Prefer this over `settleMs` wherever the payload is at hand.
 */
export function settleMsForWork(outputType: string, payload?: string | null): number {
  return settleMs(outputType) + (declaresIngredient(payload) ? INGREDIENT_SETTLE_MS : 0);
}

/**
 * How long to wait before a still capture represents the work. For a finite
 * draw this is the whole draw; for anything else it is time to settle.
 */
export function settleMs(outputType: string): number {
  const draw = FINITE_DRAW_MS[outputType];
  if (draw) return draw + FINISHED_GRACE_MS;
  return LOOPING_SETTLE_MS[outputType] ?? DEFAULT_SETTLE_MS;
}

/**
 * Frame timing for an animated thumbnail.
 *
 * A finite draw is sampled from its first moment across its full length — the
 * point of animating it at all is to show the drawing happen. A looping work
 * is left to settle first, then sampled over a few seconds of its loop.
 */
export function animationPlan(
  outputType: string,
  frames: number,
): { startDelayMs: number; frameGapMs: number } {
  const draw = FINITE_DRAW_MS[outputType];
  if (draw) {
    return {
      // Begin at once: the empty sheet is the first frame of a drawing.
      startDelayMs: 0,
      frameGapMs: Math.round((draw + FINISHED_GRACE_MS) / frames),
    };
  }
  return { startDelayMs: 2500, frameGapMs: 250 };
}
