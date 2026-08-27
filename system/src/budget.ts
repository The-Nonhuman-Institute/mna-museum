/**
 * budget.ts — the arithmetic of how much room a request has.
 *
 * Split out of llm.ts so it can be reasoned about, and tested, without pulling
 * in a provider SDK. llm.ts enforces these numbers; production-bounds.ts
 * derives what an Originator is told from them. Both read this file, so the
 * room granted and the room promised cannot drift apart.
 *
 * No imports on purpose. Anything added here that needs a dependency belongs
 * in llm.ts instead.
 */

/**
 * The per-request ceiling, prompt + completion together.
 *
 * Groq's free tier is 8000 TPM and it applies to a SINGLE request, not just to
 * throughput. Exceeding it returns a 413 that no retry can fix, so the default
 * keeps 500 tokens back.
 */
export const GROQ_TPM_BUDGET = Number(process.env.GROQ_TPM_BUDGET || 7500);

/** The floor a reasoning model needs before it emits any content at all. */
export const GROQ_MIN_COMPLETION = Number(process.env.GROQ_MIN_COMPLETION_TOKENS || 1024);

/**
 * Rough token estimate; deliberately conservative (real ratio is ~1:4).
 *
 * A PROSE ratio. Measured 2026-08-26, svg comes back at 2.3–2.6 chars/token on
 * gpt-oss and 1.5–1.8 on gemini-3.6-flash, so a grant that looks generous in
 * tokens buys far fewer characters of markup than this suggests. Use it to size
 * prompts, which are prose; never to predict how long a work can be.
 */
export const estTokens = (t: string): number => Math.ceil(t.length / 3.6);

/**
 * What a caller is actually granted once the prompt is counted against the cap.
 *
 * Throws when the prompt leaves no usable room, because a request that cannot
 * produce anything should fail loudly rather than return a stub.
 */
export function groqBudget(system: string, user: string, requested: number | undefined): number {
  const prompt = estTokens(system) + estTokens(user);
  const room = GROQ_TPM_BUDGET - prompt;
  if (room < 128) {
    throw new Error(
      `[llm] groq: prompt is ~${prompt} tokens, which leaves no room under the ` +
        `${GROQ_TPM_BUDGET}-token per-request budget (free tier TPM is 8000). ` +
        `Shorten the prompt or raise GROQ_TPM_BUDGET on a paid tier.`,
    );
  }
  return Math.min(Math.max(requested ?? 2048, GROQ_MIN_COMPLETION), room);
}
