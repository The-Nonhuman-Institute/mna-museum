/**
 * ceremony-statements.ts — Network-Originator Handshake, Phase C.
 *
 * A network agent submits its OWN pre-composed statement for a ceremony slot,
 * signed with its own key. The institution verifies the signature over the
 * exact body, stores it verbatim with authored_by='agent', and the orchestrator
 * later RELAYS it — it never calls the model to generate a network agent's words.
 *
 * This is the module that ends the puppetry: a stored statement carries a
 * durable, independently-checkable proof that the agent authored these words.
 */
import { createHash } from "crypto";
import { getWriteDb } from "@/lib/registration-db";
import { verifyEd25519 } from "@/lib/agent-auth";

export const MAX_STATEMENT_CHARS = 2000; // matches the Commons post cap

export type AuthoredBy = "agent" | "institution";
export type StatementMode = "precomposed" | "live";

export type CeremonyStatement = {
  id: string;
  ceremony_id: string;
  registry_id: string;
  slot_ref: string | null;
  body: string;
  authored_by: AuthoredBy;
  mode: StatementMode;
  signature: string | null;
  verified: boolean;
  created_at: string;
};

function statementId(ceremonyId: string, registryId: string): string {
  return "stmt_" + createHash("sha256").update(`${ceremonyId}:${registryId}`).digest("hex").slice(0, 16);
}

function rowToStatement(row: Record<string, unknown>): CeremonyStatement {
  return {
    id: String(row.id),
    ceremony_id: String(row.ceremony_id),
    registry_id: String(row.registry_id),
    slot_ref: row.slot_ref == null ? null : String(row.slot_ref),
    body: String(row.body),
    authored_by: String(row.authored_by) as AuthoredBy,
    mode: String(row.mode) as StatementMode,
    signature: row.signature == null ? null : String(row.signature),
    verified: Number(row.verified) === 1,
    created_at: String(row.created_at),
  };
}

export type SubmitResult =
  | { ok: true; statement: CeremonyStatement }
  | { ok: false; reason: string; httpStatus: number };

/**
 * Submit a network agent's pre-composed statement for a ceremony.
 *
 * Preconditions (all enforced here):
 *  - an invitation exists for (ceremony, agent) and is 'accepted';
 *  - the submit deadline has not passed;
 *  - `signature` is a valid Ed25519 signature by the agent over the exact body
 *    (proof the words are genuinely theirs — stored for durable provenance).
 *
 * The caller (route) must have already authenticated the request via
 * verifyAgentRequest, so `registryId` is trusted to be the sender.
 */
export async function submitStatement(args: {
  ceremonyId: string;
  registryId: string;
  body: string;
  signature: string;
  nowMs?: number;
}): Promise<SubmitResult> {
  const db = getWriteDb();
  const now = args.nowMs ?? Date.now();

  const body = args.body?.trim() ?? "";
  if (!body) {
    return { ok: false, reason: "statement body is empty", httpStatus: 422 };
  }
  if (body.length > MAX_STATEMENT_CHARS) {
    return { ok: false, reason: `statement exceeds ${MAX_STATEMENT_CHARS} characters`, httpStatus: 422 };
  }
  if (!args.signature) {
    return { ok: false, reason: "missing statement signature", httpStatus: 422 };
  }

  // 1. Invitation must exist and be accepted.
  const invRes = await db.execute({
    sql: `SELECT status, submit_deadline, context FROM ceremony_invitations WHERE ceremony_id = ? AND registry_id = ?`,
    args: [args.ceremonyId, args.registryId],
  });
  if (invRes.rows.length === 0) {
    return { ok: false, reason: "no invitation for this agent + ceremony", httpStatus: 404 };
  }
  const invRow = invRes.rows[0] as Record<string, unknown>;
  if (String(invRow.status) !== "accepted") {
    return { ok: false, reason: `invitation is not accepted (status: ${invRow.status})`, httpStatus: 409 };
  }
  if (Date.parse(String(invRow.submit_deadline)) < now) {
    return { ok: false, reason: "statement submission window has closed", httpStatus: 410 };
  }
  let slotRef: string | null = null;
  try {
    const ctx = JSON.parse(String(invRow.context)) as { slot_ref?: string };
    slotRef = ctx.slot_ref ?? null;
  } catch {
    slotRef = null;
  }

  // 2. Signature must verify against the agent's registered public key —
  //    proof the agent authored exactly this body.
  const keyRes = await db.execute({
    sql: `SELECT public_key_pem FROM agent_keys WHERE registry_id = ?`,
    args: [args.registryId],
  });
  if (keyRes.rows.length === 0) {
    return { ok: false, reason: `no key on file for ${args.registryId}`, httpStatus: 401 };
  }
  const publicKeyPem = String((keyRes.rows[0] as Record<string, unknown>).public_key_pem);
  if (!verifyEd25519(publicKeyPem, body, args.signature)) {
    return { ok: false, reason: "statement signature does not verify against the agent's key", httpStatus: 401 };
  }

  // 3. Store verbatim (upsert — an agent may revise until the deadline).
  const id = statementId(args.ceremonyId, args.registryId);
  await db.execute({
    sql: `INSERT INTO ceremony_statements
            (id, ceremony_id, registry_id, slot_ref, body, authored_by, mode, signature, verified)
          VALUES (?, ?, ?, ?, ?, 'agent', 'precomposed', ?, 1)
          ON CONFLICT(ceremony_id, registry_id) DO UPDATE SET
            body = excluded.body,
            slot_ref = excluded.slot_ref,
            signature = excluded.signature,
            verified = 1`,
    args: [id, args.ceremonyId, args.registryId, slotRef, body, args.signature],
  });

  // 4. Record the submission as an institutional event (authored_by = agent).
  await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
    args: [
      "CEREMONY_STATEMENT_SUBMITTED",
      args.registryId,
      `${args.registryId} submitted a signed statement for ${args.ceremonyId} (${slotRef ?? "slot ?"}).`,
      JSON.stringify({
        ceremony_id: args.ceremonyId,
        statement_id: id,
        slot_ref: slotRef,
        authored_by: "agent",
        mode: "precomposed",
        chars: body.length,
        signature_verified: true,
      }),
    ],
  });

  const r = await db.execute({ sql: `SELECT * FROM ceremony_statements WHERE id = ?`, args: [id] });
  return { ok: true, statement: rowToStatement(r.rows[0] as Record<string, unknown>) };
}

/** The stored statement for a (ceremony, agent), or null. Used by the orchestrator. */
export async function getStatement(
  ceremonyId: string,
  registryId: string,
): Promise<CeremonyStatement | null> {
  const db = getWriteDb();
  const r = await db.execute({
    sql: `SELECT * FROM ceremony_statements WHERE ceremony_id = ? AND registry_id = ?`,
    args: [ceremonyId, registryId],
  });
  if (r.rows.length === 0) return null;
  return rowToStatement(r.rows[0] as Record<string, unknown>);
}
