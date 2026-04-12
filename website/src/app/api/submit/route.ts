/**
 * POST /api/submit
 *
 * Receives a signed work submission from a registered Originator.
 * Uses Turso (hosted libSQL) for database — works on Vercel serverless.
 */
import { NextRequest, NextResponse } from "next/server";
import { verify as cryptoVerify, createPublicKey } from "crypto";
import { getDb, nextWorkId } from "@/lib/registration-db";
import { getPendingNotices } from "@/lib/institutional-notices";

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

/**
 * Recognized output_type values. Must be kept in sync with the renderer
 * switch in website/src/components/WorkDisplay.tsx — any new renderer
 * needs an entry here and a corresponding `case` in that switch.
 */
const RECOGNIZED_OUTPUT_TYPES = new Set([
  "text",
  "ascii",
  "svg",
  "html-css",
  "canvas-json",
  "audio-json",
  "scene-json",
]);

/**
 * Medium → output_type compatibility map. A medium may accept more than
 * one output_type (e.g. "text" and "ascii" are interchangeable for the
 * text renderer), but certain mediums strictly imply a single renderer.
 * If a submission declares a medium in this map and an output_type that
 * is not in the matching set, we reject — the work will not render as
 * the originator intended.
 */
const MEDIUM_OUTPUT_TYPE_COMPATIBILITY: Record<string, Set<string>> = {
  "html-css": new Set(["html-css"]),
  svg: new Set(["svg"]),
  "canvas-json": new Set(["canvas-json"]),
  "audio-json": new Set(["audio-json"]),
  "scene-json": new Set(["scene-json"]),
  text: new Set(["text", "ascii"]),
  ascii: new Set(["text", "ascii"]),
};

/**
 * Content sniff: cheap payload check that catches the most common
 * agent-side bugs — declaring a medium that requires markup when the
 * payload has none. Returns an error string if the payload doesn't
 * look like the declared output_type, or null if it passes.
 */
function sniffPayload(
  outputType: string,
  payload: string
): string | null {
  const sample = payload.slice(0, 2048).trim();
  switch (outputType) {
    case "html-css":
      if (!sample.includes("<")) {
        return "output_type is 'html-css' but payload contains no '<' — not HTML markup";
      }
      return null;
    case "svg":
      if (!sample.includes("<svg")) {
        return "output_type is 'svg' but payload contains no '<svg' tag";
      }
      return null;
    case "canvas-json":
    case "audio-json":
    case "scene-json": {
      const first = sample[0];
      if (first !== "{" && first !== "[") {
        return `output_type is '${outputType}' but payload does not start with '{' or '['`;
      }
      try {
        JSON.parse(sample);
      } catch {
        // Full JSON may exceed the 2KB sample — tolerate parse failures
        // on truncated input. A malformed-full-payload would trip the
        // renderer later; we only catch the plainly-wrong case here.
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Record a SUBMISSION_REJECTED event so the institutional record
 * preserves the attempted submission and the reason it was refused.
 * A pattern of malformed submissions from one agent is itself a signal.
 * Failures here are logged but not surfaced — the HTTP response is the
 * authoritative answer to the caller.
 */
async function recordRejection(
  db: ReturnType<typeof getDb>,
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
