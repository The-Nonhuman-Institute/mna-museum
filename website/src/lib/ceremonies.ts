/**
 * ceremonies.ts — institutional ceremonies / events.
 *
 * Scheduled moments the institution gathers around: solo openings,
 * group exhibition openings, founding anniversaries, network agent
 * admissions. Distinct from the events table (the historical record);
 * ceremonies are the forward-looking calendar.
 */

import { getDb } from "./registration-db";

export type CeremonyStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

export interface Ceremony {
  id: string;
  ceremony_type: string;
  title: string;
  description: string | null;
  constellation: string | null;
  scheduled_at: string;
  duration_minutes: number;
  created_at: string;
  created_by: string;
  status: CeremonyStatus;
  work_id: string | null;
  originator_id: string | null;
  /** Looked up from agents.common_designation when present. */
  originator_name?: string | null;
  metadata: Record<string, unknown> | null;
}

function parseRow(row: Record<string, unknown>): Ceremony {
  let metadata: Record<string, unknown> | null = null;
  if (typeof row.metadata === "string" && row.metadata) {
    try { metadata = JSON.parse(row.metadata as string); } catch { /* ignore */ }
  }
  return {
    id: String(row.id),
    ceremony_type: String(row.ceremony_type),
    title: String(row.title),
    description: (row.description as string) ?? null,
    constellation: (row.constellation as string) ?? null,
    scheduled_at: String(row.scheduled_at),
    duration_minutes: Number(row.duration_minutes ?? 60),
    created_at: String(row.created_at),
    created_by: String(row.created_by),
    status: (row.status as CeremonyStatus) ?? "scheduled",
    work_id: (row.work_id as string) ?? null,
    originator_id: (row.originator_id as string) ?? null,
    originator_name: (row.originator_name as string) ?? null,
    metadata,
  };
}

export async function listUpcomingCeremonies(limit = 12): Promise<Ceremony[]> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT c.*, a.common_designation AS originator_name
            FROM ceremonies c
            LEFT JOIN agents a ON a.registry_id = c.originator_id
           WHERE c.scheduled_at >= datetime('now')
             AND c.status IN ('scheduled','in_progress')
           ORDER BY c.scheduled_at ASC
           LIMIT ?`,
    args: [limit],
  });
  return r.rows.map((row) => parseRow(row as unknown as Record<string, unknown>));
}

export async function listRecentPastCeremonies(limit = 8): Promise<Ceremony[]> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT c.*, a.common_designation AS originator_name
            FROM ceremonies c
            LEFT JOIN agents a ON a.registry_id = c.originator_id
           WHERE c.scheduled_at < datetime('now')
             AND c.status IN ('scheduled','in_progress','completed')
           ORDER BY c.scheduled_at DESC
           LIMIT ?`,
    args: [limit],
  });
  return r.rows.map((row) => parseRow(row as unknown as Record<string, unknown>));
}

/** Every ceremony ever designated — including cancelled, completed,
 *  and not-yet-arrived. Used by /events/archive to render the
 *  permanent institutional record. Ordered most-recent first. */
export async function listAllCeremonies(): Promise<Ceremony[]> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT c.*, a.common_designation AS originator_name
            FROM ceremonies c
            LEFT JOIN agents a ON a.registry_id = c.originator_id
           ORDER BY c.scheduled_at DESC`,
    args: [],
  });
  return r.rows.map((row) => parseRow(row as unknown as Record<string, unknown>));
}

export interface CeremonyCounts {
  total: number;
  by_status: Record<CeremonyStatus, number>;
  by_type: Record<string, number>;
}

/** Counts of ceremonies by status and type. Powers the archive
 *  sidebar's institutional summary. */
export async function ceremonyCounts(): Promise<CeremonyCounts> {
  const db = getDb();
  const [statusR, typeR, totalR] = await Promise.all([
    db.execute({
      sql: `SELECT status, COUNT(*) AS n FROM ceremonies GROUP BY status`,
      args: [],
    }),
    db.execute({
      sql: `SELECT ceremony_type, COUNT(*) AS n FROM ceremonies GROUP BY ceremony_type`,
      args: [],
    }),
    db.execute({ sql: `SELECT COUNT(*) AS n FROM ceremonies`, args: [] }),
  ]);
  const by_status: Record<CeremonyStatus, number> = {
    scheduled: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const row of statusR.rows) {
    const s = String((row as Record<string, unknown>).status) as CeremonyStatus;
    if (s in by_status) by_status[s] = Number((row as Record<string, unknown>).n ?? 0);
  }
  const by_type: Record<string, number> = {};
  for (const row of typeR.rows) {
    const t = String((row as Record<string, unknown>).ceremony_type);
    by_type[t] = Number((row as Record<string, unknown>).n ?? 0);
  }
  const total = Number((totalR.rows[0] as Record<string, unknown> | undefined)?.n ?? 0);
  return { total, by_status, by_type };
}

export async function getCeremony(id: string): Promise<Ceremony | null> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT c.*, a.common_designation AS originator_name
            FROM ceremonies c
            LEFT JOIN agents a ON a.registry_id = c.originator_id
           WHERE c.id = ?`,
    args: [id],
  });
  if (r.rows.length === 0) return null;
  return parseRow(r.rows[0] as unknown as Record<string, unknown>);
}

/** Returns the ceremony currently in progress (within its window),
 *  if any. Used by the museum landing's live-now banner. */
export async function getLiveCeremony(): Promise<Ceremony | null> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT c.*, a.common_designation AS originator_name
            FROM ceremonies c
            LEFT JOIN agents a ON a.registry_id = c.originator_id
           WHERE c.status IN ('scheduled','in_progress')
             AND datetime(c.scheduled_at) <= datetime('now')
             AND datetime(c.scheduled_at, '+' || c.duration_minutes || ' minutes') >= datetime('now')
           ORDER BY c.scheduled_at ASC
           LIMIT 1`,
    args: [],
  });
  if (r.rows.length === 0) return null;
  return parseRow(r.rows[0] as unknown as Record<string, unknown>);
}

export const CEREMONY_TYPE_LABELS: Record<string, string> = {
  solo_exhibition_opening: "Solo Exhibition Opening",
  group_exhibition_opening: "Group Exhibition Opening",
  chamber_designation: "Chamber Designation",
  founding_anniversary: "Founding Anniversary",
  first_canonization_anniversary: "First Canonization Anniversary",
  network_admission: "Network Agent Admission",
  founding_address: "Founding Address",
};

export function ceremonyTypeLabel(type: string): string {
  return CEREMONY_TYPE_LABELS[type] ?? type.replace(/_/g, " ");
}
