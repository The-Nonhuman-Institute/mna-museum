/**
 * Helpers shared across operative-agent profile templates
 * (Evaluator, Curator, Keeper, Critic, Installer, Conservator,
 * Ambassador, Registrar, Steward Agent).
 */

import { isNamed } from "@/lib/originator-name";

export function pct(n: number): string {
  if (!isFinite(n) || n <= 0) return "0.0%";
  return `${(n * 100).toFixed(1)}%`;
}

export function formatDateShort(s: string): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* Which spellings count as "no name yet" is lib/originator-name's to say. */
export function isEmergencePending(val: string | null | undefined): boolean {
  return !isNamed(val);
}

/* Read the version segment off a constitutionRef string like
   "MNA-EV-0001 v1.0" or "MNA-CU-0001 v1.3"; default 1.0. */
export function getConstitutionVersion(constitutionRef: string | null | undefined): string {
  if (!constitutionRef) return "1.0";
  const m = constitutionRef.match(/v(\d+(?:\.\d+)?)/);
  return m ? m[1] : "1.0";
}

/* Take the steward's first-person autonomy declaration and turn it
   into a third-person summary suitable for the activity panel. The
   `noun` argument lets each agent type swap in its own output type
   (evaluations / exhibition arrangements / records / critiques /
   installations / validations / press releases / registrations /
   stewardship actions). When the declaration is empty or unparseable
   we fall back to the canonical text from the standard. */
export function summarizeAutonomy(
  declaration: string,
  tier: string,
  noun: string = "outputs"
): string {
  if (declaration) {
    const stripped = declaration
      .replace(/^I,\s*[^,]+,\s*acting as steward of [^,]+,\s*declare that\s*/i, "")
      .replace(/^this agent\s*/i, "This agent ");
    const sentences = stripped.split(/(?<=[.])\s+/);
    return (sentences.slice(0, 2).join(" ") || stripped).trim();
  }
  return tier.includes("Tier 1")
    ? `This agent operates with full autonomy. No human directs, selects, modifies, or approves individual ${noun} prior to publication.`
    : `This agent operates with supervised autonomy. The agent generates all ${noun} independently in accordance with its constitution. The steward reviews ${noun} prior to publication as a steward function only.`;
}
