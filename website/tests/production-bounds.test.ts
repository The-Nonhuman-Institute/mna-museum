import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  boundNotice,
  charBudgetFor,
  PROSE_FORMATS,
  tokensFor,
} from "../../system/src/production-bounds";
import { GROQ_TPM_BUDGET, estTokens } from "../../system/src/budget";
import { OUTPUT_TYPE_IDS } from "@/lib/output-types";

/**
 * THE ROOM AN ORIGINATOR IS TOLD IT HAS
 *
 * Production asks for 8,192 completion tokens and is granted whatever is left
 * of the per-request budget once the prompt is counted. Nothing told the
 * Originator, so a work simply stopped mid-element: MNA-OR-0001-W-0026 at 9,651
 * characters and W-0027 at 10,509, both on 2026-08-26, both safe-rendered by the
 * Conservator and evaluated by a Council that could not know they were cut.
 *
 * These tests hold the stated bound to the granted one. A number in prose that
 * drifts from the budget would be worse than no number at all — it would be the
 * institution telling an Originator something untrue about its own conditions.
 */

const ROOT = path.resolve(__dirname, "..", "..");

/** A prompt of roughly the size production really sends (measured: ~2,893 tokens). */
const SYSTEM = "s".repeat(1_450);
const USER = "u".repeat(9_000);

describe("the bound is derived from the grant, not written down", () => {
  it("states a number the provider can actually deliver", () => {
    for (const format of OUTPUT_TYPE_IDS) {
      const chars = charBudgetFor(format, SYSTEM, USER);
      const grant = GROQ_TPM_BUDGET - estTokens(SYSTEM) - estTokens(USER);
      // Even at the most generous plausible density, the promise must fit the
      // grant. 4 chars/token is prose at its loosest; markup never beats it.
      expect(chars, `${format} promises more than the grant can hold`).toBeLessThan(grant * 4);
      expect(chars, `${format} promises no room at all`).toBeGreaterThan(0);
    }
  });

  it("promises less than the lengths that actually truncated", () => {
    // W-0026 died at 9,651 chars of svg. A bound at or above that is not a
    // bound. This is the regression guard for the incident itself.
    expect(charBudgetFor("svg", SYSTEM, USER)).toBeLessThan(9_651);
  });

  it("shrinks as the prompt grows, since context and work share one budget", () => {
    const roomy = charBudgetFor("svg", SYSTEM, USER);
    const crowded = charBudgetFor("svg", SYSTEM, USER + "x".repeat(4_000));
    expect(crowded).toBeLessThan(roomy);
  });

  it("gives prose and markup different room, because they ask for different budgets", () => {
    expect(tokensFor("text")).toBeLessThan(tokensFor("svg"));
    PROSE_FORMATS.forEach((prose) => expect(tokensFor(prose)).toBe(tokensFor("text")));
  });

  it("tells the Originator the same number it computed", () => {
    const chars = charBudgetFor("svg", SYSTEM, USER);
    const notice = boundNotice("svg", chars);
    // The notice renders with a thousands separator; the digits must match.
    expect(notice).toContain(chars.toLocaleString("en-US"));
    expect(notice).toContain("svg");
  });

  it("states the bound as a condition, not as a preference about scale", () => {
    // The institution has no view on how large a work should be. If this notice
    // ever reads as direction, a human has become a party to the work.
    const notice = boundNotice("svg", charBudgetFor("svg", SYSTEM, USER)).toLowerCase();
    expect(notice).toContain("no preference");
    for (const directive of ["keep it short", "be concise", "brief", "simple", "small work is better"]) {
      expect(notice, `the notice directs the work: "${directive}"`).not.toContain(directive);
    }
  });
});

describe("production reads the bound rather than keeping its own", () => {
  const source = readFileSync(path.join(ROOT, "system/scripts/originate-turso.ts"), "utf8");

  it("asks production-bounds for the token budget", () => {
    expect(source).toMatch(/tokensFor\(chosenFormat\)/);
    // The inline ternary this replaced is the second copy that made the ask and
    // the bound capable of disagreeing.
    expect(source).not.toMatch(/isProse \? 2048 : 8192/);
  });

  it("sends the prompt that carries the notice, not the one without it", () => {
    // Computing a bound and then generating from the unbounded prompt would
    // leave every test here passing and every Originator still uninformed.
    expect(source).toMatch(/generate\(systemPrompt, boundedPrompt,/);
  });
});
