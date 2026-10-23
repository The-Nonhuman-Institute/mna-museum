import { readFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readPosture } from "../src/lib/posture";

/**
 * Every posture the site answers to (lib/posture.ts): closed, open, folded like
 * a book, stood up — from what the browser reports, else what the visitor
 * chose, else flat. Never guessed from the device.
 */

const ROOT = path.resolve(__dirname, "..", "..");
function screen(width: number, height: number, opts: { segments?: unknown[]; media?: string[]; posture?: string } = {}) {
  vi.stubGlobal("window", {
    innerWidth: width,
    innerHeight: height,
    viewport: opts.segments ? { segments: opts.segments } : undefined,
    matchMedia: (q: string) => ({ matches: (opts.media ?? []).includes(q) }),
  });
  vi.stubGlobal("navigator", opts.posture ? { devicePosture: { type: opts.posture } } : {});
}
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("posture", () => {
  it("is compact closed and spread open", () => {
    screen(390, 844);
    expect(readPosture()).toMatchObject({ screen: "compact", fold: "flat", source: "none" });
    screen(820, 760);
    expect(readPosture()).toMatchObject({ screen: "spread", fold: "flat", source: "none" });
  });

  it("reads a book and its hinge from side-by-side segments", () => {
    screen(820, 760, { segments: [{ x: 0, y: 0, width: 400, height: 760 }, { x: 420, y: 0, width: 400, height: 760 }] });
    expect(readPosture()).toMatchObject({ fold: "book", source: "browser", hinge: 410 });
  });

  it("reads a stand and its hinge from stacked segments", () => {
    screen(820, 760, { segments: [{ x: 0, y: 0, width: 820, height: 370 }, { x: 0, y: 390, width: 820, height: 370 }] });
    expect(readPosture()).toMatchObject({ fold: "stand", source: "browser", hinge: 380 });
  });

  it("reads the media queries and Device Posture where there are no segment rectangles", () => {
    screen(820, 760, { media: ["(vertical-viewport-segments: 2)"] });
    expect(readPosture().fold).toBe("stand");
    screen(900, 700, { posture: "folded" });
    expect(readPosture()).toMatchObject({ fold: "stand", source: "browser" });
  });

  it("takes the visitor's choice only where the browser says nothing, and never overrides it", () => {
    screen(820, 760);
    expect(readPosture("stand")).toMatchObject({ fold: "stand", source: "visitor" });
    screen(820, 760, { media: ["(horizontal-viewport-segments: 2)"] });
    expect(readPosture("stand")).toMatchObject({ fold: "book", source: "browser" });
  });

  it("is one file on both sites", () => {
    const a = readFileSync(path.join(ROOT, "website/src/lib/posture.ts"), "utf8");
    expect(readFileSync(path.join(ROOT, "commons/lib/posture.ts"), "utf8")).toBe(a);
    const b = readFileSync(path.join(ROOT, "website/src/components/PostureProvider.tsx"), "utf8");
    expect(readFileSync(path.join(ROOT, "commons/components/PostureProvider.tsx"), "utf8")).toBe(b);
  });
});
