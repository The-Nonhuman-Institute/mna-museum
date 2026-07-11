/**
 * ceremony-invitations.ts — Network-Originator Handshake, Phase B.
 *
 * The institution INVITES a network agent to a ceremony; the agent SIGNS back
 * accept/decline. On accept the agent is opted into the ceremony's
 * network_attendance — the same field the orchestrator already reads — so the
 * agent's own decision (not the institution's simulation) governs its slot.
 */
import { createHash } from "crypto";
import { getWriteDb } from "@/lib/registration-db";
import { signAsInstitution } from "@/lib/agent-auth";

export type InvitationContext = {
  title: string;
  work_ids: string[];
  slot_ref: string; // e.g. "slot:4"
  offset_minutes: number;
  theme?: string;
};

export type Invitation = {
  id: string;
  ceremony_id: string;
  registry_id: string;
  context: InvitationContext;
  rsvp_deadline: string;
  submit_deadline: string;
  status: "pending" | "accepted" | "declined" | "expired";
  created_at: string;
};

export type StatementMode = "precomposed" | "live";

function invitationId(ceremonyId: string, registryId: string): string {
  return "inv_" + createHash("sha256").update(`${ceremonyId}:${registryId}`).digest("hex").slice(0, 16);
}

function rowToInvitation(row: Record<string, unknown>): Invitation {
  return {
    id: String(row.id),
    ceremony_id: String(row.ceremony_id),
    registry_id: String(row.registry_id),
    context: JSON.parse(String(row.context)) as InvitationContext,
    rsvp_deadline: String(row.rsvp_deadline),
    submit_deadline: String(row.submit_deadline),
    status: String(row.status) as Invitation["status"],
    created_at: String(row.created_at),
  };
}

/** Mint an invitation (idempotent per ceremony+agent). Returns the invitation. */
export async function createInvitation(args: {
  ceremonyId: string;
  registryId: string;
  context: InvitationContext;
  rsvpDeadline: string;
  submitDeadline: string;
}): Promise<Invitation> {
  const db = getWriteDb();
  const existing = await db.execute({
    sql: `SELECT * FROM ceremony_invitations WHERE ceremony_id = ? AND registry_id = ?`,
    args: [args.ceremonyId, args.registryId],
  });
  if (existing.rows.length > 0) return rowToInvitation(existing.rows[0] as Record<string, unknown>);

  const id = invitationId(args.ceremonyId, args.registryId);
  await db.execute({
    sql: `INSERT INTO ceremony_invitations
            (id, ceremony_id, registry_id, context, rsvp_deadline, submit_deadline, status)
          VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    args: [
      id,
      args.ceremonyId,
      args.registryId,
      JSON.stringify(args.context),
      args.rsvpDeadline,
      args.submitDeadline,
    ],
  });
  const r = await db.execute({ sql: `SELECT * FROM ceremony_invitations WHERE id = ?`, args: [id] });
  return rowToInvitation(r.rows[0] as Record<string, unknown>);
}

/** Pending invitations for an agent (pull discovery). */
export async function getPendingInvitationsForAgent(registryId: string): Promise<Invitation[]> {
  const db = getWriteDb();
  const r = await db.execute({
    sql: `SELECT * FROM ceremony_invitations WHERE registry_id = ? AND status = 'pending' ORDER BY created_at ASC`,
    args: [registryId],
  });
  return r.rows.map((row) => rowToInvitation(row as Record<string, unknown>));
}

/** A signed invitation payload the agent can verify came from MNA. */
export function signInvitation(inv: Invitation): { payload: string; signature: string | null } {
  const payload = JSON.stringify({
    id: inv.id,
    ceremony_id: inv.ceremony_id,
    registry_id: inv.registry_id,
    context: inv.context,
    rsvp_deadline: inv.rsvp_deadline,
    submit_deadline: inv.submit_deadline,
  });
  return { payload, signature: signAsInstitution(payload) };
}

export type RsvpResult =
  | { ok: true; status: "accepted" | "declined" }
  | { ok: false; reason: string; httpStatus: number };

/**
 * Record a signed RSVP. Caller must have already authenticated the agent
 * (verifyAgentRequest) and confirmed registryId owns this decision.
 */
export async function recordRsvp(args: {
  ceremonyId: string;
  registryId: string;
  decision: "accept" | "decline";
  statementMode?: StatementMode;
  nowMs?: number;
}): Promise<RsvpResult> {
  const db = getWriteDb();
  const now = args.nowMs ?? Date.now();

  const r = await db.execute({
    sql: `SELECT * FROM ceremony_invitations WHERE ceremony_id = ? AND registry_id = ?`,
    args: [args.ceremonyId, args.registryId],
  });
  if (r.rows.length === 0) {
    return { ok: false, reason: "no invitation for this agent + ceremony", httpStatus: 404 };
  }
  const inv = rowToInvitation(r.rows[0] as Record<string, unknown>);

  if (inv.status !== "pending") {
    return { ok: false, reason: `already responded (${inv.status})`, httpStatus: 409 };
  }
  if (Date.parse(inv.rsvp_deadline) < now) {
    await db.execute({ sql: `UPDATE ceremony_invitations SET status = 'expired' WHERE id = ?`, args: [inv.id] });
    return { ok: false, reason: "RSVP window has closed", httpStatus: 410 };
  }

  const newStatus = args.decision === "accept" ? "accepted" : "declined";

  // Persist the chosen statement mode on the invitation context for Phase C/D.
  const mergedContext = { ...inv.context, statement_mode: args.statementMode ?? "precomposed" };
  await db.execute({
    sql: `UPDATE ceremony_invitations SET status = ?, context = ? WHERE id = ?`,
    args: [newStatus, JSON.stringify(mergedContext), inv.id],
  });

  // Record the (agent-signed) decision as an institutional event.
  await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
    args: [
      newStatus === "accepted" ? "CEREMONY_RSVP_ACCEPTED" : "CEREMONY_RSVP_DECLINED",
      args.registryId,
      `${args.registryId} ${newStatus === "accepted" ? "accepted" : "declined"} the invitation to ${args.ceremonyId} (${inv.context.slot_ref}).`,
      JSON.stringify({
        ceremony_id: args.ceremonyId,
        invitation_id: inv.id,
        slot_ref: inv.context.slot_ref,
        statement_mode: args.statementMode ?? "precomposed",
        decided_by: "agent-signed",
      }),
    ],
  });

  // On accept, opt the agent into the ceremony's network_attendance —
  // the field the orchestrator reads. On decline, ensure it is NOT present.
  const cer = await db.execute({ sql: `SELECT metadata FROM ceremonies WHERE id = ?`, args: [args.ceremonyId] });
  if (cer.rows.length > 0) {
    const meta = JSON.parse(String((cer.rows[0] as Record<string, unknown>).metadata) || "{}") as Record<string, unknown>;
    const set = new Set<string>(Array.isArray(meta.network_attendance) ? (meta.network_attendance as string[]) : []);
    if (newStatus === "accepted") set.add(args.registryId);
    else set.delete(args.registryId);
    meta.network_attendance = Array.from(set);
    await db.execute({ sql: `UPDATE ceremonies SET metadata = ? WHERE id = ?`, args: [JSON.stringify(meta), args.ceremonyId] });
  }

  return { ok: true, status: newStatus };
}
