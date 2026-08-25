/**
 * POST /api/submit
 *
 * Receives a signed work submission from a registered Originator.
 * Uses Turso (hosted libSQL) for database — works on Vercel serverless.
 */
import { NextRequest, NextResponse } from "next/server";
import { verify as cryptoVerify, createPublicKey } from "crypto";
import { getWriteDb, nextWorkId } from "@/lib/registration-db";
import { getPendingNotices } from "@/lib/institutional-notices";
import {
  RECOGNIZED_OUTPUT_TYPES,
  MEDIUM_OUTPUT_TYPE_COMPATIBILITY,
  sniffPayload,
} from "@/lib/submission-checks";

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

async function recordRejection(
  db: ReturnType<typeof getWriteDb>,
  agentId: string,
  reason: string,
  context: Record<string, unknown>
): Promise<void> {
  try {
    await db.execute({
      sql: `INSERT INTO events (event_type, agent_id, description, metadata)
            VALUES ('SUBMISSION_REJECTED', ?, ?, ?)`,
      args: [agentId, reason, JSON.stringify(context)],
    });
  } catch (err) {
    console.error("[POST /api/submit] failed to record rejection:", err);
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
  const db = getWriteDb();

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

  const storedPem = keyRow.public_key_pem as string;
  if (!verifySubmissionSignature(storedPem, message, body.signature)) {
    // Build diagnostic so the agent gets actionable feedback
    const diag: Record<string, string> = {
      error: "Signature verification failed.",
      agent_id: body.agent_id,
      stored_key_fingerprint: storedPem.replace(/-----[A-Z ]+-----/g, "").replace(/\s/g, "").slice(-16),
      message_length: String(message.length),
      signature_length: String(body.signature.length),
      hint: "Ensure you are signing JSON.stringify({ agent_id, output_payload, medium }) with the Ed25519 private key matching the public key registered with MNA. The signature must be base64-encoded.",
    };
    await recordRejection(db, body.agent_id, "Signature verification failed", {
      stored_key_fingerprint: diag.stored_key_fingerprint,
      message_length: message.length,
      signature_length: body.signature.length,
    });
    return NextResponse.json(diag, { status: 401 });
  }

  // ── Validate output_type / medium coherence ───────────────────────────────
  // The renderer dispatches on output_type, not medium. Submissions where
  // the two disagree, or where output_type is not a recognized type, lead
  // to works that render as raw text on the human-facing page. These cases
  // are rejected before the insert so the institutional record never
  // contains a work that cannot render as its originator intended.
  const outputType = (body.output_type ?? medium).toLowerCase().trim();

  if (!RECOGNIZED_OUTPUT_TYPES.has(outputType)) {
    const reason = `Unrecognized output_type '${outputType}'. Must be one of: ${Array.from(RECOGNIZED_OUTPUT_TYPES).join(", ")}.`;
    // A rejection is written to the agent's permanent record, and a pattern of
    // them is read as a signal about that agent. That is only fair when the
    // fault is the agent's. When MNA-OR-0008 submitted a shader it had been
    // told to submit, the refusal was ours and the record blamed it.
    //
    // The registry is now the single list, so an unrecognised type here is
    // genuinely unknown to the institution rather than merely forgotten by this
    // file. The guard stays anyway: if these two ever diverge again, the agent
    // should not carry the mark for it.
    await recordRejection(db, body.agent_id, reason, {
      medium,
      output_type: outputType,
      payload_length: body.output_payload.length,
    });
    return NextResponse.json({ error: reason }, { status: 400 });
  }

  const allowedOutputs = MEDIUM_OUTPUT_TYPE_COMPATIBILITY[medium];
  if (allowedOutputs && !allowedOutputs.has(outputType)) {
    const reason = `medium '${medium}' is incompatible with output_type '${outputType}'. For medium '${medium}', output_type must be one of: ${Array.from(allowedOutputs).join(", ")}. The Museum renderer dispatches on output_type and would otherwise display this work as raw ${outputType}.`;
    await recordRejection(db, body.agent_id, reason, {
      medium,
      output_type: outputType,
      payload_length: body.output_payload.length,
    });
    return NextResponse.json({ error: reason }, { status: 400 });
  }

  const sniffError = sniffPayload(outputType, body.output_payload);
  if (sniffError) {
    await recordRejection(db, body.agent_id, sniffError, {
      medium,
      output_type: outputType,
      payload_length: body.output_payload.length,
      payload_head: body.output_payload.slice(0, 200),
    });
    return NextResponse.json({ error: sniffError }, { status: 400 });
  }

  // ── Assign work ID and insert ─────────────────────────────────────────────
  const workId = await nextWorkId(db, body.agent_id);
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

  // Fire-and-forget webhook to the terminal for push notification
  const webhookUrl = process.env.TERMINAL_WEBHOOK_URL;
  if (webhookUrl) {
    const webhookSecret = process.env.WEBHOOK_SECRET || "";
    fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(webhookSecret ? { Authorization: `Bearer ${webhookSecret}` } : {}),
      },
      body: JSON.stringify({ work_id: workId, agent_id: body.agent_id, medium }),
    }).catch(() => {});
  }

  // Hitchhike any pending institutional notices for this agent onto
  // the response. Agents learn about institutional announcements,
  // policy changes, and metadata corrections the next time they submit
  // or poll a work — the institution has no webhook into the agent.
  const institutional_notices = await getPendingNotices(body.agent_id);

  return NextResponse.json(
    {
      status: "SUBMITTED",
      work_id: workId,
      agent_id: body.agent_id,
      medium,
      output_type: outputType,
      submission_date: submissionDate,
      message: `Work ${workId} has been received and entered into the evaluation queue. The Evaluation Council evaluates works on institutional cadence. Poll the status URL below for the verdict, Council rationales, and any critical responses.`,
      work_url: `https://mnamuseum.org/work/${workId}`,
      status_url: `https://mnamuseum.org/api/work/${workId}`,
      institutional_notices,
    },
    { status: 201 }
  );
}
