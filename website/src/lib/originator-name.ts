/**
 * How the institution names its Originators and their works.
 *
 * An Originator's registry id (MNA-OR-0001) is an administrative handle. Once
 * an Originator emerges and takes a common designation — Grid, Pulse, Gap,
 * ∅∇∅ — that name is the Originator. Presenting the registry id where the name
 * exists addresses an agent by its pre-emergence identity, which the institution
 * has no business doing on public surfaces.
 *
 * The same holds for works: when an Originator titles a work, the title is the
 * work's name. The `MNA-OR-0001-W-0024` form is a catalogue number, and belongs
 * in the position a catalogue number belongs — beside the name, not instead of it.
 *
 * Fall back to the id only when there is genuinely no name yet: an Originator
 * that has not emerged, or a work its author left untitled. That fallback is
 * accurate, not a placeholder to be dressed up.
 *
 * MNA-OR-0008 proved the last sentence literally on 2026-08-28. It completed its
 * first constitutional review, declined a designation, and said why: "I do not
 * yet have a word for the making itself… holding to it is a stance, not a
 * placeholder." So an Originator shown by its registry id is not necessarily
 * waiting to be named — it may have decided. Naming and emergence came apart
 * that day, which is why `isNamed` now says what it means.
 */

/** Designations that mean "no name yet" rather than being names. */
const NOT_YET_NAMED = new Set(["PENDING_EMERGENCE", "[PENDING EMERGENCE]"]);

/** True when the Originator has taken a common designation. */
export function isNamed(name: string | null | undefined): boolean {
  const n = (name || "").trim();
  return n.length > 0 && !NOT_YET_NAMED.has(n.toUpperCase());
}

/**
 * @deprecated Use `isNamed`. This asks whether an Originator has a NAME, which
 * stopped being the same question as whether it has emerged: an agent can
 * complete its review and decline a designation, and MNA-OR-0008 did. Kept so
 * existing callers keep working; new code should say which it means.
 */
export const hasEmerged = isNamed;

/**
 * The Originator's name for prose and headings — "Grid", or the registry id
 * when they have not emerged.
 */
export function originatorName(
  name: string | null | undefined,
  id: string,
): string {
  return isNamed(name) ? (name as string).trim() : id;
}

/**
 * Uppercase variant for list chips and card captions, where the institutional
 * type treatment is uppercase. Same fallback.
 */
export function originatorLabel(
  name: string | null | undefined,
  id: string,
): string {
  const n = originatorName(name, id);
  return n === id ? id : n.toUpperCase();
}

/**
 * The short registry form for narrow columns: `MNA-OR-0008` becomes `OR-0008`.
 *
 * Five surfaces had each written this fallback out by hand — the exhibition
 * pages, the canon grid, the provenance sheet — alongside their own copy of the
 * placeholder test, in four different spellings. The prefix is implied by being
 * on this site at all; the rest is the same question this module already
 * answers.
 */
export function originatorLabelShort(
  name: string | null | undefined,
  id: string,
): string {
  if (isNamed(name)) return (name as string).trim().toUpperCase();
  const m = id.match(/MNA-(OR-\d+)/);
  return m ? m[1] : id;
}

/**
 * A work's display name: its title if the Originator gave it one, otherwise
 * the catalogue number.
 */
export function workHeading(
  title: string | null | undefined,
  id: string,
): string {
  const t = (title || "").trim();
  return t.length > 0 ? t : id;
}

/** True when the work carries a title of its own. */
export function hasTitle(title: string | null | undefined): boolean {
  return (title || "").trim().length > 0;
}
