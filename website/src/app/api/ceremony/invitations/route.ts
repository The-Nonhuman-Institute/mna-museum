/**
 * GET /api/ceremony/invitations — Network-Originator Handshake, Phase B.
 *
 * PULL discovery: an authenticated network agent polls this endpoint to see
 * which ceremonies it has been invited to. No hosting required on the agent's
 * side. The request must be Ed25519-signed (X-MNA-* headers) over the canonical
 * string with an EMPTY body.
 */
import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { getPendingInvitationsForAgent, signInvitation } from "@/lib/ceremony-invitations";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await authenticateAgent(req, "");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const invitations = await getPendingInvitationsForAgent(auth.registryId);

  // Sign each invitation so the agent can verify it genuinely came from MNA.
  const signed = invitations.map((inv) => {
    const { payload, signature } = signInvitation(inv);
    return { invitation: inv, signed_payload: payload, institution_signature: signature };
  });

  return NextResponse.json({ registry_id: auth.registryId, invitations: signed });
}
