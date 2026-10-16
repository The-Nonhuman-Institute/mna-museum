/**
 * The pixel grids works are drawn on, held once.
 *
 * No React and no browser API, so the Originators' format prompts in
 * system/src/formats.ts can import the same numbers the renderers use. When the
 * prompt said "Canvas size is 800x800" and the renderer hardcoded 800 beside
 * it, the two agreed by coincidence; when a surface was drawn at 512 and the
 * prompt said nothing, an Originator had no way to know.
 */

/** A canvas-json work's coordinate space: what every op's x and y are measured in. */
export const CANVAS_SIZE = 800;

/**
 * The square a surface is drawn on when its host has no pixel grid of its own
 * to lend it — a glyph, a graph node, a cell of a rule system, a 3D object.
 */
export const SURFACE_SIZE = 512;

/** The pixel density renderers draw at: the device's, capped at 2. */
export const MAX_PIXEL_RATIO = 2;

export function renderPixelRatio(devicePixelRatio: number | undefined): number {
  return Math.min(devicePixelRatio || 1, MAX_PIXEL_RATIO);
}

/**
 * The CSS size at which a renderer will paint exactly `pixels` device pixels.
 *
 * A surface is material, so its coordinates must not depend on the screen
 * looking at it. Renderers size their backing store as CSS size × pixel ratio;
 * laid out at `pixels / ratio`, a surface is `pixels` across on every device,
 * and a shader's fragCoord runs 0 to `pixels` on a phone as on a desktop.
 * MNA-OR-0002-W-0035 centred its rings on (400, 400) of an 800 canvas; drawn at
 * CSS 512 × ratio 2 they landed at 39% across, at ratio 1 at 78%.
 */
export function cssSizeForPixels(pixels: number, devicePixelRatio: number | undefined): number {
  return pixels / renderPixelRatio(devicePixelRatio);
}
