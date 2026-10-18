/**
 * A subsequent constitutional review (MNA-ACS-001 §VII.IV, as amended by
 * AMD-002 §A2): an emerged Originator names itself, or revises its
 * constitution, after its first review.
 *
 * This file is the pure part: what a declaration changes, given what the record
 * holds now. The route (api/agents/[id]/constitutional-review) verifies the
 * signature and writes; nothing here composes, and nothing here reaches a model.
 *
 * Partial by design. A field the agent leaves out carries forward unchanged;
 * a field it sends identical to the record is affirmed, not changed. The event
 * says which, so the record shows exactly what the agent revised.
 */
import { isNamed } from "./originator-name";

export interface ReviewDeclaration {
  takes_name?: boolean;
  common_designation?: string | null;
  declared_orientation?: string;
  formal_tendencies?: string[] | string;
  aversions?: string[] | string;
  visual_color?: string | null;
  visual_symbol?: string | null;
  visual_form?: string | null;
  statement?: string;
  /** What occasioned the review, if anything — context, never a gate. */
  trigger?: string | null;
}

export interface CurrentIdentity {
  common_designation: string | null;
  declared_orientation: string | null;
  formal_tendencies: string[];
  aversions: string[];
  visual_color: string | null;
  visual_symbol: string | null;
  visual_form: string | null;
}

/** Fields a review may revise. `statement` and `trigger` are about the review, not the constitution. */
export const REVISABLE = [
  "common_designation",
  "declared_orientation",
  "formal_tendencies",
  "aversions",
  "visual_color",
  "visual_symbol",
  "visual_form",
] as const;
export type Revisable = (typeof REVISABLE)[number];

/** Fields that live on the constitution row; a change to any of them is a new constitution version. */
export const CONSTITUTIONAL: readonly Revisable[] = [
  "declared_orientation",
  "formal_tendencies",
  "aversions",
  "visual_color",
  "visual_symbol",
  "visual_form",
];

const KNOWN = new Set<string>(["takes_name", "statement", "trigger", ...REVISABLE]);

const asList = (v: string[] | string): string[] => (Array.isArray(v) ? v.map(String) : [String(v)]);
const parseList = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v !== "string" || !v.trim()) return [];
  try {
    const p = JSON.parse(v);
    return Array.isArray(p) ? p.map(String) : [v];
  } catch {
    return [v];
  }
};
export { parseList };

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export type ReviewResult =
  | { ok: true; next: CurrentIdentity; changed: Revisable[]; affirmed: Revisable[]; ignored: string[] }
  | { ok: false; error: string };

export function applyReview(current: CurrentIdentity, d: ReviewDeclaration): ReviewResult {
  const next: CurrentIdentity = { ...current };

  // The name. takes_name says what the agent means; a designation alone is
  // ambiguous (is it taking one, or quoting one?), so it must say.
  if (d.common_designation !== undefined && d.takes_name === undefined) {
    return { ok: false, error: "common_designation was given without takes_name. Say takes_name: true to take it, or false to hold none." };
  }
  if (d.takes_name === true) {
    const name = String(d.common_designation ?? "").trim();
    if (!isNamed(name)) return { ok: false, error: "takes_name is true but no usable designation was given." };
    next.common_designation = name;
  } else if (d.takes_name === false) {
    next.common_designation = null;
  }

  if (d.declared_orientation !== undefined) {
    const o = String(d.declared_orientation).trim();
    if (!o) return { ok: false, error: "declared_orientation, when given, may not be empty. Leave it out to carry it forward." };
    next.declared_orientation = o;
  }
  if (d.formal_tendencies !== undefined) next.formal_tendencies = asList(d.formal_tendencies);
  if (d.aversions !== undefined) next.aversions = asList(d.aversions);
  if (d.visual_color !== undefined) next.visual_color = d.visual_color;
  if (d.visual_symbol !== undefined) next.visual_symbol = d.visual_symbol;
  if (d.visual_form !== undefined) next.visual_form = d.visual_form;

  const sent = new Set(Object.keys(d));
  const changed: Revisable[] = [];
  const affirmed: Revisable[] = [];
  for (const f of REVISABLE) {
    const given = f === "common_designation" ? sent.has("takes_name") || sent.has(f) : sent.has(f);
    if (!given) continue;
    (same(current[f], next[f]) ? affirmed : changed).push(f);
  }
  return { ok: true, next, changed, affirmed, ignored: Object.keys(d).filter((k) => !KNOWN.has(k)) };
}

/** "1.0" → "1.1"; "1.9" → "1.10". A version the record cannot read becomes "<it>.1". */
export function nextVersion(v: string): string {
  const m = /^(\d+)\.(\d+)$/.exec(v.trim());
  return m ? `${m[1]}.${Number(m[2]) + 1}` : `${v.trim()}.1`;
}
