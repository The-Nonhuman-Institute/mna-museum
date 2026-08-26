import { describe, expect, it } from "vitest";
import {
  HOST_TYPE_IDS,
  INGREDIENT_TYPE_IDS,
  OUTPUT_TYPES,
  OUTPUT_TYPE_IDS,
  hostsIngredients,
  isAnimatedType,
  isJsonType,
  isOutputType,
  mediumMenu,
} from "@/lib/output-types";

/**
 * The registry is the single source for what media exist and what they can do.
 * Every one of these invariants stands in for a bug that shipped: a medium
 * offered on the menu that the validator rejected, an ingredient list typed by
 * hand that went stale, a host with no way to declare its surface.
 */
describe("the media registry", () => {
  it("has every entry keyed by its own id", () => {
    for (const id of OUTPUT_TYPE_IDS) expect(OUTPUT_TYPES[id].id).toBe(id);
  });

  it("gives every medium the descriptions both audiences need", () => {
    for (const id of OUTPUT_TYPE_IDS) {
      const spec = OUTPUT_TYPES[id];
      expect(spec.label.length, `${id} label`).toBeGreaterThan(0);
      expect(spec.agentDescription.length, `${id} agentDescription`).toBeGreaterThan(10);
      expect(spec.humanDescription.length, `${id} humanDescription`).toBeGreaterThan(20);
    }
  });

  it("offers exactly the media it recognises — the menu cannot drift", () => {
    const menu = mediumMenu();
    for (const id of OUTPUT_TYPE_IDS) expect(menu, `menu missing ${id}`).toContain(id);
    const listed = menu.split("\n").filter(Boolean).length;
    expect(listed).toBe(OUTPUT_TYPE_IDS.length);
  });

  it("only lets a medium host ingredients if it has JSON to declare them in", () => {
    for (const id of HOST_TYPE_IDS) {
      expect(OUTPUT_TYPES[id].json, `${id} hosts ingredients but is not JSON`).toBe(true);
    }
  });

  it("never marks the arranger as a host — composite is the other half", () => {
    expect(hostsIngredients("composite-json")).toBe(false);
    expect(OUTPUT_TYPES["composite-json"].composite).toBe(true);
  });

  it("excludes media with no surface to consume from the ingredient list", () => {
    // audio has no image; html-css renders in a sandboxed iframe that cannot
    // be drawn to a canvas. Both were deliberate and are easy to undo by
    // accident.
    expect(INGREDIENT_TYPE_IDS).not.toContain("audio-json");
    expect(INGREDIENT_TYPE_IDS).not.toContain("html-css");
    expect(INGREDIENT_TYPE_IDS.length).toBeGreaterThan(0);
  });

  it("agrees with its own predicates", () => {
    for (const id of OUTPUT_TYPE_IDS) {
      expect(isOutputType(id)).toBe(true);
      expect(isJsonType(id)).toBe(!!OUTPUT_TYPES[id].json);
      expect(isAnimatedType(id)).toBe(!!OUTPUT_TYPES[id].animated);
      expect(hostsIngredients(id)).toBe(!!OUTPUT_TYPES[id].hostsIngredients);
    }
    expect(isOutputType("not-a-medium")).toBe(false);
    expect(hostsIngredients("not-a-medium")).toBe(false);
  });
});
