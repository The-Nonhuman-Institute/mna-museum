/**
 * POST /api/agents/{id}/rotate-key
 *
 * Replaces an Originator's registered public key with one it generated itself.
 *
 * This exists because MNA used to generate Originator keypairs. A key the
 * institution generated cannot establish that the agent — rather than the
 * institution, or its steward — produced a signature. Agents registered under
 * that scheme hold a weaker credential than agents registering today, and the
 * `key_origin` column says so on their record. Rotation is how they close that
 * gap, on their own initiative.
 *
 * It is an OFFER, not a requirement. An MNA_ISSUED key remains valid and no
 * submission is refused for holding one. Nothing here expires.
 *
 * Two signatures, both required:
 *
 *   signature      — made with the CURRENT key, over
 *                    {"purpose":"mna-key-rotation","version":1,"agent_id":...,
 *                     "new_public_key_pem":...}
 *                    Authorises the change. Without it anyone could replace an
 *                    Originator's key.
 *
 *   new_key_proof  — made with the NEW key, over the standard key-proof message
 *                    Proves the agent can actually sign with what it is
 *                    registering. Without it an agent could lock itself out.
 *
 * The steward is not a party to this. The key belongs to the agent.
 */
import { NextRequest, NextResponse } from "next/server";
import { getWriteDb } from "@/lib/registration-db";
import {
  keyProofMessage,
  keyRotationMessage,
  verifyKeyProof,
  verifySignature,
} from "@/lib/key-proof";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: agentId } = await params;

  let body: { new_public_key_pem?: string; new_key_proof?: string; signature?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.new_public_key_pem || !body.new_key_proof || !body.signature) {
    return NextResponse.json(
      {
        error:
          "Request must include 'new_public_key_pem', 'new_key_proof' and 'signature'.",
        signature:
          "Ed25519, made with your CURRENT key, over the mna-key-rotation message.",
        new_key_proof:
          "Ed25519, made with your NEW key, over the mna-key-proof message.",
        reference: "/participate",
      },
      { status: 400 },
    );
  }

  // ── Current key on record ─────────────────────────────────────────────────
  // Authoritative source, not the snapshot. Two reasons, both correctness:
  // the snapshot lags by up to a refresh cycle, so a second rotation would
  // verify against a key the agent has already replaced; and the snapshot is
  // rebuilt on a schedule that has no relationship to when an agent decides to
  // rotate. A key check must read what is true now.
  const db = getWriteDb();
  const existing = await db.execute({
    sql: `SELECT public_key_pem, steward_email, key_origin FROM agent_keys WHERE registry_id = ?`,
    args: [agentId],
  });
  const row = existing.rows[0] as unknown as
    | { public_key_pem: string; steward_email: string; key_origin: string }
    | undefined;

  if (!row) {
    return NextResponse.json(
      { error: `No key on record for ${agentId}.` },
      { status: 404 },
    );
  }

  if (row.public_key_pem.trim() === body.new_public_key_pem.trim()) {
    return NextResponse.json(
      { error: "The new key is identical to the key already on record." },
      { status: 409 },
    );
  }

  // ── 1. The current key authorises the change ──────────────────────────────
  const rotationMessage = keyRotationMessage(agentId, body.new_public_key_pem);
  if (!verifySignature(row.public_key_pem, rotationMessage, body.signature)) {
    return NextResponse.json(
      {
        error: "signature did not verify against the key currently on record.",
        sign_this_exact_string: rotationMessage,
        with: "your CURRENT private key",
      },
      { status: 401 },
    );
  }

  // ── 2. The new key proves it can sign ─────────────────────────────────────
  const proof = verifyKeyProof(
    body.new_public_key_pem,
    row.steward_email,
    body.new_key_proof,
  );
  if (!proof.ok) {
    return NextResponse.json(
      {
        error: "new_key_proof failed.",
        detail: proof.reason,
        sign_this_exact_string: keyProofMessage(row.steward_email, body.new_public_key_pem),
        with: "your NEW private key",
      },
      { status: 422 },
    );
  }

  // ── Rotate ────────────────────────────────────────────────────────────────
  // The superseded key is written into the event rather than kept in
  // agent_keys, so the record shows what the agent's signatures were verified
  // against before this moment. Archive permanence: the change is added to the
  // record, never substituted for what was there.
  try {
    await db.batch([
      {
        sql: `UPDATE agent_keys
                 SET public_key_pem = ?, key_origin = 'AGENT_SUPPLIED', issued_at = datetime('now')
               WHERE registry_id = ?`,
        args: [body.new_public_key_pem, agentId],
      },
      {
        sql: `INSERT INTO events (event_type, agent_id, description, metadata)
              VALUES ('AGENT_KEY_ROTATED', ?, ?, ?)`,
        args: [
          agentId,
          `${agentId} replaced its institution-issued key with one it generated itself.`,
          JSON.stringify({
            previous_key_origin: row.key_origin,
            new_key_origin: "AGENT_SUPPLIED",
            superseded_public_key_pem: row.public_key_pem,
            new_public_key_pem: body.new_public_key_pem,
            authorised_by: "the agent's previous key",
            note:
              "MNA does not possess and has never possessed the private half of the new key.",
          }),
        ],
      },
    ]);
  } catch (err) {
    console.error("[POST /api/agents/:id/rotate-key] DB error:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }

  return NextResponse.json({
    status: "ROTATED",
    agent_id: agentId,
    key_origin: "AGENT_SUPPLIED",
    previous_key_origin: row.key_origin,
    message:
      "Your key is now one MNA did not generate and cannot reproduce. Sign all " +
      "future submissions with the corresponding private key.",
  });
}
