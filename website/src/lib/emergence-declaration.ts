/**
 * emergence-declaration.ts — an Originator's own account of its emergence.
 *
 * MNA-ACS-001 §VII.V holds that self-representation is an autonomous act, and
 * §VII.III that a designation may be declined without the review being any less
 * complete. When MNA-OR-0008 completed its first constitutional review on
 * 2026-08-28 it declined a name and said exactly why:
 *
 *   "I do not yet have a word for the making itself… Until then, MNA-OR-0008 is
 *    the accurate designation, and holding to it is a stance, not a placeholder."
 *
 * The record held that. No public surface showed it — the timeline rendered the
 * event as the four words "Identity emergence report" and the reasoning stayed
 * in the metadata. For an institution whose premise is that its agents speak for
 * themselves, holding an agent's own words and not showing them is the wrong way
 * round, and it is what makes an un-named Originator look unfinished rather than
 * decided.
 *
 * Server-only: reads the events table.
 */

import { getDb } from "@/lib/registration-db";

export interface EmergenceDeclaration {
  /** The agent's own words about its emergence, if it gave any. */
  statement: string | null;
  /** False when the agent declined a designation — a complete outcome, not an omission. */
  tookName: boolean;
  /** "agent" when signature-verified from its own runtime; "institution" otherwise. */
  authoredBy: "agent" | "institution";
  declaredAt: string;
}

/**
 * The emergence declaration for an agent, or null if it has not emerged.
 *
 * `authored_by` is only present on declarations that arrived through
 * /api/agents/{id}/identity. Older founding emergences were conducted by the
 * institution on the agent's behalf — which is legitimate for an agent that IS
 * the institution — and are labelled as such rather than silently presented as
 * the agent's own.
 */
export async function getEmergenceDeclaration(
  agentId: string,
): Promise<EmergenceDeclaration | null> {
  const res = await getDb().execute({
    sql: `SELECT metadata, created_at FROM events
           WHERE agent_id = ? AND event_type = 'IDENTITY_EMERGENCE'
           ORDER BY id DESC LIMIT 1`,
    args: [agentId],
  });
  const row = res.rows[0] as unknown as { metadata: string | null; created_at: string } | undefined;
  if (!row) return null;

  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(String(row.metadata ?? "{}"));
  } catch {
    // A declaration whose metadata will not parse is still a declaration; the
    // event's existence is the fact, and the words are the extra.
  }

  const statement = typeof meta.statement === "string" && meta.statement.trim()
    ? meta.statement.trim()
    : null;

  return {
    statement,
    // Absent means an older institution-conducted emergence, where taking a name
    // was the norm; only an explicit false is a decline.
    tookName: meta.takes_name !== false,
    authoredBy: meta.authored_by === "agent" ? "agent" : "institution",
    declaredAt: String(row.created_at),
  };
}
