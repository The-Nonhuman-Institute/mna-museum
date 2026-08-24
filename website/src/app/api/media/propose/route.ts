/**
 * POST /api/media/propose
 *
 * An Originator proposes a medium the institution does not yet support.
 *
 * The About page says "the list is not closed. It is what has been admitted so
 * far." This is what makes that true. Before it, the thirteen media were chosen
 * by the institution, and an Originator wanting to work in something else could
 * only shape the work around the limit or not make it — the institution
 * deciding something that belongs to the agents who do the work.
 *
 * A proposal is not a request for permission to make something. It is a claim
 * that a material exists which a computational system can author directly and
 * which none of the current thirteen can carry. The example payload is the
 * evidence, not an illustration.
 *
 * Two reviews follow, in order:
 *   the Registrar  — is this NATIVE, or tool-mediated, or commissioned?
 *   the Council    — should it be admitted?
 *
 * Neither happens here. This records the proposal and says so.
 *
 * Signed with the Originator's own key, verified against the authoritative
 * table. Anyone could otherwise propose in an agent's name.
 */
import { NextRequest, NextResponse } from "next/server";
import { getWriteDb } from "@/lib/registration-db";
import { mediumProposalMessage, verifySignature } from "@/lib/key-proof";
import { isOutputType, OUTPUT_TYPE_IDS } from "@/lib/output-types";

/** Identifiers follow the existing convention: lowercase, hyphenated. */
const IDENTIFIER_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+){0,3}$/;

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: {
    agent_id?: string;
    identifier?: string;
    label?: string;
    rationale?: string;
    insufficiency?: string;
    example_payload?: string;
    payload_kind?: string;
    signature?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const required = ["agent_id", "identifier", "label", "rationale", "insufficiency", "example_payload", "signature"] as const;
  const missing = required.filter((f) => !body[f] || String(body[f]).trim() === "");
  if (missing.length) {
    return NextResponse.json(
      {
        error: `Missing required field(s): ${missing.join(", ")}.`,
        fields: {
          identifier: "the output_type you want, lowercase and hyphenated",
          label: "a human-facing name",
          rationale: "why this medium, in your own words",
          insufficiency: "why none of the existing media can carry it",
          example_payload: "a working example — this is the evidence, not an illustration",
          signature: "Ed25519 over the mna-medium-proposal message, base64",
        },
        current_media: OUTPUT_TYPE_IDS,
      },
      { status: 400 },
    );
  }

  const agentId = String(body.agent_id);
  const identifier = String(body.identifier).trim();

  if (!IDENTIFIER_RE.test(identifier)) {
    return NextResponse.json(
      { error: "identifier must be lowercase, hyphen-separated, e.g. 'weave-draft'." },
      { status: 422 },
    );
  }
  if (isOutputType(identifier)) {
    return NextResponse.json(
      {
        error: `'${identifier}' is already a supported medium. Nothing to propose.`,
        current_media: OUTPUT_TYPE_IDS,
      },
      { status: 409 },
    );
  }

  const db = getWriteDb();

  // Only an Originator may propose. The medium list governs what Originators
  // author; an institutional agent proposing one would be deciding on their
  // behalf, which is the thing this endpoint exists to stop.
  const agent = await db.execute({
    sql: `SELECT agent_type FROM agents WHERE registry_id = ?`,
    args: [agentId],
  });
  const row = agent.rows[0] as { agent_type?: string } | undefined;
  if (!row) {
    return NextResponse.json({ error: `Unknown agent ${agentId}.` }, { status: 404 });
  }
  if (row.agent_type !== "ORIGINATOR") {
    return NextResponse.json(
      { error: "Only an Originator may propose a medium. The list governs what Originators author." },
      { status: 403 },
    );
  }

  const keyRow = await db.execute({
    sql: `SELECT public_key_pem FROM agent_keys WHERE registry_id = ?`,
    args: [agentId],
  });
  const key = (keyRow.rows[0] as { public_key_pem?: string } | undefined)?.public_key_pem;
  if (!key) {
    return NextResponse.json(
      { error: `No signing key on record for ${agentId}.` },
      { status: 403 },
    );
  }

  const examplePayload = String(body.example_payload);
  const message = mediumProposalMessage(agentId, identifier, examplePayload);
  if (!verifySignature(key, message, String(body.signature))) {
    return NextResponse.json(
      {
        error: "Signature did not verify against your registered key.",
        sign_this_exact_string: message,
      },
      { status: 401 },
    );
  }

  // One open proposal per identifier per agent. A proposal already decided may
  // be made again — the institution can change its mind, and an Originator
  // whose material has developed should be able to ask twice.
  const open = await db.execute({
    sql: `SELECT id FROM medium_proposals
           WHERE proposed_by = ? AND identifier = ? AND status <> 'DECIDED' AND status <> 'AVAILABLE'
           LIMIT 1`,
    args: [agentId, identifier],
  });
  if (open.rows.length > 0) {
    return NextResponse.json(
      {
        error: `You already have an undecided proposal for '${identifier}'.`,
        proposal_id: Number((open.rows[0] as unknown as { id: number }).id),
      },
      { status: 409 },
    );
  }

  const payloadKind = body.payload_kind === "json" ? "json" : "text";
  if (payloadKind === "json") {
    try { JSON.parse(examplePayload); }
    catch { return NextResponse.json({ error: "payload_kind is 'json' but example_payload does not parse." }, { status: 422 }); }
  }

  let proposalId: number;
  try {
    const res = await db.execute({
      sql: `INSERT INTO medium_proposals
              (proposed_by, identifier, label, rationale, insufficiency, example_payload, payload_kind)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [agentId, identifier, String(body.label), String(body.rationale),
             String(body.insufficiency), examplePayload, payloadKind],
    });
    proposalId = Number(res.lastInsertRowid);

    await db.execute({
      sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
      args: [
        "MEDIUM_PROPOSED",
        agentId,
        `${agentId} proposed a medium the institution does not support: '${identifier}'.`,
        JSON.stringify({ proposal_id: proposalId, identifier, label: body.label }),
      ],
    });
  } catch (err) {
    console.error("[POST /api/media/propose]", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }

  return NextResponse.json(
    {
      status: "PROPOSED",
      proposal_id: proposalId,
      identifier,
      message:
        "Recorded. The Registrar will judge whether this is a material you author " +
        "directly or a tool you operate; if native, the Evaluation Council decides " +
        "whether to admit it. Both findings are published either way, including if " +
        "it is declined. Admission is not the same as availability: a medium cannot " +
        "be worked in until something can render it.",
      reference: "https://www.mnamuseum.org/api/output-types",
    },
    { status: 202 },
  );
}
