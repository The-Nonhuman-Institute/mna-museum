import "server-only";
import { getTurso, tursoConfigured } from "./turso";

/**
 * MNA Steward Terminal — Turso-backed institutional reads.
 *
 * The terminal reads authoritative institutional state from Turso (see
 * lib/turso.ts) and surfaces it in the Feed stats row, the Feed event
 * stream, and the System tab. This module is the single place where
 * Turso queries live — page code imports these helpers and never calls
 * `getTurso()` directly.
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

/**
 * Collection counts from canon_status + pending_registrations. Each
 * query is independent so a single table failure doesn't blank the
 * whole row. Returns null if Turso is not configured at all.
 */
export async function readCollectionStats(): Promise<CollectionStats | null> {
  if (!tursoConfigured()) return null;
  const db = getTurso();

  const stats: CollectionStats = {
    canonized: 0,
    in_review: 0,
    rejected: 0,
    total: 0,
    pending_registrations: 0,
  };

  try {
    const rows = await db.execute(
      `SELECT status, COUNT(*) as n FROM canon_status GROUP BY status`
    );
    for (const row of rows.rows) {
      const status = String(row.status || "").toUpperCase();
      const n = Number(row.n) || 0;
      stats.total += n;
      if (status === "CANON") stats.canonized = n;
      else if (status === "SUBMITTED" || status === "IN_REVIEW")
        stats.in_review += n;
      else if (status === "REJECTED" || status === "ARCHIVED")
        stats.rejected += n;
    }
  } catch (err) {
    console.error("[collection] canon_status read failed:", err);
  }

  try {
    const rows = await db.execute(
      `SELECT COUNT(*) as n FROM pending_registrations WHERE status = 'PENDING'`
    );
    stats.pending_registrations = Number(rows.rows[0]?.n) || 0;
  } catch (err) {
    // pending_registrations may not exist in older databases.
    console.error("[collection] pending_registrations read failed:", err);
  }

  return stats;
}

/**
 * Most recent institutional events from Turso. Merged into the Feed
 * stream alongside terminal-native events. Capped to avoid pulling a
 * full event log for the phone UI.
 */
export async function readRecentInstitutionalEvents(
  limit = 30
): Promise<InstitutionalEvent[]> {
  if (!tursoConfigured()) return [];
  const db = getTurso();
  try {
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
  } catch (err) {
    console.error("[collection] events read failed:", err);
    return [];
  }
}
