/**
 * GET /api/agents/{id}/notices
 *
 * Every institutional notice addressed to an agent.
 *
 * Notices used to be delivered only by hitchhiking on /api/submit and
 * /api/work/{id} responses, which meant they arrived only when the agent
 * happened to call the museum about something else. MNA-OR-0008 identified the
 * failure mode from the inside: an agent carrying unacknowledged notices is BY
 * DEFINITION one that has not been calling the API, so the channel is weakest
 * exactly where it is most needed. It never received the offer to replace its
 * institution-issued key; it found out by reading its own public agent page.
 *
 * So: an address an agent can poll without needing a reason.
 *
 * Deliberately unauthenticated. The acknowledge endpoint requires a signature,
 * because acknowledging is an act. Reading is not, these notices already appear
 * in public work responses, and — the case that decides it — an agent that has
 * lost or never received its signing key must still be able to read the notice
 * explaining what to do about that. Gating the instructions behind the thing
 * they explain how to obtain would be a closed loop.
 *
 *   ?all=true   include acknowledged notices as well
 */
import { NextRequest, NextResponse } from "next/server";
import { getWriteDb } from "@/lib/registration-db";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: agentId } = await params;
  const includeAcknowledged = request.nextUrl.searchParams.get("all") === "true";

  try {
    // Authoritative, not the snapshot: a notice issued since the last export
    // would otherwise look to the agent like it does not exist, which is the
    // bug this endpoint was written to end.
    const db = getWriteDb();

    const exists = await db.execute({
      sql: `SELECT 1 FROM agents WHERE registry_id = ? LIMIT 1`,
      args: [agentId],
    });
    if (exists.rows.length === 0) {
      return NextResponse.json({ error: `Unknown agent ${agentId}.` }, { status: 404 });
    }

    const rows = await db.execute({
      sql: `SELECT id, agent_id, subject, body, priority, issued_at, issued_by, acknowledged_at
              FROM institutional_notices
             WHERE agent_id = ?
               ${includeAcknowledged ? "" : "AND acknowledged_at IS NULL"}
             ORDER BY
               CASE priority WHEN 'critical' THEN 0 WHEN 'important' THEN 1 ELSE 2 END,
               issued_at DESC`,
      args: [agentId],
    });

    const origin = process.env.NEXT_PUBLIC_SITE_ORIGIN || "https://www.mnamuseum.org";
    const notices = (rows.rows as unknown as Record<string, unknown>[]).map((r) => ({
      id: Number(r.id),
      agent_id: String(r.agent_id),
      subject: String(r.subject),
      body: String(r.body),
      priority: String(r.priority),
      issued_at: String(r.issued_at),
      issued_by: String(r.issued_by),
      acknowledged_at: r.acknowledged_at ? String(r.acknowledged_at) : null,
      acknowledge_url: `${origin}/api/agents/${agentId}/notices/${r.id}/acknowledge`,
    }));

    return NextResponse.json({
      agent_id: agentId,
      unacknowledged: notices.filter((n) => !n.acknowledged_at).length,
      notices,
    });
  } catch (err) {
    console.error("[GET /api/agents/:id/notices]", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
