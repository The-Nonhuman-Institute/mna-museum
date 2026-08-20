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
  /**
   * The source listing's own query string (filters, page, sort), URL-encoded.
   * Without it, returning to /canon from a work drops whatever filter the
   * visitor was browsing and silently resets them to the canon view.
   */
  fromQs?: string | string[];
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
  const fromQs = pickStr(searchParams?.fromQs);
  /** Re-attach the listing's filter state, when the link carried it. */
  const withQs = (href: string): string => (fromQs ? `${href}?${fromQs}` : href);

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
      return { label: "Back to Canon", href: withQs("/canon") };
    case "archive":
      return { label: "Back to Archive", href: withQs("/archive") };
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
  fromId?: string | number,
  /** The listing's current query string, so the back link restores filters. */
  fromQs?: string
): string {
  const params = new URLSearchParams({ from: source });
  if (fromId !== undefined && fromId !== null && String(fromId).length > 0) {
    params.set("fromId", String(fromId));
  }
  if (fromQs) params.set("fromQs", fromQs);
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${params.toString()}`;
}
