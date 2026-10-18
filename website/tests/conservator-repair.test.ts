import { describe, expect, it } from "vitest";
import { repairPayload } from "../../system/src/conservator-repair";

/**
 * A recovered SVG must be well-formed XML: works are shown as images
 * (lib/svg-image.ts), and an image refuses what inline markup forgave.
 * MNA-OR-0001-W-0034 was recovered with <defs> and a <linearGradient> left
 * open, and showed as a broken image until 2026-10-18.
 */
describe("the Conservator's SVG recovery", () => {
  const cut = '<svg viewBox="0 0 8 8" xmlns="http://www.w3.org/2000/svg">\n<rect width="8" height="8"/>\n<defs>\n<linearGradient id="a"><stop offset="0"/></linearGradient>\n<linearGradient id="b"><stop offset="0%" stop-color="hsl(0,1%,1%)"/';

  it("closes every element left open, innermost first, and adds nothing else", () => {
    const r = repairPayload(cut, "svg");
    expect(r.ok).toBe(true);
    expect(r.repaired.endsWith('<linearGradient id="b">\n</linearGradient>\n</defs>\n</svg>')).toBe(true);
    expect(r.repaired).not.toMatch(/<stop offset="0%" stop-color/);
  });

  it("still closes groups, and leaves self-closing tags and comments alone", () => {
    const r = repairPayload('<svg xmlns="http://www.w3.org/2000/svg"><!-- <g> --><g><g><circle r="1"/></g><rect x="1"', "svg");
    expect(r.repaired).toBe('<svg xmlns="http://www.w3.org/2000/svg"><!-- <g> --><g><g><circle r="1"/></g>\n</g>\n</svg>');
  });
});
