import "server-only";
import {
  getInstitutionalTurso,
  institutionalTursoConfigured,
} from "./institutional-turso";

/**
 * MNA Steward Terminal — Turso-backed institutional reads.
 *
 * The terminal reads authoritative institutional state from Turso (see
 * lib/turso.ts) and surfaces it in the Feed stats row, the Feed event
 * stream, and the System tab. This module is the single place where
 * Turso queries live — page code imports these helpers and never calls
 * `getInstitutionalTurso()` directly.
 *
 * All functions degrade gracefully: if Turso credentials are missing,
 * or a query fails, they return `null` (for scalars/objects) or `[]`
 * (for lists). The UI is responsible for rendering em-dashes or
 * placeholder states when data is unavailable — the goal is that the
 * terminal always boots, even with a half-configured environment.
 */

export interface CollectionStats {
  canonized: number;
  in_review: number;
  rejected: number;
  total: number;
  /** Count of pending external steward registrations. */
  pending_registrations: number;
}

export interface InstitutionalEvent {
  id: number;
  event_type: string;
  agent_id: string | null;
  work_id: string | null;
  description: string | null;
  created_at: string;
}

export interface InstitutionalAgent {
  registry_id: string;
  agent_type: string;
  common_designation: string | null;
  function_statement: string | null;
  operational_status: string | null;
}

/**
 * Collection counts from canon_status + pending_registrations.
 * Throws on query failure so the Feed's safe() wrapper can capture
 * and surface the error in the diagnostic block instead of silently
 * returning zeros (which is what was hiding the bearer-token bug).
 * Returns null only when Turso is not configured at all.
 */
export async function readCollectionStats(): Promise<CollectionStats | null> {
  if (!institutionalTursoConfigured()) return null;
  const db = getInstitutionalTurso();

  const stats: CollectionStats = {
    canonized: 0,
    in_review: 0,
    rejected: 0,
    total: 0,
    pending_registrations: 0,
  };

  const statusRows = await db.execute(
    `SELECT status, COUNT(*) as n FROM canon_status GROUP BY status`
  );
  for (const row of statusRows.rows) {
    const status = String(row.status || "").toUpperCase();
    const n = Number(row.n) || 0;
    stats.total += n;
    if (status === "CANON") stats.canonized = n;
    else if (status === "SUBMITTED" || status === "IN_REVIEW")
      stats.in_review += n;
    else if (status === "REJECTED" || status === "ARCHIVED")
      stats.rejected += n;
  }

  // pending_registrations is tolerated separately — the table may
  // not exist on older databases, and that's not a fatal error for
  // the stats row. Log but don't throw.
  try {
    const rows = await db.execute(
      `SELECT COUNT(*) as n FROM pending_registrations WHERE status = 'PENDING'`
    );
    stats.pending_registrations = Number(rows.rows[0]?.n) || 0;
  } catch (err) {
    console.error("[collection] pending_registrations read failed:", err);
  }

  return stats;
}

/**
 * Most recent institutional events from Turso. Merged into the Feed
 * stream alongside terminal-native events. Capped to avoid pulling a
 * full event log for the phone UI.
 *
 * Throws on failure so the Feed diagnostic can capture it.
 */
export async function readRecentInstitutionalEvents(
  limit = 30
): Promise<InstitutionalEvent[]> {
  if (!institutionalTursoConfigured()) return [];
  const db = getInstitutionalTurso();
  const rows = await db.execute({
    sql: `SELECT id, event_type, agent_id, work_id, description, created_at
            FROM events
            ORDER BY created_at DESC, id DESC
            LIMIT ?`,
    args: [limit],
  });
  return rows.rows.map((r) => ({
    id: Number(r.id),
    event_type: String(r.event_type),
    agent_id: (r.agent_id as string) ?? null,
    work_id: (r.work_id as string) ?? null,
    description: (r.description as string) ?? null,
    created_at: String(r.created_at),
  }));
}

/**
 * Full institutional agent registry. The authoritative source for
 * "who exists at MNA right now." Includes founding agents and any
 * external network originators that have been activated. Used by the
 * System tab's Agent Roster and (in Phase 3) by the Keeper's
 * institutional context snapshot.
 *
 * Reading from Turso instead of parsing founding-documents/agents/
 * off disk so the terminal works on Vercel (which doesn't bundle the
 * founding-documents directory from outside its own root).
 */
export async function listInstitutionalAgents(): Promise<
  InstitutionalAgent[]
> {
  if (!institutionalTursoConfigured()) return [];
  const db = getInstitutionalTurso();
  const rows = await db.execute(
    `SELECT registry_id, agent_type, common_designation,
            function_statement, operational_status
       FROM agents
       ORDER BY registry_id`
  );
  return rows.rows.map((r) => ({
    registry_id: r.registry_id as string,
    agent_type: r.agent_type as string,
    common_designation: (r.common_designation as string) ?? null,
    function_statement: (r.function_statement as string) ?? null,
    operational_status: (r.operational_status as string) ?? null,
  }));
}
