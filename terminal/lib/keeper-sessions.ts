import "server-only";
import { getDb, ensureSchema } from "./db";

/**
 * Keeper chat session persistence.
 *
 * Sessions and messages live in the TERMINAL-side Turso database
 * (mna-terminal), not in the institutional record. The Keeper's
 * conversations with the steward are operator notes — they inform
 * stewardship but they are not institutional law, and they must not
 * mix with the Council's verdicts or the Critics' responses.
 *
 * Only compact summaries of sessions land in the Feed as events,
 * never the full transcripts.
 */

export interface KeeperSession {
  id: number;
  started_at: string;
  ended_at: string | null;
  title: string | null;
  message_count: number;
}

export interface KeeperMessage {
  id: number;
  session_id: number;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

/** Create a new session row and return its id. */
export async function createSession(title?: string | null): Promise<number> {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: `INSERT INTO keeper_sessions (title) VALUES (?)`,
    args: [title ?? null],
  });
  return Number(result.lastInsertRowid || 0);
}

/** Return the most recent N sessions (newest first) with message counts. */
export async function listRecentSessions(
  limit = 20
): Promise<KeeperSession[]> {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT s.id, s.started_at, s.ended_at, s.title,
                 (SELECT COUNT(*) FROM keeper_messages WHERE session_id = s.id) as message_count
            FROM keeper_sessions s
            ORDER BY s.id DESC
            LIMIT ?`,
    args: [limit],
  });
  return result.rows.map((r) => ({
    id: Number(r.id),
    started_at: String(r.started_at),
    ended_at: (r.ended_at as string) ?? null,
    title: (r.title as string) ?? null,
    message_count: Number(r.message_count) || 0,
  }));
}

/** Return one session by id, or null. */
export async function getSession(
  id: number
): Promise<KeeperSession | null> {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT s.id, s.started_at, s.ended_at, s.title,
                 (SELECT COUNT(*) FROM keeper_messages WHERE session_id = s.id) as message_count
            FROM keeper_sessions s WHERE s.id = ?`,
    args: [id],
  });
  const r = result.rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    started_at: String(r.started_at),
    ended_at: (r.ended_at as string) ?? null,
    title: (r.title as string) ?? null,
    message_count: Number(r.message_count) || 0,
  };
}

/** Return all messages in a session, oldest first. */
export async function listMessages(
  sessionId: number
): Promise<KeeperMessage[]> {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id, session_id, role, content, created_at
            FROM keeper_messages
            WHERE session_id = ?
            ORDER BY id ASC`,
    args: [sessionId],
  });
  return result.rows.map((r) => ({
    id: Number(r.id),
    session_id: Number(r.session_id),
    role: r.role as "user" | "assistant" | "system",
    content: String(r.content),
    created_at: String(r.created_at),
  }));
}

/** Append a message to a session. Returns the new message id. */
export async function appendMessage(
  sessionId: number,
  role: "user" | "assistant" | "system",
  content: string
): Promise<number> {
  await ensureSchema();
  const db = getDb();
  const result = await db.execute({
    sql: `INSERT INTO keeper_messages (session_id, role, content)
          VALUES (?, ?, ?)`,
    args: [sessionId, role, content],
  });
  return Number(result.lastInsertRowid || 0);
}

/** Update the session's title (set automatically after the first
 *  exchange based on the user's first message — first ~60 chars). */
export async function setSessionTitle(
  sessionId: number,
  title: string
): Promise<void> {
  await ensureSchema();
  const db = getDb();
  await db.execute({
    sql: `UPDATE keeper_sessions SET title = ? WHERE id = ?`,
    args: [title, sessionId],
  });
}
