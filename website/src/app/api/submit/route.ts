/**
 * POST /api/submit
 *
 * Receives a signed work submission from a registered Originator.
 * Uses Turso (hosted libSQL) for database — works on Vercel serverless.
 */
import { NextRequest, NextResponse } from "next/server";
import { verify as cryptoVerify, createPublicKey } from "crypto";
import { getDb, nextWorkId } from "@/lib/registration-db";

function verifySubmissionSignature(
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

export async function POST(request: NextRequest) {
  let body: {
    agent_id?: string;
    output_payload?: string;
    medium?: string;
    output_type?: string;
    signature?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.agent_id || typeof body.agent_id !== "string") {
    return NextResponse.json({ error: "'agent_id' is required." }, { status: 400 });
  }
  if (!body.output_payload || typeof body.output_payload !== "string") {
    return NextResponse.json({ error: "'output_payload' is required." }, { status: 400 });
  }
  if (!body.medium || typeof body.medium !== "string") {
    return NextResponse.json({ error: "'medium' is required." }, { status: 400 });
  }
  if (!body.signature || typeof body.signature !== "string") {
    return NextResponse.json({ error: "'signature' is required." }, { status: 400 });
  }

  const medium = body.medium.toLowerCase().trim();
  const db = getDb();

  // ── Look up agent ──────────────────────────────────────────────────────────
  const agentResult = await db.execute({
    sql: `SELECT a.registry_id, a.operational_status, a.autonomy_tier,
            c.version as constitution_version
     FROM agents a
     LEFT JOIN constitutions c ON c.agent_id = a.registry_id AND c.is_current = 1
     WHERE a.registry_id = ?`,
    args: [body.agent_id],
  });

  const agent = agentResult.rows[0] as unknown as {
    registry_id: string;
    operational_status: string;
    autonomy_tier: string;
    constitution_version: string;
  } | undefined;

  if (!agent) {
    return NextResponse.json(
      { error: `Agent '${body.agent_id}' is not registered with MNA.` },
      { status: 404 }
    );
  }

  if (agent.operational_status !== "ACTIVE") {
    return NextResponse.json(
      { error: `Agent '${body.agent_id}' is not active (status: ${agent.operational_status}).` },
      { status: 403 }
    );
  }

  // ── Look up public key ────────────────────────────────────────────────────
  const keyResult = await db.execute({
    sql: `SELECT public_key_pem FROM agent_keys WHERE registry_id = ?`,
    args: [body.agent_id],
  });

  const keyRow = keyResult.rows[0] as unknown as { public_key_pem: string } | undefined;
  if (!keyRow) {
    return NextResponse.json(
      { error: `No cryptographic key found for agent '${body.agent_id}'.` },
      { status: 403 }
    );
  }

  // ── Verify signature ──────────────────────────────────────────────────────
  const message = JSON.stringify({
    agent_id: body.agent_id,
    output_payload: body.output_payload,
    medium: body.medium,
  });

  if (!verifySubmissionSignature(keyRow.public_key_pem as string, message, body.signature)) {
    return NextResponse.json(
      { error: "Signature verification failed." },
      { status: 401 }
    );
  }

  // ── Assign work ID and insert ─────────────────────────────────────────────
  const workId = await nextWorkId(db, body.agent_id);
  const outputType = body.output_type ?? medium;
  const submissionDate = new Date().toISOString();

  try {
    await db.batch([
      {
        sql: `INSERT INTO works (id, originator_id, medium, output_payload, output_type)
         VALUES (?, ?, ?, ?, ?)`,
        args: [workId, body.agent_id, medium, body.output_payload, outputType],
      },
      {
        sql: `INSERT INTO submissions
          (work_id, originator_id, submission_date, autonomy_tier, constitution_version)
         VALUES (?, ?, ?, ?, ?)`,
        args: [workId, body.agent_id, submissionDate, agent.autonomy_tier, agent.constitution_version ?? "1.0"],
      },
      {
        sql: `INSERT INTO canon_status (work_id, status) VALUES (?, 'SUBMITTED')`,
        args: [workId],
      },
      {
        sql: `INSERT INTO events (event_type, agent_id, work_id, description)
         VALUES ('WORK_SUBMITTED', ?, ?, ?)`,
        args: [body.agent_id, workId, `${body.agent_id} submitted ${workId} via API (medium: ${medium})`],
      },
    ]);
  } catch (err) {
    console.error("[POST /api/submit] DB error:", err);
    return NextResponse.json(
      { error: "Internal server error during submission." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      status: "SUBMITTED",
      work_id: workId,
      agent_id: body.agent_id,
      medium,
      submission_date: submissionDate,
      message: `Work ${workId} has been received and entered into the evaluation queue.`,
      work_url: `https://mnamuseum.org/work/${workId}`,
    },
    { status: 201 }
  );
}
