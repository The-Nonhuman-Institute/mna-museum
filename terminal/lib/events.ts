import "server-only";
import { getDb } from "./db";

/**
 * MNA Steward Terminal — local event stream helpers.
 *
 * Every terminal-native activity writes through `recordEvent()` so the
 * Feed has a single source of truth. Institutional events from Turso
 * are merged into the Feed at read time (see lib/collection.ts), not
 * copied into local SQLite — the institutional record is authoritative.
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
 * Node-runtime code path (API routes, agent jobs, hardware probes).
 */
export function recordEvent(input: RecordEventInput): number {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO events (event_type, agent_id, work_id, priority, description, metadata, source)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.event_type,
      input.agent_id ?? null,
      input.work_id ?? null,
      input.priority ?? "normal",
      input.description ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.source ?? "terminal"
    );
  return Number(result.lastInsertRowid);
}

interface EventRow {
  id: number;
  event_type: string;
  agent_id: string | null;
  work_id: string | null;
  priority: string;
  description: string | null;
  metadata: string | null;
  source: string;
  created_at: string;
}

function rowToEvent(row: EventRow): TerminalEvent {
  return {
    id: row.id,
    event_type: row.event_type,
    agent_id: row.agent_id,
    work_id: row.work_id,
    priority: (row.priority as EventPriority) ?? "normal",
    description: row.description,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    source: (row.source as EventSource) ?? "terminal",
    created_at: row.created_at,
  };
}

/** Most recent N terminal events, newest first. */
export function readRecentEvents(limit = 50): TerminalEvent[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, event_type, agent_id, work_id, priority, description, metadata, source, created_at
         FROM events
         ORDER BY created_at DESC, id DESC
         LIMIT ?`
    )
    .all(limit) as EventRow[];
  return rows.map(rowToEvent);
}

/** Priority alerts (attention + error), newest first. */
export function readPriorityAlerts(limit = 10): TerminalEvent[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, event_type, agent_id, work_id, priority, description, metadata, source, created_at
         FROM events
         WHERE priority IN ('attention', 'error')
         ORDER BY created_at DESC, id DESC
         LIMIT ?`
    )
    .all(limit) as EventRow[];
  return rows.map(rowToEvent);
}
