import { readdirSync, readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  CANVAS_SIZE,
  MAX_PIXEL_RATIO,
  SURFACE_SIZE,
  cssSizeForPixels,
  renderPixelRatio,
} from "@/lib/surface-size";
import { getFormatPrompt, type OutputFormat } from "../../system/src/formats";

/**
 * A SURFACE'S COORDINATES ARE THE ONES THE ORIGINATOR WAS GIVEN
 *
 * MNA-OR-0002-W-0035 is five circles centred on (400, 400) of the 800×800
 * canvas, each made of a shader centred on (400, 400) with that circle's
 * radius — concentric, as the title says. Surfaces were drawn on a 512 square at
 * the screen's pixel density and stretched to fit, so the bands' centre landed
 * at 78% across on one screen and 39% on another, and never at the circles'.
 * Nothing told the Originator any of this.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const RENDERERS = path.join(ROOT, "website/src/components/renderers");
const read = (p: string) => readFileSync(p, "utf8");
const renderers = readdirSync(RENDERERS)
  .filter((f) => f.endsWith(".tsx"))
  .map((f) => ({ f, src: read(path.join(RENDERERS, f)) }));

describe("a surface is the same size on every screen", () => {
  it.each([1, 1.5, 2, 3])("paints exactly its stated pixels at pixel ratio %s", (ratio) => {
    for (const pixels of [CANVAS_SIZE, SURFACE_SIZE]) {
      expect(cssSizeForPixels(pixels, ratio) * renderPixelRatio(ratio)).toBe(pixels);
    }
  });

  it("caps the pixel ratio at 2 and treats a missing one as 1", () => {
    expect(renderPixelRatio(3)).toBe(MAX_PIXEL_RATIO);
    expect(renderPixelRatio(1.5)).toBe(1.5);
    expect(renderPixelRatio(undefined)).toBe(1);
    expect(renderPixelRatio(0)).toBe(1);
  });

  it("is laid out that way by the code that renders surfaces", () => {
    const part = read(path.join(ROOT, "website/src/lib/render-part-to-canvas.ts"));
    expect(part).toMatch(/const css = cssSizeForPixels\(size, window\.devicePixelRatio\);/);
    expect(part).toMatch(/width:\$\{css\}px;height:\$\{css\}px/);
  });
});

describe("one rule for pixel density, and one for surface sizes", () => {
  it("no renderer restates the pixel-ratio cap", () => {
    // The cap is what lets a surface be laid out at an exact size; a renderer
    // with its own copy would paint a different number of pixels.
    const restated = renderers.filter(({ src }) => /Math\.min\(\s*window\.devicePixelRatio/.test(src)).map((r) => r.f);
    expect(restated).toEqual([]);
  });

  it("no renderer resolves a surface at a number of its own", () => {
    const literal = renderers
      .filter(({ src }) => /(resolveSurface|renderPartToCanvas)\([^)]*,\s*\d+\s*\)/.test(src))
      .map((r) => r.f);
    expect(literal).toEqual([]);
  });

  it("a canvas draws its surfaces on its own grid", () => {
    const canvas = read(path.join(RENDERERS, "CanvasRenderer.tsx"));
    expect(canvas).toMatch(/resolveSurface\(surface, CANVAS_SIZE\)/);
    expect(canvas).toMatch(/canvas\.width = CANVAS_SIZE;/);
  });
});

describe("the Originators are told the same numbers", () => {
  const canvas = getFormatPrompt("canvas-json" as OutputFormat);

  it("gives the canvas size from the renderer's constant", () => {
    expect(canvas).toContain(`Canvas size is ${CANVAS_SIZE}x${CANVAS_SIZE}.`);
    // A literal that happens to equal the constant reads identically in the
    // prompt, so only the source can show the number is not restated.
    const formats = read(path.join(ROOT, "system/src/formats.ts"));
    expect(formats).not.toMatch(/\b(800x800|512x512)\b/);
  });

  it("says a canvas surface is on the canvas's own grid, with y running upward", () => {
    expect(canvas).toContain(`drawn on the canvas's own ${CANVAS_SIZE}x${CANVAS_SIZE} grid`);
    expect(canvas).toMatch(/fragCoord's y runs upward/);
  });

  it("says what size any other surface is drawn at, and where a shader reads it", () => {
    expect(canvas).toContain(`a surface is drawn on a ${SURFACE_SIZE}x${SURFACE_SIZE}`);
    expect(canvas).toMatch(/iResolution/);
  });
});
