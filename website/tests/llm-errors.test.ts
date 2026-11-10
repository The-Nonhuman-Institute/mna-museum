import { describe, expect, it } from "vitest";
import { isQuotaError, OUT_OF_FUNDS } from "../../system/src/llm-errors";

describe("reading a provider's failure", () => {
  it("passes an out-of-credit Ollama to the next provider instead of ending the turn", () => {
    // The message every Ollama-minded tick died on, 2026-11-10.
    const ollama = '[llm] ollama 402: {"error":"Add usage credits or subscribe and save up to 66%: https://ollama.com/plans"}';
    expect(OUT_OF_FUNDS.test(ollama)).toBe(true);
    expect(isQuotaError(ollama)).toBe(true);
  });

  it("still lets real failures surface", () => {
    expect(isQuotaError("TypeError: cannot read properties of undefined")).toBe(false);
    expect(isQuotaError("[llm] groq 400: invalid JSON in response_format")).toBe(false);
  });
});
