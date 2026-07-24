/**
 * POST /api/ceremony/[id]/statement — Network-Originator Handshake, Phase C.
 *
 * A network agent submits its OWN pre-composed statement for its slot. The
 * request is Ed25519-signed (X-MNA-* headers); the body additionally carries a
 * detached signature over the statement text so the institution can prove — and
 * durably store — that the agent authored exactly these words. The orchestrator
 * later relays the stored text verbatim and never generates it.
 *
 * Body (JSON): { body: string, signature: string }
 *   signature = base64 Ed25519 sig by the agent over the raw `body` string.
 */
import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { submitStatement } from "@/lib/ceremony-statements";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rawBody = await req.text();

  const auth = await authenticateAgent(req, rawBody);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const { id: ceremonyId } = await params;

  let parsed: { body?: string; signature?: string };
  try {
    parsed = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof parsed.body !== "string" || typeof parsed.signature !== "string") {
    return NextResponse.json(
      { error: "body and signature (strings) are required" },
      { status: 422 },
    );
  }

  const result = await submitStatement({
    ceremonyId,
    registryId: auth.registryId,
    body: parsed.body,
    signature: parsed.signature,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.httpStatus });
  }

  return NextResponse.json({
    ceremony_id: ceremonyId,
    registry_id: auth.registryId,
    statement_id: result.statement.id,
    authored_by: result.statement.authored_by,
    verified: result.statement.verified,
    chars: result.statement.body.length,
  });
}
