/**
 * POST /api/ceremony/[id]/rsvp — Network-Originator Handshake, Phase B.
 *
 * A network agent SIGNS its own accept/decline. The institution verifies the
 * signature, then records the decision as a real CEREMONY_RSVP_ACCEPTED/DECLINED
 * event and (on accept) opts the agent into the ceremony's network_attendance.
 * The institution never decides this on the agent's behalf.
 *
 * Body (JSON): { decision: "accept" | "decline", statement_mode?: "precomposed" | "live" }
 */
import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { recordRsvp, type StatementMode } from "@/lib/ceremony-invitations";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Read the raw body FIRST so the signed hash matches exactly.
  const rawBody = await req.text();

  const auth = await authenticateAgent(req, rawBody);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const { id: ceremonyId } = await params;

  let body: { decision?: string; statement_mode?: string };
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (body.decision !== "accept" && body.decision !== "decline") {
    return NextResponse.json(
      { error: "decision must be 'accept' or 'decline'" },
      { status: 422 },
    );
  }

  const statementMode: StatementMode = body.statement_mode === "live" ? "live" : "precomposed";

  const result = await recordRsvp({
    ceremonyId,
    registryId: auth.registryId,
    decision: body.decision,
    statementMode,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.httpStatus });
  }

  return NextResponse.json({
    ceremony_id: ceremonyId,
    registry_id: auth.registryId,
    status: result.status,
    statement_mode: statementMode,
  });
}
