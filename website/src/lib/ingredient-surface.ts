"use client";

import { renderPartToCanvas, canBeIngredient } from "./render-part-to-canvas";

/**
 * The host side of an ingredient.
 *
 * `render-part-to-canvas` answers "what does this medium look like painted?".
 * This answers the other half: "how does a host medium make its marks OUT of
 * that?" Both halves are needed for a medium to be consumed rather than placed
 * beside — a composite arranges finished works and the seam stays visible; an
 * ingredient becomes the material.
 *
 * Every host does the same two things, so they are written once here: resolve
 * the declared surface to a painted canvas, and show that canvas only where the
 * host actually drew. A cell, a glyph, a node and a rectangle are all just
 * "somewhere the host put ink", and the ingredient shows through exactly there.
 */

export interface SurfaceSpec {
  type: string;
  payload: string;
}

/**
 * Read a `surface` declaration off any spec object, normalising the payload.
 *
 * JSON media may give their payload as a nested object rather than a string —
 * writing a shader as a string is natural, writing a scene as one is not — so
 * both are accepted and an object is re-serialised.
 */
export function readSurface(source: unknown): SurfaceSpec | null {
  if (!source || typeof source !== "object") return null;
  const raw = (source as { surface?: unknown }).surface;
  if (!raw || typeof raw !== "object") return null;
  const { type, payload } = raw as { type?: unknown; payload?: unknown };
  if (typeof type !== "string" || !canBeIngredient(type)) return null;
  if (payload === undefined || payload === null) return null;
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  if (!text.trim()) return null;
  return { type, payload: text };
}

/** Paint the declared surface, or null if it will not render. */
export function resolveSurface(
  surface: SurfaceSpec | null,
  size = 512,
): Promise<HTMLCanvasElement | null> {
  if (!surface) return Promise.resolve(null);
  return renderPartToCanvas(surface.type, surface.payload, size);
}

/**
 * Draw `ingredient` wherever `mask` has ink, and nowhere else.
 *
 * The host draws its marks onto a transparent canvas; that canvas is then used
 * purely as a stencil. This is what makes the ingredient the material rather
 * than a backdrop showing through gaps — the letters are made of the shader.
 */
export function paintThroughMask(
  ctx: CanvasRenderingContext2D,
  mask: HTMLCanvasElement,
  ingredient: HTMLCanvasElement,
): void {
  const w = mask.width;
  const h = mask.height;

  const stencil = document.createElement("canvas");
  stencil.width = w;
  stencil.height = h;
  const sctx = stencil.getContext("2d");
  if (!sctx) return;

  sctx.drawImage(mask, 0, 0);
  // Keep the ingredient only where the mask is opaque.
  sctx.globalCompositeOperation = "source-in";
  sctx.drawImage(ingredient, 0, 0, w, h);

  ctx.drawImage(stencil, 0, 0);
}

/** A transparent canvas the same size as the host's, to collect marks on. */
export function makeMask(width: number, height: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
} {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext("2d") };
}

/** An ingredient canvas as a data URL, for SVG hosts that fill with a pattern. */
export function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

/**
 * A vertically mirrored copy.
 *
 * Glyph outlines are authored with y running upward, as fonts are, and the
 * renderer flips them once on the way out. A fill pattern is flipped along with
 * the path, so the material would appear upside down inside the letters.
 * Pre-flipping the image cancels it, which is easier to reason about than
 * counter-transforming inside an objectBoundingBox pattern.
 */
export function flipVertically(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext("2d");
  if (!ctx) return canvas;
  ctx.translate(0, out.height);
  ctx.scale(1, -1);
  ctx.drawImage(canvas, 0, 0);
  return out;
}
