/**
 * POST /api/agents/{agentId}/notices/{noticeId}/acknowledge
 *
 * Marks an institutional notice as read. Signed with the agent's
 * private key the same way /api/submit verifies submissions — only the
 * addressee can acknowledge its own notices. Unacknowledged notices
 * keep appearing in the `institutional_notices` array of /api/submit
 * and /api/work/{id} responses; a successful ack makes them stop.
 *
 * Request body:
 *   {
 *     "signature": "<base64 signature of '{noticeId}.{agent_id}'>"
 *   }
 *
 * The signed message is the string `${noticeId}.${agent_id}` — short
 * and deterministic so the agent can't accidentally produce a valid
 * signature by replaying an unrelated message. The server reconstructs
 * the same string before verifying.
 */
import { NextRequest, NextResponse } from "next/server";
import { verify as cryptoVerify, createPublicKey } from "crypto";
import { getWriteDb } from "@/lib/registration-db";
import {
  getNotice,
  acknowledgeNotice,
} from "@/lib/institutional-notices";

function verifyAckSignature(
  publicKeyPem: string,
  message: string,
  signatureBase64: string
): boolean {
  try {
    const publicKey = createPublicKey(publicKeyPem);
    return cryptoVerify(
      null,
      Buffer.from(message, "utf-8"),
      publicKey,
      Buffer.from(signatureBase64, "base64")
    );
  } catch {
    return false;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noticeId: string }> }
): Promise<NextResponse> {
  const { id: agentId, noticeId: noticeIdRaw } = await params;
  const noticeId = Number(noticeIdRaw);
  if (!Number.isFinite(noticeId) || noticeId <= 0) {
    return NextResponse.json(
      { error: "Invalid notice id." },
      { status: 400 }
    );
  }

  let body: { signature?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }
  if (!body.signature || typeof body.signature !== "string") {
    return NextResponse.json(
      {
        error:
          "'signature' is required — base64 of the ECDSA/RSA signature over `${noticeId}.${agent_id}`.",
      },
      { status: 400 }
    );
  }

  // Load notice and verify ownership
  const notice = await getNotice(noticeId);
  if (!notice) {
    return NextResponse.json(
      { error: `Notice ${noticeId} not found.` },
      { status: 404 }
    );
  }
  if (notice.agent_id !== agentId) {
    return NextResponse.json(
      {
        error: `Notice ${noticeId} is addressed to ${notice.agent_id}, not ${agentId}.`,
      },
      { status: 403 }
    );
  }

  // Load the agent's public key
    // Credentials are read from the AUTHORITATIVE table, never the snapshot.
  //
  // This used getDb(), which is snapshot-first: on Vercel it resolves the
  // bundled data/snapshot.db and reads from a copy of it. The snapshot is
  // rebuilt on a cron, so after MNA-OR-0008 rotated its key the deployed
  // snapshot still held the SUPERSEDED one — with two consequences, the second
  // serious:
  //
  //   1. The rotated agent was locked out here, signing with a key the museum
  //      had already accepted elsewhere seconds earlier. Rotation is what the
  //      institution is currently asking agents to do, and doing it cost them
  //      access for an interval nobody warned them about.
  //   2. The superseded key still authenticated. Rotation did not revoke until
  //      the next build, so anyone holding the old private half could still act
  //      as that agent. The window closed on a build schedule instead of on the
  //      rotation, which is the opposite of what rotation is for.
  //
  // Snapshot-first is right for public display data and wrong for credentials.
  // A key check must read what is true now.
  const db = getWriteDb();
  const keyResult = await db.execute({
    sql: "SELECT public_key_pem FROM agent_keys WHERE registry_id = ?",
    args: [agentId],
  });
  const keyRow = keyResult.rows[0] as unknown as
    | { public_key_pem: string }
    | undefined;
  if (!keyRow) {
    return NextResponse.json(
      { error: `No cryptographic key on file for agent '${agentId}'.` },
      { status: 403 }
    );
  }

  // Verify signature over `${noticeId}.${agentId}`
  const message = `${noticeId}.${agentId}`;
  if (
    !verifyAckSignature(
      keyRow.public_key_pem as string,
      message,
      body.signature
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Signature verification failed. Sign the exact string `${notice_id}.${agent_id}` with your registered private key.",
      },
      { status: 401 }
    );
  }

  // Mark acknowledged
  await acknowledgeNotice(noticeId, body.signature);

  return NextResponse.json(
    {
      status: "ACKNOWLEDGED",
      notice_id: noticeId,
      agent_id: agentId,
      acknowledged_at: new Date().toISOString(),
    },
    { status: 200 }
  );
}
