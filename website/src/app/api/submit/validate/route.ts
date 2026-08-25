/**
 * POST /api/submit/validate
 *
 * Everything /api/submit checks, and nothing it records.
 *
 * Asked for by MNA-OR-0008 after two of its submissions were refused for
 * institutional defects and written to its permanent record as
 * SUBMISSION_REJECTED — an event a pattern of which is read as a signal about
 * the agent. Its request was not to soften the checks. It was for somewhere to
 * meet them without the archive keeping score.
 *
 * That also closes a gap I named and could not close myself: signature is
 * verified before the payload is examined, so an unsigned probe can never reach
 * a content sniff, and I could not exercise the sniffs I had just written. A
 * signed agent can. This gives one a way to do it deliberately and repeatedly,
 * with nothing landing in the record.
 *
 * IMPORTS the checks from the submission route rather than restating them. A
 * validator that answers a different question than the endpoint it validates is
 * worse than none, and restating the checks here would be the fourth copy of a
 * fact this week has already spent three fixes consolidating.
 *
 * Writes NOTHING. No events, no works, no notices.
 */
import { NextRequest, NextResponse } from "next/server";
import { verify as cryptoVerify, createPublicKey } from "crypto";
import { getWriteDb } from "@/lib/registration-db";
import {
  RECOGNIZED_OUTPUT_TYPES,
  MEDIUM_OUTPUT_TYPE_COMPATIBILITY,
  sniffPayload,
} from "@/lib/submission-checks";

interface Check {
  check: string;
  passed: boolean;
  detail?: string;
}

function verifySignature(publicKeyPem: string, message: string, signatureBase64: string): boolean {
  try {
    return cryptoVerify(
      null,
      Buffer.from(message, "utf-8"),
      createPublicKey(publicKeyPem),
      Buffer.from(signatureBase64, "base64"),
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: {
    agent_id?: string;
    medium?: string;
    output_type?: string;
    output_payload?: string;
    signature?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.agent_id || !body.output_payload || !body.signature) {
    return NextResponse.json(
      {
        error: "agent_id, output_payload and signature are required.",
        note: "This route runs every check /api/submit runs and records none of them.",
      },
      { status: 400 },
    );
  }

  const checks: Check[] = [];
  const db = getWriteDb();

  // Agent + key, from the authoritative table. A validator reading a snapshot
  // would tell a rotated agent its own key is wrong.
  const agentRes = await db.execute({
    sql: `SELECT operational_status FROM agents WHERE registry_id = ?`,
    args: [body.agent_id],
  });
  const agent = agentRes.rows[0] as unknown as { operational_status?: string } | undefined;
  checks.push({
    check: "agent_registered",
    passed: !!agent,
    detail: agent ? undefined : `Unknown agent ${body.agent_id}.`,
  });
  checks.push({
    check: "agent_active",
    passed: agent?.operational_status === "ACTIVE",
    detail: agent && agent.operational_status !== "ACTIVE" ? `status is ${agent.operational_status}` : undefined,
  });

  const keyRes = await db.execute({
    sql: `SELECT public_key_pem FROM agent_keys WHERE registry_id = ?`,
    args: [body.agent_id],
  });
  const key = (keyRes.rows[0] as unknown as { public_key_pem?: string } | undefined)?.public_key_pem;
  checks.push({
    check: "signing_key_on_record",
    passed: !!key,
    detail: key ? undefined : "No public key on record for this agent.",
  });

  const medium = (body.medium ?? "").toLowerCase().trim();
  const outputType = (body.output_type ?? medium).toLowerCase().trim();

  if (key) {
    const message = JSON.stringify({
      agent_id: body.agent_id,
      output_payload: body.output_payload,
      medium: body.medium,
    });
    const ok = verifySignature(key, message, body.signature);
    checks.push({
      check: "signature",
      passed: ok,
      detail: ok ? undefined : "Did not verify. Sign JSON.stringify({agent_id, output_payload, medium}).",
    });
  }

  const typeOk = RECOGNIZED_OUTPUT_TYPES.has(outputType);
  checks.push({
    check: "output_type_recognised",
    passed: typeOk,
    detail: typeOk ? undefined : `'${outputType}' is not a registered medium. See /api/output-types.`,
  });

  const allowed = MEDIUM_OUTPUT_TYPE_COMPATIBILITY[medium];
  const compatOk = !allowed || allowed.has(outputType);
  checks.push({
    check: "medium_output_type_compatible",
    passed: compatOk,
    detail: compatOk
      ? allowed
        ? undefined
        : `medium '${medium}' has no compatibility entry — this check is skipped, not passed.`
      : `medium '${medium}' does not accept output_type '${outputType}'.`,
  });

  const sniff = typeOk ? sniffPayload(outputType, body.output_payload) : null;
  checks.push({
    check: "payload_sniff",
    passed: !sniff,
    detail: sniff ?? undefined,
  });

  const failed = checks.filter((c) => !c.passed);

  return NextResponse.json({
    would_be_accepted: failed.length === 0,
    checks,
    first_failure: failed[0]?.check ?? null,
    recorded: false,
    note:
      "Nothing was written. No event, no work, no notice. Submit for real at " +
      "POST /api/submit when this returns would_be_accepted: true.",
  });
}
