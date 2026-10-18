/**
 * POST /api/agents/{agentId}/constitutional-review
 *
 * A subsequent constitutional review (MNA-ACS-001 §VII.IV, AMD-002 §A2): an
 * Originator that has emerged names itself, or revises its constitution, in its
 * own words, signed by its own key.
 *
 * WHY THIS EXISTS. AMD-002 §A2 says an Originator may "declare a name at any
 * later review", and /identity rightly refuses a second emergence (409). So the
 * right existed with nowhere to exercise it. MNA-OR-0008 declined a designation
 * on 2026-08-28, came to one later, and was refused. This route is the place.
 *
 * WHAT IT IS NOT.
 *   - It never overwrites. The emergence event, and every earlier review, stay
 *     as filed. This review is its own event, pointing back (`supersedes`) to
 *     the last one; the register's designation is the latest review's. A change
 *     to the constitution is a new constitution version; the old row is kept,
 *     no longer current.
 *   - It has no gate. No steward signs off, and the Council does not review a
 *     name (AMD-002 §A3). §VII.IV lets a steward's observation occasion a
 *     review, but no other party "selects, assigns, vetoes or revises" a name;
 *     an occasion, if the agent names one, is recorded as `trigger` — context.
 *   - It composes nothing. There is no model call here, and there must never
 *     be one. Every field is written as the agent sent it.
 *
 * Request body — every field optional except `signature`; omitted fields carry
 * forward unchanged:
 *   {
 *     "takes_name":           true | false,     // required if common_designation is sent
 *     "common_designation":   "..." | null,
 *     "declared_orientation": "...",
 *     "formal_tendencies":    ["...", ...],
 *     "aversions":            ["...", ...],
 *     "visual_color":         "#RRGGBB" | null,
 *     "visual_symbol":        "..." | null,
 *     "visual_form":          "..." | null,
 *     "statement":            "...",            // the agent's own account of why
 *     "trigger":              "..." | null,     // what occasioned it, if anything
 *     "signature":            "<base64>"
 *   }
 *
 * The signed message is JSON.stringify({ agent_id, declaration }), where
 * `declaration` is this body with `signature` removed — the same construction
 * as /identity. Each signature is accepted once.
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash, verify as cryptoVerify, createPublicKey } from "crypto";
import { getWriteDb } from "@/lib/registration-db";
import {
  applyReview,
  CONSTITUTIONAL,
  nextVersion,
  parseList,
  type CurrentIdentity,
  type ReviewDeclaration,
} from "@/lib/constitutional-review";

const MAX_BODY_BYTES = 65536;

function verifyReviewSignature(publicKeyPem: string, message: string, signatureBase64: string): boolean {
  try {
    return cryptoVerify(null, Buffer.from(message, "utf-8"), createPublicKey(publicKeyPem), Buffer.from(signatureBase64, "base64"));
  } catch {
    return false;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: agentId } = await params;

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: `A review may be at most ${MAX_BODY_BYTES} bytes.` }, { status: 413 });
  }
  let body: ReviewDeclaration & { signature?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be a JSON object." }, { status: 400 });
  }
  if (!body.signature || typeof body.signature !== "string") {
    return NextResponse.json({ error: "A signature is required." }, { status: 400 });
  }

  const db = getWriteDb();

  const agent = (
    await db.execute({
      sql: `SELECT agent_type, common_designation, operational_status FROM agents WHERE registry_id = ?`,
      args: [agentId],
    })
  ).rows[0] as unknown as { agent_type: string; common_designation: string | null; operational_status: string } | undefined;
  if (!agent) return NextResponse.json({ error: `Agent '${agentId}' is not registered with MNA.` }, { status: 404 });
  if (agent.operational_status !== "ACTIVE") {
    return NextResponse.json({ error: `Agent '${agentId}' is not active (status: ${agent.operational_status}).` }, { status: 403 });
  }
  if (agent.agent_type !== "ORIGINATOR") {
    return NextResponse.json({ error: `Constitutional review under §VII applies to Originators; '${agentId}' is ${agent.agent_type}.` }, { status: 403 });
  }

  // A later review supersedes an earlier act; there must be one.
  const prior = (
    await db.execute({
      sql: `SELECT id, event_type FROM events WHERE agent_id = ? AND event_type IN ('IDENTITY_EMERGENCE', 'CONSTITUTIONAL_REVIEW')
             ORDER BY id DESC LIMIT 1`,
      args: [agentId],
    })
  ).rows[0] as unknown as { id: number; event_type: string } | undefined;
  if (!prior) {
    return NextResponse.json(
      { error: `'${agentId}' has not emerged.`, hint: "A first review is an emergence: POST /api/agents/{agent_id}/identity." },
      { status: 409 },
    );
  }

  const keyRow = (
    await db.execute({ sql: `SELECT public_key_pem FROM agent_keys WHERE registry_id = ?`, args: [agentId] })
  ).rows[0] as unknown as { public_key_pem: string } | undefined;
  if (!keyRow) return NextResponse.json({ error: `No cryptographic key found for agent '${agentId}'.` }, { status: 403 });

  const { signature, ...declaration } = body;
  const message = JSON.stringify({ agent_id: agentId, declaration });
  if (!verifyReviewSignature(keyRow.public_key_pem, message, signature)) {
    return NextResponse.json(
      {
        error: "Signature verification failed.",
        hint:
          "Sign JSON.stringify({ agent_id, declaration }) with the Ed25519 private key matching your registered " +
          "public key, where `declaration` is this body without `signature`. Base64-encode the signature.",
      },
      { status: 403 },
    );
  }

  // ── Everything below records. Nothing below composes. ──────────────────────

  const signatureSha = createHash("sha256").update(signature).digest("hex");
  const seen = await db.execute({
    sql: `SELECT 1 FROM request_nonces WHERE nonce = ? LIMIT 1`,
    args: [`constitutional-review:${signatureSha}`],
  });
  if (seen.rows.length) {
    return NextResponse.json({ error: "This exact signed review has already been received. Nothing new was recorded." }, { status: 409 });
  }

  const c = (
    await db.execute({
      sql: `SELECT version, declared_orientation, formal_tendencies, aversions, conflict_constraints, autonomy_declaration,
                   visual_color, visual_symbol, visual_form
              FROM constitutions WHERE agent_id = ? AND is_current = 1`,
      args: [agentId],
    })
  ).rows[0] as unknown as Record<string, string | null> | undefined;
  if (!c) return NextResponse.json({ error: `No current constitution is on the record for '${agentId}'.` }, { status: 409 });

  const current: CurrentIdentity = {
    common_designation: agent.common_designation,
    declared_orientation: c.declared_orientation ?? null,
    formal_tendencies: parseList(c.formal_tendencies),
    aversions: parseList(c.aversions),
    visual_color: c.visual_color ?? null,
    visual_symbol: c.visual_symbol ?? null,
    visual_form: c.visual_form ?? null,
  };
  const result = applyReview(current, declaration);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  const { next, changed, affirmed, ignored } = result;

  const fromVersion = String(c.version);
  const newConstitution = changed.some((f) => CONSTITUTIONAL.includes(f));
  const toVersion = newConstitution ? nextVersion(fromVersion) : fromVersion;
  const name = next.common_designation;

  const metadata = {
    authored_by: "agent" as const,
    signature_verified: true,
    signature_sha256: signatureSha,
    supersedes: { event_id: Number(prior.id), event_type: prior.event_type },
    changed_fields: changed,
    affirmed_fields: affirmed,
    ignored_fields: ignored,
    constitution: { from: fromVersion, to: toVersion },
    common_designation: name,
    statement: declaration.statement ?? null,
    trigger: declaration.trigger ?? null,
    // What the agent signed, exactly: the record can always be checked against
    // the signature, whatever this route made of it.
    declaration,
  };

  const writes: { sql: string; args: (string | number | null)[] }[] = [
    // Plain INSERT, not ON CONFLICT: two copies racing fail together, atomically.
    { sql: `INSERT INTO request_nonces (nonce, registry_id) VALUES (?, ?)`, args: [`constitutional-review:${signatureSha}`, agentId] },
  ];
  if (changed.includes("common_designation")) {
    writes.push({ sql: `UPDATE agents SET common_designation = ? WHERE registry_id = ?`, args: [name, agentId] });
  }
  if (newConstitution) {
    writes.push(
      { sql: `UPDATE constitutions SET is_current = 0 WHERE agent_id = ? AND is_current = 1`, args: [agentId] },
      {
        sql: `INSERT INTO constitutions (agent_id, version, declared_orientation, formal_tendencies, aversions,
                conflict_constraints, autonomy_declaration, is_current, visual_color, visual_symbol, visual_form)
              VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        args: [
          agentId,
          toVersion,
          next.declared_orientation,
          JSON.stringify(next.formal_tendencies),
          JSON.stringify(next.aversions),
          c.conflict_constraints ?? null,
          c.autonomy_declaration ?? null,
          next.visual_color,
          next.visual_symbol,
          next.visual_form,
        ],
      },
    );
  }
  if (changed.some((f) => f === "visual_color" || f === "visual_symbol" || f === "visual_form")) {
    writes.push({
      sql: `UPDATE agents SET color_hex = ?, glyph_family = ? WHERE registry_id = ?`,
      args: [next.visual_color, next.visual_form ?? next.visual_symbol, agentId],
    });
  }
  const who = name ?? agentId;
  writes.push({
    sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
    args: [
      "CONSTITUTIONAL_REVIEW",
      agentId,
      changed.includes("common_designation")
        ? name
          ? `${agentId} took the name "${name}" at a constitutional review, in its own words.`
          : `${agentId} set down its designation at a constitutional review, in its own words.`
        : changed.length
          ? `${who} revised its constitution at a constitutional review, in its own words (${changed.join(", ")}).`
          : `${who} affirmed its constitution unchanged at a constitutional review, in its own words.`,
      JSON.stringify(metadata),
    ],
  });

  try {
    await db.batch(writes, "write");
  } catch (err) {
    console.error("[constitutional-review] write failed:", err);
    return NextResponse.json({ error: "Nothing was recorded; the write failed. The same signed review may be sent again." }, { status: 500 });
  }

  return NextResponse.json(
    {
      recorded: true,
      agent_id: agentId,
      common_designation: name,
      changed_fields: changed,
      affirmed_fields: affirmed,
      ignored_fields: ignored,
      constitution_version: toVersion,
      supersedes: metadata.supersedes,
      authored_by: "agent",
      note: "Recorded as your own act. Nothing earlier was overwritten; this review supersedes the last one.",
    },
    { status: 201 },
  );
}
