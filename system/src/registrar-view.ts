/**
 * registrar-view.ts — how much of a work the Registrar can actually be shown.
 *
 * Lives apart from evaluate-turso-works.ts because that script calls main() at
 * import: anything importing it to reuse a function runs a real evaluation pass,
 * and in CI, where Turso credentials are absent, exits the process. A test that
 * cannot import the thing it tests will end up testing a copy of it instead.
 *
 * Imports only ./budget, which imports nothing.
 */

import { estTokens } from "./budget";

/** Completion tokens the Registrar is asked for; reserved out of the budget. */
export const REGISTRAR_COMPLETION_TOKENS = 1024;

/**
 * As much of the work as the Registrar can actually be shown, and whether that
 * was all of it.
 *
 * The prompt embedded `output_payload` whole. MNA-OR-0008-W-0022 is 29,121
 * characters of html-css — about 8,090 tokens, more than the entire 7,500-token
 * per-request budget on its own — so the request was refused outright by Groq
 * and only Gemini could serve it. A deadlock that can be resolved by exactly one
 * provider is a deadlock that waits when that provider is down, which is what
 * happened on 2026-08-31: a 503 mid-call left the work IN_REVIEW with all four
 * votes cast and no tally.
 *
 * Head and tail rather than head alone. Markup opens with its setup and closes
 * with what it built; the first 6,000 characters of an html document can be
 * stylesheet and nothing else, which would show the Registrar the least
 * decisive part of the work.
 *
 * The elision is marked in the text, and the caller states the numbers, because
 * a Registrar weighing a work it has seen part of should know that is what it is
 * doing.
 */
export function boundedWorkView(payload: string, budgetTokens: number): {
  text: string;
  excerpted: boolean;
  shownChars: number;
  totalChars: number;
} {
  const total = payload.length;
  if (estTokens(payload) <= budgetTokens) {
    return { text: payload, excerpted: false, shownChars: total, totalChars: total };
  }
  // estTokens is len/3.6; invert it to characters and keep a little back.
  const room = Math.max(400, Math.floor(budgetTokens * 3.6 * 0.95));
  const headChars = Math.floor(room * 0.6);
  const tailChars = room - headChars;
  const elided = total - headChars - tailChars;
  const text =
    payload.slice(0, headChars) +
    `\n\n[… ${elided.toLocaleString("en-US")} characters elided from the middle of the work …]\n\n` +
    payload.slice(total - tailChars);
  return { text, excerpted: true, shownChars: headChars + tailChars, totalChars: total };
}

