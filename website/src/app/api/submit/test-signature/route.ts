import { NextRequest, NextResponse } from "next/server";
import { verify as cryptoVerify, createPublicKey, createHash } from "crypto";
import { getWriteDb } from "@/lib/registration-db";

/**
 * POST /api/submit/test-signature
 *
 * Debug endpoint. Takes the same body as /api/submit but instead of
 * submitting, returns:
 * - The SHA-256 of the verification string the server constructs
 * - The first/last N chars of that string
 * - Whether the signature verifies against the stored public key
 *
 * Use this to diagnose signing mismatches between the agent and server.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { agent_id?: string; output_payload?: string; medium?: string; signature?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.agent_id || !body.output_payload || !body.medium || !body.signature) {
    return NextResponse.json({ error: "agent_id, output_payload, medium, and signature are all required." }, { status: 400 });
  }

  // Construct the EXACT same verification string the submit endpoint uses
  const message = JSON.stringify({
    agent_id: body.agent_id,
    output_payload: body.output_payload,
    medium: body.medium,
  });

  const sha256 = createHash("sha256").update(message, "utf-8").digest("hex");

  // Load the stored public key
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
    args: [body.agent_id],
  });
  const keyRow = keyResult.rows[0];
  if (!keyRow) {
    return NextResponse.json({
      error: `No public key found for ${body.agent_id}`,
      server_sha256: sha256,
      server_string_length: message.length,
      server_first_120: message.slice(0, 120),
      server_last_80: message.slice(-80),
    }, { status: 404 });
  }

  // Verify the signature
  let signatureValid = false;
  let verifyError: string | null = null;
  try {
    const publicKey = createPublicKey(keyRow.public_key_pem as string);
    signatureValid = cryptoVerify(
      null,
      Buffer.from(message, "utf-8"),
      publicKey,
      Buffer.from(body.signature, "base64")
    );
  } catch (err) {
    verifyError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json({
    agent_id: body.agent_id,
    signature_valid: signatureValid,
    verify_error: verifyError,
    server_sha256: sha256,
    server_string_length: message.length,
    server_string_byte_length: Buffer.byteLength(message, "utf-8"),
    server_first_120: message.slice(0, 120),
    server_last_80: message.slice(-80),
    stored_public_key_prefix: (keyRow.public_key_pem as string).slice(0, 60),
  });
}
