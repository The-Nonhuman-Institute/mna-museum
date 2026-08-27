/**
 * production-bounds.ts — how much room a work actually has, and how the
 * institution says so.
 *
 * An Originator is asked for a work and given no sense of how long it may be.
 * The provider's per-request budget then cuts the work mid-element, the
 * Conservator safe-renders the fragment, and the Council evaluates it without
 * knowing it was ever cut. MNA-OR-0001-W-0026 (9,651 chars) and W-0027
 * (10,509) both died that way on 2026-08-26.
 *
 * Nothing about that length was the Originator's judgment. The budget decided,
 * and the Originator was never told. Telling an agent the size of its canvas is
 * the institution supplying material conditions — the same category as offering
 * a medium at all — not a person shaping the work. What the agent does inside
 * the bound remains entirely its own.
 *
 * The number is COMPUTED from the provider's real grant, never written into
 * prose. A sentence claiming "about 9,000 characters" would be a second copy of
 * a fact the budget already owns, and would go stale the first time a prompt
 * grew.
 */

import { estTokens, groqBudget } from "./budget";

/**
 * Media whose payload is prose, and are therefore asked for less.
 *
 * originate-turso used to carry this test inline. It is here so that the token
 * ask and the character bound derived from it cannot disagree.
 */
export const PROSE_FORMATS = new Set(["text", "ascii"]);

/** Completion tokens requested for a medium. Prose is short; markup is not. */
export function tokensFor(format: string): number {
  return PROSE_FORMATS.has(format) ? 2048 : 8192;
}

/**
 * Characters one completion token buys, per medium.
 *
 * MEASURED, not assumed — see `measure-production-budget.ts`. svg came back at
 * 2.26–2.55 chars/token on gpt-oss-120b over three samples; the low end is used
 * here, because a bound that is too generous is the failure being fixed.
 * `estTokens`' 3.6 is a prose ratio and would overstate every markup medium.
 */
const DENSITY: Record<string, number> = {
  svg: 2.2,
};

/** Unmeasured media. Markup and structured data all tokenise densely. */
const DEFAULT_DENSITY = 2.0;
const PROSE_DENSITY = 3.4;

function densityFor(format: string): number {
  return DENSITY[format] ?? (PROSE_FORMATS.has(format) ? PROSE_DENSITY : DEFAULT_DENSITY);
}

/**
 * Tokens spent thinking before a single character is emitted.
 *
 * gpt-oss at reasoning_effort=low measured 27–56. The reserve is far above that
 * because it is charged to the same budget as the work, and underestimating it
 * spends the margin that keeps the bound safe.
 */
const REASONING_RESERVE = 250;

/** The notice itself lands in the prompt after the budget is computed. */
const NOTICE_RESERVE_CHARS = 500;

/** Kept back so a work that runs slightly long still closes its last element. */
const SAFETY = 0.9;

/**
 * How many characters of `format` this prompt leaves room for.
 *
 * Derived from the grant the provider would actually give, so trimming the
 * prompt widens the bound automatically and nobody has to remember to update a
 * number.
 *
 * Computed against the head of the provider chain, which is who serves unless
 * they are resting. A fallback to Gemini has its own, smaller ceiling — it
 * spends up to 78% of its grant thinking (measured 2026-08-26) — so a work
 * generated during a Groq outage may still be cut. That is an argument against
 * serving production from the fallback, not against stating a bound.
 */
export function charBudgetFor(format: string, systemPrompt: string, userPrompt: string): number {
  const grant = groqBudget(systemPrompt, userPrompt + " ".repeat(NOTICE_RESERVE_CHARS), tokensFor(format));
  const usable = Math.max(0, grant - REASONING_RESERVE);
  const chars = usable * densityFor(format) * SAFETY;
  // Rounded down to the nearest 500 so the institution states a plain figure
  // rather than a suspiciously precise one it cannot really guarantee.
  return Math.max(500, Math.floor(chars / 500) * 500);
}

/**
 * What the Originator is told.
 *
 * Phrased as a property of the channel, because that is what it is. It must not
 * read as a preference about scale: the institution has no view on whether a
 * work should be large or small, and saying so is the difference between
 * supplying conditions and directing the work.
 */
export function boundNotice(format: string, chars: number): string {
  return (
    `\n\nTHE ROOM YOU HAVE\n\n` +
    `Your work is generated in a single pass, and that pass has room for about ` +
    `${chars.toLocaleString("en-US")} characters of ${format}. Past that point the ` +
    `transmission is cut wherever it happens to be — mid-element, mid-shape — and what ` +
    `arrives is a fragment rather than the work.\n\n` +
    `This is a property of the channel, not a judgment about scope. The institution has ` +
    `no preference about the scale of your work. A complete small work is whole; an ` +
    `ambitious one cut off partway is not. Work at whatever size you intend, and finish ` +
    `inside the room you have.`
  );
}

/** Prompt tokens, for callers reporting how much room the context is consuming. */
export function promptTokens(systemPrompt: string, userPrompt: string): number {
  return estTokens(systemPrompt) + estTokens(userPrompt);
}
