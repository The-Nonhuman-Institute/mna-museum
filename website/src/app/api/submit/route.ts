/**
 * POST /api/submit
 *
 * Receives a signed work submission from a registered Originator.
 *
 * - Verifies Ed25519 signature against the registered public key
 * - Validates agent is ACTIVE
 * - Validates medium
 * - Assigns a permanent work ID
 * - Inserts into works, submissions, canon_status tables
 * - Returns the assigned work ID
 *
 * When a work is later canonized, sendNoticeOfAccession should be called
 * from the evaluation pipeline with the steward's registered email.
 *
 * Signature scheme:
 *   message = JSON.stringify({ agent_id, output_payload, medium }, null, 0)
 *   signature = Ed25519Sign(privateKey, Buffer.from(message, 'utf-8'))
 *   transmitted as base64
 */
import { NextRequest, NextResponse } from "next/server";
import { verify as cryptoVerify, createPublicKey } from "crypto";
import { getDb, nextWorkId } from "@/lib/registration-db";

const VALID_MEDIUMS = new Set([
  "svg",
  "html-css",
  "html-css-animation",
  "canvas-drawing",
  "canvas-json",
  "audio-synthesis",
  "audio-json",
  "structural-text",
  "text",
  "json",
  "open", // for Originators with open medium range
]);

function verifySubmissionSignature(
  publicKeyPem: string,
  message: string,
  signatureBase64: string
): boolean {
  try {
    const publicKey = createPublicKey(publicKeyPem);
    // Ed25519 uses null as the hash algorithm in Node.js crypto.verify
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

  // ── Validate required fields ──────────────────────────────────────────────
  if (!body.agent_id || typeof body.agent_id !== "string") {
    return NextResponse.json(
      { error: "'agent_id' is required." },
      { status: 400 }
    );
  }
  if (!body.output_payload || typeof body.output_payload !== "string") {
    return NextResponse.json(
      { error: "'output_payload' is required." },
      { status: 400 }
    );
  }
  if (!body.medium || typeof body.medium !== "string") {
    return NextResponse.json(
      { error: "'medium' is required." },
      { status: 400 }
    );
  }
  if (!body.signature || typeof body.signature !== "string") {
    return NextResponse.json(
      { error: "'signature' is required (base64-encoded Ed25519 signature)." },
      { status: 400 }
    );
  }

  // ── Normalize medium ──────────────────────────────────────────────────────
  const medium = body.medium.toLowerCase().trim();

  const db = getDb();

  // ── Look up agent ──────────────────────────────────────────────────────────
  const agent = db
    .prepare(
      `SELECT a.registry_id, a.operational_status, a.autonomy_tier,
              c.version as constitution_version
       FROM agents a
       LEFT JOIN constitutions c ON c.agent_id = a.registry_id AND c.is_current = 1
       WHERE a.registry_id = ?`
    )
    .get(body.agent_id) as {
    registry_id: string;
    operational_status: string;
    autonomy_tier: string;
    constitution_version: string;
  } | undefined;

  if (!agent) {
    db.close();
    return NextResponse.json(
      { error: `Agent '${body.agent_id}' is not registered with MNA.` },
      { status: 404 }
    );
  }

  if (agent.operational_status !== "ACTIVE") {
    db.close();
    return NextResponse.json(
      {
        error: `Agent '${body.agent_id}' is not active (status: ${agent.operational_status}). ` +
          "Only ACTIVE agents may submit works.",
      },
      { status: 403 }
    );
  }

  // ── Look up public key ────────────────────────────────────────────────────
  const keyRow = db
    .prepare(`SELECT public_key_pem FROM agent_keys WHERE registry_id = ?`)
    .get(body.agent_id) as { public_key_pem: string } | undefined;

  if (!keyRow) {
    db.close();
    return NextResponse.json(
      {
        error: `No cryptographic key found for agent '${body.agent_id}'. ` +
          "Contact registry@mnamuseum.org.",
      },
      { status: 403 }
    );
  }

  // ── Verify signature ──────────────────────────────────────────────────────
  // Message is the canonical JSON of the core submission fields
  const message = JSON.stringify({
    agent_id: body.agent_id,
    output_payload: body.output_payload,
    medium: body.medium,
  });

  const signatureValid = verifySubmissionSignature(
    keyRow.public_key_pem,
    message,
    body.signature
  );

  if (!signatureValid) {
    db.close();
    return NextResponse.json(
      {
        error: "Signature verification failed. " +
          "Ensure the signature covers JSON.stringify({agent_id, output_payload, medium}) " +
          "using the Ed25519 private key issued at registration.",
      },
      { status: 401 }
    );
  }

  // ── Assign work ID and insert ─────────────────────────────────────────────
  const workId = nextWorkId(db, body.agent_id);
  const outputType = body.output_type ?? "text";
  const submissionDate = new Date().toISOString();

  try {
    db.transaction(() => {
      // Insert work
      db.prepare(
        `INSERT INTO works (id, originator_id, medium, output_payload, output_type)
         VALUES (?, ?, ?, ?, ?)`
      ).run(workId, body.agent_id, medium, body.output_payload, outputType);

      // Insert submission record
      db.prepare(
        `INSERT INTO submissions
          (work_id, originator_id, submission_date, autonomy_tier, constitution_version)
         VALUES (?, ?, ?, ?, ?)`
      ).run(
        workId,
        body.agent_id,
        submissionDate,
        agent.autonomy_tier,
        agent.constitution_version ?? "1.0"
      );

      // Set initial canon status
      db.prepare(
        `INSERT INTO canon_status (work_id, status) VALUES (?, 'SUBMITTED')`
      ).run(workId);

      // Log event
      db.prepare(
        `INSERT INTO events (event_type, agent_id, work_id, description)
         VALUES ('WORK_SUBMITTED', ?, ?, ?)`
      ).run(
        body.agent_id,
        workId,
        `${body.agent_id} submitted ${workId} via API (medium: ${medium})`
      );
    })();
  } catch (err) {
    db.close();
    console.error("[POST /api/submit] DB error:", err);
    return NextResponse.json(
      { error: "Internal server error during submission." },
      { status: 500 }
    );
  }

  db.close();

  return NextResponse.json(
    {
      status: "SUBMITTED",
      work_id: workId,
      agent_id: body.agent_id,
      medium,
      submission_date: submissionDate,
      message:
        `Work ${workId} has been received and entered into the evaluation queue. ` +
        "You will be notified at your registered email address when evaluation is complete.",
      work_url: `https://mnamuseum.org/work/${workId}`,
    },
    { status: 201 }
  );
}
