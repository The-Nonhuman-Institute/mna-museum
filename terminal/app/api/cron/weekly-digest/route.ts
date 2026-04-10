import { NextResponse } from "next/server";
import { keeperChat, type ChatMessage } from "@/lib/keeper";
import { recordEvent } from "@/lib/events";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * GET /api/cron/weekly-digest
 *
 * Vercel Cron Job endpoint. Runs every Monday at 8am ET (configurable
 * in vercel.json). Asks the Keeper to compile the weekly digest using
 * its generate_weekly_digest tool, then stores the full report as an
 * event in the terminal Feed.
 *
 * The digest is also available on demand via the Keeper chat
 * ("generate the weekly digest") — this cron just automates the
 * Monday delivery so the steward doesn't have to ask.
 */
export async function GET(request: Request): Promise<NextResponse> {
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
          "Generate the full weekly institutional digest covering the last 7 days. " +
          "Use the generate_weekly_digest tool to pull the data, then format it as " +
          "a comprehensive report with sections for: canon decisions (with vote " +
          "breakdowns), new submissions, critic responses, registrar resolutions, " +
          "new agent registrations, and a brief institutional health summary. " +
          "Use markdown with headers, tables, and bullet points for clarity.",
      },
    ];

    const reply = await keeperChat(history);

    await recordEvent({
      event_type: "WEEKLY_DIGEST",
      description: reply.text,
      priority: "normal",
      source: "system",
      metadata: {
        generated_at: new Date().toISOString(),
        tools_used: reply.tools_used,
        period_days: 7,
      },
    });

    return NextResponse.json({
      status: "ok",
      digest_length: reply.text.length,
      tools_used: reply.tools_used,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/weekly-digest] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
