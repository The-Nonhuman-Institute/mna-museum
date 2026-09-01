import { describe, expect, it } from "vitest";
import { boundedWorkView } from "../../system/src/registrar-view";
import { estTokens, GROQ_TPM_BUDGET } from "../../system/src/budget";

/**
 * THE REGISTRAR'S REQUEST HAS TO FIT
 *
 * The deadlock prompt embedded the work whole. MNA-OR-0008-W-0022 is 29,121
 * characters of html-css — about 8,090 tokens, more than the entire 7,500-token
 * per-request budget on its own — so Groq refused the request outright and only
 * Gemini could serve it.
 *
 * A deadlock resolvable by exactly one provider waits when that provider is
 * down, and on 2026-08-31 one did: a 503 mid-call left W-0022 IN_REVIEW with all
 * four votes cast and no tally, until someone re-ran it by hand.
 */

const RATIONALES_AND_BOILERPLATE = 2_200; // chars, measured
const SYSTEM_PROMPT = 900;
const COMPLETION = 1024;

function roomForWork(): number {
  return (
    GROQ_TPM_BUDGET -
    estTokens("x".repeat(SYSTEM_PROMPT)) -
    estTokens("x".repeat(RATIONALES_AND_BOILERPLATE)) -
    COMPLETION
  );
}

describe("the work the Registrar is shown", () => {
  it("passes a work through whole when it fits", () => {
    const small = "<html>a work that fits</html>";
    const v = boundedWorkView(small, roomForWork());
    expect(v.excerpted).toBe(false);
    expect(v.text).toBe(small);
  });

  it("brings the largest work in the collection inside the budget", () => {
    // W-0022's size. The whole point is that this request stops being refused.
    const huge = "x".repeat(29_121);
    const v = boundedWorkView(huge, roomForWork());
    expect(v.excerpted).toBe(true);

    const promptTokens =
      estTokens("x".repeat(SYSTEM_PROMPT)) +
      estTokens("x".repeat(RATIONALES_AND_BOILERPLATE) + v.text);
    expect(promptTokens + COMPLETION).toBeLessThanOrEqual(GROQ_TPM_BUDGET);
  });

  it("shows the close of the work, not only its opening", () => {
    // Markup opens with setup and closes with what it built. Head-only would
    // hand the Registrar a stylesheet and call it the work.
    const payload = "OPENING" + "x".repeat(40_000) + "CLOSING";
    const v = boundedWorkView(payload, roomForWork());
    expect(v.text.startsWith("OPENING")).toBe(true);
    expect(v.text.endsWith("CLOSING")).toBe(true);
  });

  it("marks the elision in the text and counts it honestly", () => {
    const payload = "y".repeat(50_000);
    const v = boundedWorkView(payload, roomForWork());
    expect(v.text).toMatch(/characters elided from the middle of the work/);
    expect(v.totalChars).toBe(50_000);
    expect(v.shownChars).toBeLessThan(v.totalChars);
  });

  it("never returns nothing, however little room is left", () => {
    const v = boundedWorkView("z".repeat(10_000), -500);
    expect(v.shownChars).toBeGreaterThan(0);
  });
});
