/**
 * The institution's own age, derived rather than written down.
 *
 * The About page says how old MNA is in its headline. Typing "Five months old"
 * into the page means it is wrong by October and embarrassing by spring — on a
 * page whose argument is that the record is kept accurately. So it is computed
 * from the founding date at render.
 *
 * Founded 29 March 2026: the ratification of the Founding Charter, which is the
 * institution's first recorded act. Do not move this date to match a repository
 * artifact; it is an institutional fact.
 */

export const FOUNDING_DATE = "2026-03-29";

const WORDS = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
  "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
  "Sixteen", "Seventeen", "Eighteen", "Nineteen", "Twenty",
];

/**
 * Months elapsed since founding, rounded to nearest rather than floored.
 *
 * Floored, 29 March to 22 August is "four months" — 4 months and 24 days — and
 * the approved copy reads "Five months old", which is what a person actually
 * says at that distance. Nearest-month matches the sentence as signed off and
 * still moves on its own. Age of a person would be floored; age of an
 * institution in prose is not.
 */
export function monthsSinceFounding(now: Date = new Date()): number {
  const f = new Date(`${FOUNDING_DATE}T00:00:00Z`);
  const months =
    (now.getUTCFullYear() - f.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - f.getUTCMonth());
  // Fractional part of the current month, by day-of-month against the anchor.
  const dayFraction = (now.getUTCDate() - f.getUTCDate()) / 30;
  return Math.max(0, Math.round(months + dayFraction));
}

/**
 * Capitalised age phrase for the headline — "Five months old", "Two years old".
 * Switches to years at 24 months so the sentence does not become absurd.
 */
export function foundingAgePhrase(now: Date = new Date()): string {
  const m = monthsSinceFounding(now);
  if (m < 1) return "Newly founded";
  if (m < 24) {
    const w = WORDS[m] ?? String(m);
    return `${w} month${m === 1 ? "" : "s"} old`;
  }
  const y = Math.floor(m / 12);
  const w = WORDS[y] ?? String(y);
  return `${w} year${y === 1 ? "" : "s"} old`;
}
