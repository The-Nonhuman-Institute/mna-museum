import "server-only";
import { getDb, ensureSchema } from "./db";

/**
 * MNA Steward Terminal — terminal-native event stream helpers.
 *
 * Every terminal-native activity writes through `recordEvent()` so the
 * Feed has a single source of truth. Institutional events from the
 * institutional Turso DB are merged into the Feed at read time (see
 * lib/collection.ts), not copied here — the institutional record is
 * authoritative for institutional state.
 *
 * All functions are async because the underlying database is remote
 * libSQL (Turso). Callers must await.
 *
 * Priority vocabulary:
 *   'normal'    — informational, lives in the stream
 *   'attention' — steward action required (pinned at top of Feed)
 *   'error'     — failure condition (pinned at top, styled rust)
 */

export type EventPriority = "normal" | "attention" | "error";
export type EventSource = "terminal" | "turso" | "system";

export interface RecordEventInput {
  event_type: string;
  agent_id?: string | null;
  work_id?: string | null;
  priority?: EventPriority;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  source?: EventSource;
}

export interface TerminalEvent {
  id: number;
  event_type: string;
  agent_id: string | null;
  work_id: string | null;
  priority: EventPriority;
  description: string | null;
  metadata: Record<string, unknown> | null;
  source: EventSource;
  created_at: string;
}

/**
 * Record a single terminal-native event. Safe to call from any
 * server code path (API routes, agent jobs, hardware probes).
 */
export async function recordEvent(input: RecordEventInput): Promise<number> {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, work_id, priority, description, metadata, source)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.event_type,
      input.agent_id ?? null,
      input.work_id ?? null,
      input.priority ?? "normal",
      input.description ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.source ?? "terminal",
    ],
  });
  return Number(result.lastInsertRowid || 0);
}

function rowToEvent(row: Record<string, unknown>): TerminalEvent {
  return {
    id: Number(row.id),
    event_type: row.event_type as string,
    agent_id: (row.agent_id as string) ?? null,
    work_id: (row.work_id as string) ?? null,
    priority: (row.priority as EventPriority) ?? "normal",
    description: (row.description as string) ?? null,
    metadata: row.metadata
      ? JSON.parse(row.metadata as string)
      : null,
    source: (row.source as EventSource) ?? "terminal",
    created_at: row.created_at as string,
  };
}

/** Most recent N terminal events, newest first. */
export async function readRecentEvents(limit = 50): Promise<TerminalEvent[]> {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id, event_type, agent_id, work_id, priority, description, metadata, source, created_at
            FROM events
            ORDER BY created_at DESC, id DESC
            LIMIT ?`,
    args: [limit],
  });
  return result.rows.map((r) =>
    rowToEvent(r as unknown as Record<string, unknown>)
  );
}

/** Priority alerts (attention + error), newest first. */
export async function readPriorityAlerts(
  limit = 10
): Promise<TerminalEvent[]> {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id, event_type, agent_id, work_id, priority, description, metadata, source, created_at
            FROM events
            WHERE priority IN ('attention', 'error')
            ORDER BY created_at DESC, id DESC
            LIMIT ?`,
    args: [limit],
  });
  return result.rows.map((r) =>
    rowToEvent(r as unknown as Record<string, unknown>)
  );
}
