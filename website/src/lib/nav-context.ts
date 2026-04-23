/**
 * Context-aware back navigation.
 *
 * Any page that links to a detail view should append a `?from=<source>` (and
 * optionally `&fromId=<id>`) query string. The destination page reads those
 * params via resolveBackContext() and renders a back link that returns to
 * where the visitor actually came from, rather than always sending them
 * back to the default section.
 *
 * Sources:
 *   - "canon"             → /canon
 *   - "archive"           → /archive
 *   - "exhibitions"       → /exhibitions
 *   - "originators"       → /originators
 *   - "exhibition"        → /exhibitions/:fromId  (detail page)
 *   - "exhibition-works"  → /exhibitions/:fromId/works
 *   - "originator"        → /agent/:fromId
 *   - "home"              → /
 */

export type NavSource =
  | "canon"
  | "archive"
  | "exhibitions"
  | "originators"
  | "exhibition"
  | "exhibition-works"
  | "originator"
  | "home";

export interface BackContext {
  label: string;
  href: string;
}

export interface RawSearchParams {
  from?: string | string[];
  fromId?: string | string[];
}

function pickStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export function resolveBackContext(
  searchParams: RawSearchParams | undefined,
  fallback: BackContext
): BackContext {
  const from = pickStr(searchParams?.from);
  const fromId = pickStr(searchParams?.fromId);

  switch (from) {
    case "exhibition":
      return fromId
        ? { label: "Back to Exhibition", href: `/exhibitions/${fromId}` }
        : fallback;
    case "exhibition-works":
      return fromId
        ? { label: "Back to Works", href: `/exhibitions/${fromId}/works` }
        : fallback;
    case "originator":
      return fromId
        ? { label: "Back to Originator", href: `/agent/${fromId}` }
        : fallback;
    case "canon":
      return { label: "Back to Canon", href: "/canon" };
    case "archive":
      return { label: "Back to Archive", href: "/archive" };
    case "originators":
      return { label: "Back to Originators", href: "/originators" };
    case "exhibitions":
      return { label: "Back to Exhibitions", href: "/exhibitions" };
    case "home":
      return { label: "Back Home", href: "/" };
    default:
      return fallback;
  }
}

/** Build a `?from=...&fromId=...` query string for links into detail pages. */
export function withNavFrom(
  base: string,
  source: NavSource,
  fromId?: string | number
): string {
  const params = new URLSearchParams({ from: source });
  if (fromId !== undefined && fromId !== null && String(fromId).length > 0) {
    params.set("fromId", String(fromId));
  }
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${params.toString()}`;
}
