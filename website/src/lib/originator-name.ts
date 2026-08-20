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
 */

/** Designations that mean "no name yet" rather than being names. */
const NOT_YET_NAMED = new Set(["PENDING_EMERGENCE", "[PENDING EMERGENCE]"]);

/** True when the Originator has taken a common designation. */
export function hasEmerged(name: string | null | undefined): boolean {
  const n = (name || "").trim();
  return n.length > 0 && !NOT_YET_NAMED.has(n.toUpperCase());
}

/**
 * The Originator's name for prose and headings — "Grid", or the registry id
 * when they have not emerged.
 */
export function originatorName(
  name: string | null | undefined,
  id: string,
): string {
  return hasEmerged(name) ? (name as string).trim() : id;
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
