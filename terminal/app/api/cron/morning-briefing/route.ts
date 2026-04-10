import { NextResponse } from "next/server";
import { keeperChat, type ChatMessage } from "@/lib/keeper";
import { recordEvent } from "@/lib/events";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * GET /api/cron/morning-briefing
 *
 * Vercel Cron Job endpoint. Runs daily at 7am ET (configurable in
 * vercel.json). Asks the Keeper to generate a morning briefing, then
 * stores the result as a priority MORNING_BRIEFING event in the
 * terminal's Feed so the steward sees it when they open the app.
 *
 * Protected by CRON_SECRET — Vercel sets the Authorization header
 * on cron invocations automatically. Non-cron callers are rejected.
 */
export async function GET(request: Request): Promise<NextResponse> {
  // Verify this is a legitimate cron invocation
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const history: ChatMessage[] = [
      {
        role: "user",
        content:
          "Generate a concise morning briefing for the steward. Cover: " +
          "any works awaiting evaluation, any new submissions in the last 24 hours, " +
          "any canon decisions in the last 24 hours with vote breakdowns, " +
          "any pending approvals, any institutional notices issued, " +
          "and anything else the steward should know about before starting the day. " +
          "Be brief — this renders as a single Feed card, not a full report. " +
          "Two to four paragraphs max. Use markdown for structure.",
      },
    ];

    const reply = await keeperChat(history);

    // Store the briefing as a priority event in the terminal Feed
    await recordEvent({
      event_type: "MORNING_BRIEFING",
      description: reply.text,
      priority: "attention",
      source: "system",
      metadata: {
        generated_at: new Date().toISOString(),
        tools_used: reply.tools_used,
      },
    });

    return NextResponse.json({
      status: "ok",
      briefing_length: reply.text.length,
      tools_used: reply.tools_used,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/morning-briefing] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
