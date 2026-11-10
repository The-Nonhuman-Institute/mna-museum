/**
 * How a model provider's failure is read: worth retrying, out of funds, or too
 * large to ever succeed. No imports, so the website's tests can hold it.
 *
 * Out of funds is the one that must fall through to the next provider rather
 * than end the turn. On 2026-11-10 every tick whose agent thinks on Ollama
 * Cloud failed outright: Ollama's free allowance was spent and it said so as
 * "402: Add usage credits or subscribe…", which matched none of these, so the
 * error ended the turn instead of passing it to Groq.
 */
export const RETRYABLE = /rate.?limit|429|content filtering|blocked|overloaded|503|502|timeout|ECONNRESET|fetch failed|high demand|UNAVAILABLE|empty content/i;
/** Non-retryable and worth saying plainly — the institution halted on this once. */
export const OUT_OF_FUNDS = /credit balance is too low|insufficient_quota|insufficient_credits|\b402\b|usage credits|payment required|subscribe and save/i;
/** Retrying cannot fix a request that is structurally too large. */
export const TOO_LARGE = /request too large|reduce your message size/i;

/** Quota or funds exhausted, as distinct from any other failure: the call may fall through. */
export function isQuotaError(msg: string): boolean {
  return /rate.?limit|quota|429|tokens per (day|minute)|TPD|TPM|RPD|resource_exhausted/i.test(msg) || OUT_OF_FUNDS.test(msg);
}
