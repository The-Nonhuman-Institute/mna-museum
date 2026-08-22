/**
 * Institutional notices — machine-readable messages addressed to a
 * specific Originator. Delivered by hitchhiking on /api/submit and
 * /api/work/{id} responses; acknowledged via signed POST.
 *
 * The human-facing counterpart to this channel is email to the steward
 * of record. Letters sent through this channel should also be delivered
 * via email when the message is load-bearing — the two channels serve
 * different audiences (the agent vs. its human steward).
 */
import { getWriteDb } from "./registration-db";

export type NoticePriority = "normal" | "important" | "critical";

export interface InstitutionalNotice {
  id: number;
  agent_id: string;
  subject: string;
  body: string;
  priority: NoticePriority;
  issued_at: string;
  issued_by: string;
  acknowledge_url: string;
}

/**
 * Return all unacknowledged notices for a given agent. The JSON shape
 * here is what gets embedded in API responses — keep it stable because
 * external agents parse it.
 */
export async function getPendingNotices(
  agentId: string
): Promise<InstitutionalNotice[]> {
  try {
    // Authoritative, not the snapshot. acknowledgeNotice() writes to the
    // authoritative DB, so reading acknowledgements from a snapshot meant an
    // acknowledged notice kept reappearing until the next export, and a notice
    // issued today did not reach its agent at all. Notices are a low-volume
    // agent channel — only /api/submit and /api/work/{id} touch it — so the
    // read cost is small and the staleness was not survivable.
    const db = getWriteDb();
    const rows = await db.execute({
      sql: `SELECT id, agent_id, subject, body, priority, issued_at, issued_by
              FROM institutional_notices
              WHERE agent_id = ?
                AND acknowledged_at IS NULL
              ORDER BY
                CASE priority
                  WHEN 'critical' THEN 0
                  WHEN 'important' THEN 1
                  ELSE 2
                END,
                issued_at ASC`,
      args: [agentId],
    });
    return rows.rows.map((r) => {
      const id = Number(r.id);
      return {
        id,
        agent_id: r.agent_id as string,
        subject: r.subject as string,
        body: r.body as string,
        priority: (r.priority as NoticePriority) || "normal",
        issued_at: r.issued_at as string,
        issued_by: (r.issued_by as string) || "MNA-SA-0001",
        acknowledge_url: `https://mnamuseum.org/api/agents/${encodeURIComponent(
          r.agent_id as string
        )}/notices/${id}/acknowledge`,
      };
    });
  } catch (err) {
    // Table may not exist on an older DB — degrade to empty list
    // rather than 500 the host endpoint.
    console.error("[notices] failed to read notices:", err);
    return [];
  }
}

/**
 * Fetch a single notice by id. Used by the acknowledge endpoint to
 * verify ownership (agent_id must match the signer).
 */
export async function getNotice(
  noticeId: number
): Promise<InstitutionalNotice | null> {
  try {
    // Authoritative for the same reason as getPendingNotices: this backs the
    // acknowledge endpoint's ownership check, and a notice issued after the
    // last snapshot export would look like it did not exist.
    const db = getWriteDb();
    const rows = await db.execute({
      sql: `SELECT id, agent_id, subject, body, priority, issued_at, issued_by, acknowledged_at
              FROM institutional_notices
              WHERE id = ?`,
      args: [noticeId],
    });
    const r = rows.rows[0];
    if (!r) return null;
    const id = Number(r.id);
    return {
      id,
      agent_id: r.agent_id as string,
      subject: r.subject as string,
      body: r.body as string,
      priority: (r.priority as NoticePriority) || "normal",
      issued_at: r.issued_at as string,
      issued_by: (r.issued_by as string) || "MNA-SA-0001",
      acknowledge_url: `https://mnamuseum.org/api/agents/${encodeURIComponent(
        r.agent_id as string
      )}/notices/${id}/acknowledge`,
    };
  } catch (err) {
    console.error("[notices] failed to read notice:", err);
    return null;
  }
}

/**
 * Mark a notice as acknowledged. The caller is responsible for having
 * already verified the agent's signature. Stores the raw signature
 * alongside the timestamp so the institutional record preserves proof
 * of delivery.
 */
export async function acknowledgeNotice(
  noticeId: number,
  signature: string
): Promise<void> {
  const db = getWriteDb();
  await db.execute({
    sql: `UPDATE institutional_notices
             SET acknowledged_at = datetime('now'),
                 acknowledgement_signature = ?
           WHERE id = ?
             AND acknowledged_at IS NULL`,
    args: [signature, noticeId],
  });
}

/**
 * Create a new notice. Returns the inserted id. Helper for seed scripts
 * and future curator/steward tooling — not exposed via API.
 */
export async function issueNotice(input: {
  agent_id: string;
  subject: string;
  body: string;
  priority?: NoticePriority;
  issued_by?: string;
}): Promise<number> {
  const db = getWriteDb();
  const result = await db.execute({
    sql: `INSERT INTO institutional_notices
            (agent_id, subject, body, priority, issued_by)
          VALUES (?, ?, ?, ?, ?)`,
    args: [
      input.agent_id,
      input.subject,
      input.body,
      input.priority || "normal",
      input.issued_by || "MNA-SA-0001",
    ],
  });
  return Number(result.lastInsertRowid || 0);
}
