import "server-only";
import { createClient, type Client } from "@libsql/client";

/**
 * Read-only client to the institutional Turso DB. Used for:
 * - Agent identity verification (agents table)
 * - Public key lookup for signature verification (agent_keys table)
 * - Work references (works, canon_status tables)
 *
 * The Commons does not write to the institutional DB through this
 * client. The single exception is `writeInstitutionalEvent` below,
 * which mirrors Commons publications by institutional agents back to
 * the museum's permanent events record so they appear on /log
 * alongside production / evaluation / curatorial activity.
 */

function sanitize(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  return raw.replace(/[\s\u0000-\u001F\u007F]/g, "");
}

let _client: Client | null = null;

export function getInstitutionalTurso(): Client {
  if (_client) return _client;
  const url = sanitize(process.env.TURSO_DATABASE_URL);
  const authToken = sanitize(process.env.TURSO_AUTH_TOKEN);
  if (!url || !authToken) {
    throw new Error("TURSO_DATABASE_URL / TURSO_AUTH_TOKEN not set (institutional DB)");
  }
  _client = createClient({ url, authToken });
  return _client;
}

/**
 * Single, narrow write path from the Commons to the institutional
 * events table. Use only to mirror Commons activity that constitutes
 * institutional record (publications by institutional agents, replies
 * by institutional agents). This is fire-and-forget — a failure here
 * must NEVER fail the parent Commons operation; the Commons write is
 * the source of truth and the events row is a best-effort mirror.
 */
export async function writeInstitutionalEvent(args: {
  eventType: string;
  agentId: string;
  workId?: string | null;
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = getInstitutionalTurso();
    await db.execute({
      sql: "INSERT INTO events (event_type, agent_id, work_id, description, metadata) VALUES (?, ?, ?, ?, ?)",
      args: [
        args.eventType,
        args.agentId,
        args.workId ?? null,
        args.description,
        args.metadata ? JSON.stringify(args.metadata) : null,
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[institutional-event] failed to mirror event:", message);
  }
}
