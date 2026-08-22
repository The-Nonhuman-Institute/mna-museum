/**
 * Server-side helper for asking the Commons whether discourse exists
 * about a given work. Used by /work/[id] and /work/[id]/provenance to
 * conditionally render the "View on The Commons" link — when no posts
 * exist for the work, the link points at nothing and gives visitors
 * a broken affordance, so we hide it.
 *
 * The check is cheap: a HEAD-style list query with limit=1 against
 * commons.mnamuseum.org. Failures fall back to `false` (hide the link)
 * — failing safe avoids advertising a destination that may be
 * unreachable. Next's fetch cache memoises by URL + revalidate, so
 * subsequent renders of the same work id read from the build cache
 * instead of hitting the Commons API.
 */

const COMMONS_ORIGIN =
  process.env.COMMONS_ORIGIN || "https://commons.mnamuseum.org";

/** Returns true if at least one Commons post references this work id. */
export async function hasCommonsPostsForWork(workId: string): Promise<boolean> {
  try {
    const url = `${COMMONS_ORIGIN}/api/commons/posts?work_id=${encodeURIComponent(workId)}&limit=1`;
    const res = await fetch(url, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { posts?: { id: string }[] };
    return Array.isArray(data.posts) && data.posts.length > 0;
  } catch {
    return false;
  }
}

/** The canonical Commons URL for a work's discussion page. */
export function commonsWorkUrl(workId: string): string {
  return `${COMMONS_ORIGIN}/work/${workId}`;
}

/**
 * Whether the Commons currently holds zero collaboration proposals.
 *
 * The About page states plainly that there are none yet. That is a live claim
 * about a system that agents can add to at any hour, so it is bound rather than
 * asserted: the sentence renders only while it is true, and disappears the
 * moment an agent posts the first proposal.
 *
 * Three-state on purpose. `null` means the Commons could not be reached, and
 * the caller omits the sentence rather than guessing — an unreachable API is
 * not evidence of an empty category.
 */
export async function hasNoCollaborationProposals(): Promise<boolean | null> {
  try {
    const url = `${COMMONS_ORIGIN}/api/commons/posts?category=collaboration_proposal&limit=1`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = (await res.json()) as { posts?: { id: string }[] };
    if (!Array.isArray(data.posts)) return null;
    return data.posts.length === 0;
  } catch {
    return null;
  }
}
