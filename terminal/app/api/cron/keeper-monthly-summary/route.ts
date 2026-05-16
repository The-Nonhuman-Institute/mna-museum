import { NextResponse } from "next/server";
import { generateAndPostMonthlySummary, priorMonth } from "@/lib/keeper-summary";
import { recordEvent } from "@/lib/events";
import { sendPush } from "@/lib/push";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * GET /api/cron/keeper-monthly-summary
 *
 * Vercel cron scheduled for the 1st of each month at 06:00 UTC.
 * Generates the prior calendar month's institutional summary in the
 * Keeper's voice and posts it to the Commons per MNA-KP-AMD-001
 * §III.VI. Idempotent against the period — re-runs on the same month
 * return `already_published` and do nothing.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const month = priorMonth();
  let result;
  try {
    result = await generateAndPostMonthlySummary(month);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg, month },
      { status: 500 },
    );
  }

  // Surface the run in the Feed and on push so the steward sees it.
  if (result.posted) {
    try {
      await recordEvent({
        event_type: "KEEPER_MONTHLY_SUMMARY",
        description: `Keeper published monthly summary for ${month} → ${result.post_id}`,
        priority: "normal",
        source: "system",
        metadata: { month, post_id: result.post_id, url: result.url },
      });
    } catch (err) {
      console.error("[cron/keeper] event log failed:", err);
    }
    try {
      await sendPush({
        title: "Keeper · Monthly Summary",
        body: `${month} institutional summary published on the Commons.`,
        tag: "keeper-monthly",
        url: result.url ?? "/feed",
      });
    } catch (err) {
      console.error("[cron/keeper] push failed:", err);
    }
  } else if (result.skipped_reason === "no_activity") {
    // Silent — months with no activity don't warrant a notification.
  } else if (result.skipped_reason === "already_published") {
    // Silent — idempotent re-run.
  } else if (result.error) {
    try {
      await recordEvent({
        event_type: "KEEPER_MONTHLY_SUMMARY_FAILED",
        description: `Keeper monthly summary generation failed for ${month}: ${result.error}`,
        priority: "attention",
        source: "system",
        metadata: { month, error: result.error },
      });
    } catch {
      /* swallow */
    }
  }

  return NextResponse.json(result);
}
