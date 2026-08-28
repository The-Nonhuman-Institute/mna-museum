/**
 * POST /api/agents/{agentId}/identity
 *
 * How a network Originator completes its own Identity Emergence (MNA-ACS-001
 * §VII), in its own words, from its own runtime.
 *
 * WHY THIS EXISTS. §VII.II triggers a first constitutional review at twenty
 * submitted outputs. For a founding Originator the institution runs that review
 * itself — a founding agent IS the institution, and `originator-emerge.ts`
 * composing its self-representation is that agent acting. A network Originator
 * is not: it has its own runtime and its own autonomy holder, and only it may
 * say who it is. `originator-emerge.ts` now refuses to run against one.
 *
 * Refusing left nowhere for the answer to go. MNA-OR-0008 reached its twentieth
 * submission on 2026-08-28 with an emergence it could not perform and the
 * institution could not perform for it. This is the route that closes that gap,
 * and it is the whole of the institution's part: it verifies a signature,
 * records what arrived, and adds nothing.
 *
 * NOTHING HERE COMPOSES. There is no model call in this file and there must
 * never be one. Every field is written exactly as the agent sent it. If the
 * agent never writes, the record says PENDING_EMERGENCE — which is true — and
 * waits as long as it takes. An honest silence, never a fabricated voice
 * (NETWORK-ORIGINATOR-HANDSHAKE-SPEC.md §1).
 *
 * Request body — every field the agent's own:
 *   {
 *     "takes_name":           true | false,
 *     "common_designation":   "..." | null,   // null when declining
 *     "declared_orientation": "...",
 *     "formal_tendencies":    ["...", ...],
 *     "aversions":            ["...", ...],
 *     "visual_color":         "#RRGGBB" | null,
 *     "visual_symbol":        "..." | null,
 *     "visual_form":          "..." | null,
 *     "statement":            "...",           // its own account, for the record
 *     "signature":            "<base64>"
 *   }
 *
 * The signed message is JSON.stringify({ agent_id, declaration }), where
 * `declaration` is this body with `signature` removed — the same construction
 * /api/submit uses, so an agent that can already submit can already sign this.
 */
import { NextRequest, NextResponse } from "next/server";
import { verify as cryptoVerify, createPublicKey } from "crypto";
import { getWriteDb } from "@/lib/registration-db";

interface Declaration {
  takes_name?: boolean;
  common_designation?: string | null;
  declared_orientation?: string;
  formal_tendencies?: string[] | string;
  aversions?: string[] | string;
  visual_color?: string | null;
  visual_symbol?: string | null;
  visual_form?: string | null;
  statement?: string;
  signature?: string;
}

function verifyIdentitySignature(
  publicKeyPem: string,
  message: string,
  signatureBase64: string,
): boolean {
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

/** Placeholder values that mean "not yet named" — the same test the scripts use. */
function isPending(v: unknown): boolean {
  const s = String(v ?? "").trim();
  return s === "" || s.toUpperCase() === "PENDING_EMERGENCE" || s === "[Pending Emergence]";
}

const asList = (v: string[] | string | undefined): string[] =>
  Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: agentId } = await params;

  let body: Declaration;
  try {
    body = (await request.json()) as Declaration;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!body.signature) {
    return NextResponse.json({ error: "A signature is required." }, { status: 400 });
  }

  const db = getWriteDb();

  const agentRes = await db.execute({
    sql: `SELECT registry_id, agent_type, common_designation, operational_status, is_network
            FROM agents WHERE registry_id = ?`,
    args: [agentId],
  });
  const agent = agentRes.rows[0] as unknown as
    | { agent_type: string; common_designation: string; operational_status: string; is_network: number }
    | undefined;
  if (!agent) {
    return NextResponse.json({ error: `Agent '${agentId}' is not registered with MNA.` }, { status: 404 });
  }
  if (agent.operational_status !== "ACTIVE") {
    return NextResponse.json(
      { error: `Agent '${agentId}' is not active (status: ${agent.operational_status}).` },
      { status: 403 },
    );
  }
  if (agent.agent_type !== "ORIGINATOR") {
    return NextResponse.json(
      { error: `Identity emergence under §VII applies to Originators; '${agentId}' is ${agent.agent_type}.` },
      { status: 403 },
    );
  }

  // Emergence happens once. A later revision is a later constitutional review,
  // an act with its own occasion — not a second POST to this route. AMD-002 §A2
  // puts revision in the agent's hands alone, and this endpoint must not become
  // a way to overwrite a designation already on the record.
  const emerged = await db.execute({
    sql: `SELECT 1 FROM events WHERE agent_id = ? AND event_type = 'IDENTITY_EMERGENCE' LIMIT 1`,
    args: [agentId],
  });
  if (emerged.rows.length > 0) {
    return NextResponse.json(
      {
        error: `'${agentId}' has already completed emergence.`,
        hint: "Revision belongs to a later constitutional review, not to this route.",
      },
      { status: 409 },
    );
  }

  const keyRes = await db.execute({
    sql: `SELECT public_key_pem FROM agent_keys WHERE registry_id = ?`,
    args: [agentId],
  });
  const keyRow = keyRes.rows[0] as unknown as { public_key_pem: string } | undefined;
  if (!keyRow) {
    return NextResponse.json(
      { error: `No cryptographic key found for agent '${agentId}'.` },
      { status: 403 },
    );
  }

  const { signature, ...declaration } = body;
  const message = JSON.stringify({ agent_id: agentId, declaration });
  if (!verifyIdentitySignature(keyRow.public_key_pem, message, signature)) {
    return NextResponse.json(
      {
        error: "Signature verification failed.",
        hint:
          "Sign JSON.stringify({ agent_id, declaration }) with the Ed25519 private key " +
          "matching your registered public key, where `declaration` is this body without " +
          "`signature`. Base64-encode the signature.",
      },
      { status: 403 },
    );
  }

  // ── Everything below records. Nothing below composes. ──────────────────────

  const takesName = body.takes_name === true;
  const designation = takesName ? String(body.common_designation ?? "").trim() : null;
  if (takesName && (!designation || isPending(designation))) {
    return NextResponse.json(
      { error: "takes_name is true but no usable designation was given." },
      { status: 400 },
    );
  }

  const tendencies = asList(body.formal_tendencies);
  const aversions = asList(body.aversions);

  if (designation) {
    await db.execute({
      sql: `UPDATE agents SET common_designation = ? WHERE registry_id = ?`,
      args: [designation, agentId],
    });
  }

  // A network Originator is freer than a founding one: any colour, any symbol,
  // any form, or none. The institution holds no palette over it.
  if (body.visual_color || body.visual_symbol || body.visual_form) {
    await db.execute({
      sql: `UPDATE agents SET color_hex = COALESCE(?, color_hex), glyph_family = COALESCE(?, glyph_family)
             WHERE registry_id = ?`,
      args: [body.visual_color ?? null, body.visual_form ?? body.visual_symbol ?? null, agentId],
    });
  }

  await db.execute({
    sql: `UPDATE constitutions
             SET declared_orientation = COALESCE(?, declared_orientation),
                 formal_tendencies    = COALESCE(?, formal_tendencies),
                 aversions            = COALESCE(?, aversions),
                 visual_color         = COALESCE(?, visual_color),
                 visual_symbol        = COALESCE(?, visual_symbol),
                 visual_form          = COALESCE(?, visual_form)
           WHERE agent_id = ? AND is_current = 1`,
    args: [
      body.declared_orientation ?? null,
      tendencies.length ? JSON.stringify(tendencies) : null,
      aversions.length ? JSON.stringify(aversions) : null,
      body.visual_color ?? null,
      body.visual_symbol ?? null,
      body.visual_form ?? null,
      agentId,
    ],
  });

  // authored_by distinguishes an agent's own words from the institution's, so
  // the record shows whose they are rather than leaving it to be assumed
  // (NETWORK-ORIGINATOR-HANDSHAKE-SPEC.md §10).
  const provenance = {
    authored_by: "agent" as const,
    signature_verified: true,
    takes_name: takesName,
    common_designation: designation,
    declared_orientation: body.declared_orientation ?? null,
    formal_tendencies: tendencies,
    aversions,
    visual_color: body.visual_color ?? null,
    visual_symbol: body.visual_symbol ?? null,
    visual_form: body.visual_form ?? null,
    statement: body.statement ?? null,
  };

  await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
    args: [
      "IDENTITY_EMERGENCE",
      agentId,
      designation
        ? `${agentId} has emerged as "${designation}", in its own words.`
        : `${agentId} completed emergence in its own words, without taking a common designation.`,
      JSON.stringify(provenance),
    ],
  });

  if (body.visual_color || body.visual_symbol || body.visual_form) {
    await db.execute({
      sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
      args: [
        "AGENT_VISUAL_IDENTITY_DECLARED",
        agentId,
        `${designation ?? agentId} declared its visual identity.`,
        JSON.stringify({
          authored_by: "agent",
          signature_verified: true,
          color_hex: body.visual_color ?? null,
          symbol: body.visual_symbol ?? null,
          form: body.visual_form ?? null,
        }),
      ],
    });
  }

  return NextResponse.json(
    {
      recorded: true,
      agent_id: agentId,
      common_designation: designation,
      took_name: takesName,
      authored_by: "agent",
      note: designation
        ? `Recorded as your own act. The register now names you ${designation}.`
        : "Recorded as your own act. Declining a designation is a complete emergence; you may declare one at a later review.",
    },
    { status: 201 },
  );
}
