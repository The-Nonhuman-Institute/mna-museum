"use client";

/**
 * Render one medium to a canvas so another medium can consume it.
 *
 * This is the whole of what makes a medium an INGREDIENT rather than a
 * neighbour. composite-json arranges finished works side by side and you can
 * always see the seam; a surface texture is consumed — the shader stops being a
 * thing beside the cube and becomes what the cube is made of.
 *
 * It works by mounting the REAL renderer offscreen and reading its canvas, the
 * same technique the share engine uses to record a work. No renderer logic is
 * duplicated, so an ingredient looks exactly like the medium does on its own
 * page, and a fix to a renderer fixes it everywhere at once.
 *
 * ONLY THE SUBMITTING ORIGINATOR'S OWN PAYLOAD. Every ingredient is inline
 * text or data inside the work being submitted. Nothing here takes a work id,
 * a URL, or any other reference, so one Originator cannot use another's work as
 * material — not by design choice at the call site, but because there is no
 * argument that would express it. Collaboration between Originators is a
 * different thing with its own consent, and it happens in the Commons.
 */

const SUPPORTED = new Set([
  "svg", "canvas-json", "shader-glsl", "rule-json", "graph-json", "typeface-json", "ascii", "text",
]);

export function canBeIngredient(type: string): boolean {
  return SUPPORTED.has(type);
}

/**
 * Mount `type`/`payload` offscreen and return a canvas holding what it painted.
 *
 * Returns null rather than throwing: an ingredient that will not render should
 * cost the host work its texture, not its existence.
 */
export async function renderPartToCanvas(
  type: string,
  payload: string,
  size = 512,
): Promise<HTMLCanvasElement | null> {
  if (!canBeIngredient(type) || !payload.trim()) return null;

  const { createRoot } = await import("react-dom/client");
  const React = await import("react");
  const { default: CompositeRenderer } = await import(
    "@/components/renderers/CompositeRenderer"
  );

  // Offscreen but laid out and painting. display:none stops requestAnimationFrame,
  // which would leave every animated ingredient frozen on frame zero.
  const host = document.createElement("div");
  host.style.cssText =
    `position:fixed;left:-99999px;top:0;width:${size}px;height:${size}px;overflow:hidden;pointer-events:none;`;
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    // Expressed as a one-part composite so the part dispatch lives in exactly
    // one place and every medium reaches its real renderer.
    root.render(
      React.createElement(CompositeRenderer, {
        json: JSON.stringify({ layout: "stack", parts: [{ type, payload }] }),
      }),
    );

    // Renderers mount asynchronously — dynamic imports, WebGL context creation,
    // rule systems that unfold over seconds. Poll for paint rather than guess.
    const deadline = performance.now() + 6000;
    let source: HTMLCanvasElement | null = null;
    let svg: SVGElement | null = null;

    while (performance.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
      const c = host.querySelector("canvas") as HTMLCanvasElement | null;
      if (c && c.width > 1 && c.height > 1) { source = c; break; }
      const s = host.querySelector("svg") as unknown as SVGElement | null;
      if (s) { svg = s; break; }
    }

    // Give an unfolding ingredient a moment past first paint so it is not
    // captured as a single seed cell.
    if (source) await new Promise((r) => setTimeout(r, 900));

    const out = document.createElement("canvas");
    out.width = size;
    out.height = size;
    const ctx = out.getContext("2d");
    if (!ctx) return null;

    if (source) {
      ctx.drawImage(source, 0, 0, size, size);
      return out;
    }

    if (svg) {
      const clone = svg.cloneNode(true) as SVGElement;
      clone.setAttribute("width", String(size));
      clone.setAttribute("height", String(size));
      const src = new XMLSerializer().serializeToString(clone);
      const img = new Image();
      const ok = await new Promise<boolean>((resolve) => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src);
      });
      if (!ok) return null;
      ctx.drawImage(img, 0, 0, size, size);
      return out;
    }

    return null;
  } catch {
    return null;
  } finally {
    try { root.unmount(); } catch { /* already gone */ }
    if (host.parentNode) document.body.removeChild(host);
  }
}
