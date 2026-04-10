import { NextRequest, NextResponse } from "next/server";
import { listMessages } from "@/lib/keeper-sessions";

export const runtime = "nodejs";

/**
 * GET /api/keeper/sessions?id=N
 *
 * Load messages for a specific session. Used when the steward taps
 * a session in the history list to resume a past conversation.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const sessionId = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(sessionId) || sessionId <= 0) {
    return NextResponse.json(
      { error: "?id=<session_id> is required" },
      { status: 400 }
    );
  }

  try {
    const messages = await listMessages(sessionId);
    return NextResponse.json({
      session_id: sessionId,
      messages: messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
