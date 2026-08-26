import { describe, expect, it, vi } from "vitest";
import { dimension, firstColorOf, isGradient, resolveFill } from "@/lib/canvas-fill";

/** A canvas context stub that records what a gradient was built from. */
function fakeCtx() {
  const stops: { offset: number; color: string }[] = [];
  const made: Record<string, unknown> = {};
  const gradient = {
    addColorStop: (offset: number, color: string) => {
      if (!/^(#|rgb|hsl|[a-z])/i.test(color)) throw new Error("bad colour");
      stops.push({ offset, color });
    },
  };
  return {
    ctx: {
      createLinearGradient: (x0: number, y0: number, x1: number, y1: number) => {
        Object.assign(made, { kind: "linear", x0, y0, x1, y1 });
        return gradient;
      },
      createRadialGradient: (cx: number, cy: number, r0: number, _cx: number, _cy: number, r1: number) => {
        Object.assign(made, { kind: "radial", cx, cy, r0, r1 });
        return gradient;
      },
    } as unknown as CanvasRenderingContext2D,
    stops,
    made,
  };
}

const BOUNDS = { x: 0, y: 0, w: 800, h: 800 };

describe("dimension", () => {
  it("accepts either spelling an Originator might use", () => {
    // Five of eighteen canvas works wrote width/height. They were drawn at the
    // fallback size, which for most of them meant invisible.
    expect(dimension({ w: 120 }, "w", "width", 100)).toBe(120);
    expect(dimension({ width: 120 }, "w", "width", 100)).toBe(120);
    expect(dimension({}, "w", "width", 100)).toBe(100);
  });

  it("prefers the short form when both are present", () => {
    expect(dimension({ w: 10, width: 999 }, "w", "width", 0)).toBe(10);
  });

  it("ignores a non-numeric value rather than drawing NaN", () => {
    expect(dimension({ w: "120" }, "w", "width", 55)).toBe(55);
  });
});

describe("isGradient", () => {
  it("recognises the CSS gradients Originators actually write", () => {
    expect(isGradient("radial-gradient(circle at 120px 180px, #ff0066 0%, transparent 60%)")).toBe(true);
    expect(isGradient("linear-gradient(45deg, #000, #fff)")).toBe(true);
    expect(isGradient("#ff0066")).toBe(false);
    expect(isGradient(null)).toBe(false);
    expect(isGradient("")).toBe(false);
  });
});

describe("resolveFill", () => {
  it("passes a plain colour through untouched", () => {
    const { ctx } = fakeCtx();
    expect(resolveFill(ctx, "#ff0066", BOUNDS)).toBe("#ff0066");
    expect(resolveFill(ctx, "rgba(0,0,0,0.5)", BOUNDS)).toBe("rgba(0,0,0,0.5)");
  });

  it("returns null for nothing usable, so the brush is left alone", () => {
    const { ctx } = fakeCtx();
    expect(resolveFill(ctx, undefined, BOUNDS)).toBeNull();
    expect(resolveFill(ctx, "", BOUNDS)).toBeNull();
    expect(resolveFill(ctx, 42, BOUNDS)).toBeNull();
  });

  it("builds a radial gradient centred where the author put it", () => {
    const { ctx, made, stops } = fakeCtx();
    const out = resolveFill(
      ctx,
      "radial-gradient(circle at 120px 180px, #ff0066 0%, #ff3399 30%, transparent 60%)",
      BOUNDS,
    );
    expect(out).not.toBeNull();
    expect(made.kind).toBe("radial");
    expect(made.cx).toBe(120);
    expect(made.cy).toBe(180);
    expect(stops.map((s) => s.offset)).toEqual([0, 0.3, 0.6]);
    expect(stops[2].color).toBe("transparent");
  });

  it("centres a radial gradient in the shape when no position is given", () => {
    const { ctx, made } = fakeCtx();
    resolveFill(ctx, "radial-gradient(#fff, #000)", { x: 100, y: 200, w: 400, h: 400 });
    expect(made.cx).toBe(300);
    expect(made.cy).toBe(400);
  });

  it("reads percentage and keyword positions", () => {
    const { ctx, made } = fakeCtx();
    resolveFill(ctx, "radial-gradient(circle at 50% 100%, #fff, #000)", { x: 0, y: 0, w: 200, h: 400 });
    expect(made.cx).toBe(100);
    expect(made.cy).toBe(400);
  });

  it("spaces unpositioned stops evenly, as CSS does", () => {
    const { ctx, stops } = fakeCtx();
    resolveFill(ctx, "linear-gradient(#000, #888, #fff)", BOUNDS);
    expect(stops.map((s) => s.offset)).toEqual([0, 0.5, 1]);
  });

  it("orders stops, because a canvas gradient rejects what CSS tolerates", () => {
    const { ctx, stops } = fakeCtx();
    resolveFill(ctx, "linear-gradient(#fff 80%, #000 20%)", BOUNDS);
    expect(stops.map((s) => s.offset)).toEqual([0.2, 0.8]);
  });

  it("does not mistake a comma inside rgb() for a stop separator", () => {
    const { ctx, stops } = fakeCtx();
    resolveFill(ctx, "linear-gradient(rgb(255, 0, 102) 0%, rgb(0, 0, 0) 100%)", BOUNDS);
    expect(stops).toHaveLength(2);
    expect(stops[0].color).toBe("rgb(255, 0, 102)");
  });

  it("honours a direction", () => {
    const { ctx, made } = fakeCtx();
    resolveFill(ctx, "linear-gradient(to right, #000, #fff)", BOUNDS);
    expect(Math.round(made.x0 as number)).toBe(0);
    expect(Math.round(made.x1 as number)).toBe(800);
    expect(Math.round(made.y0 as number)).toBe(400);
  });

  it("falls back to the first colour when a stop cannot be built", () => {
    const { ctx } = fakeCtx();
    // Every stop is rejected by the stub, so no colour stop survives — but the
    // gradient object is still returned; the work is not lost.
    const out = resolveFill(ctx, "linear-gradient(0deg, #123456, #654321)", BOUNDS);
    expect(out).not.toBeNull();
  });

  it("never throws on malformed input", () => {
    const { ctx } = fakeCtx();
    for (const bad of ["linear-gradient(", "radial-gradient()", "linear-gradient(,,)", "gradient(#fff)"]) {
      expect(() => resolveFill(ctx, bad, BOUNDS)).not.toThrow();
    }
  });
});

describe("firstColorOf", () => {
  it("names the first colour a gradient mentions", () => {
    expect(firstColorOf("radial-gradient(circle at 0 0, #ff0066 0%, transparent 60%)")).toBe("#ff0066");
    expect(firstColorOf("linear-gradient(#abc, #def)")).toBe("#abc");
  });
});
