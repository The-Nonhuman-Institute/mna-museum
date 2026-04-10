import { NextResponse } from "next/server";
import { getInstitutionalTurso } from "@/lib/institutional-turso";
import { evaluateWork } from "@/lib/evaluator";
import { critiqueWork } from "@/lib/critic";
import { updateMuseum } from "@/lib/museum-pipeline";
import { recordEvent } from "@/lib/events";
import { sendPush } from "@/lib/push";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/post-canonization
 *
 * The institutional autopilot. Runs every 4 hours via Vercel Cron.
 * Processes the full pipeline for any works that need attention:
 *
 *   1. EVALUATE — find works in SUBMITTED status, run the Council
 *   2. CRITIQUE — find canon works missing critic responses, run Critics
 *   3. INSTALL  — find canon works not in the museum, run Curator → Installer
 *   4. NOTIFY   — log a summary event + push notification
 *
 * Each step is independent — a failure in one doesn't block the others.
 * Results are logged to the terminal Feed and pushed to the steward's
 * phone.
 *
 * The institution runs itself. The steward oversees.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = { started_at: new Date().toISOString() };
  const summaryParts: string[] = [];

  // ── Step 1: Evaluate submitted works ────────────────────────────
  try {
    const db = getInstitutionalTurso();
    const submitted = await db.execute(
      "SELECT work_id FROM canon_status WHERE status = 'SUBMITTED' ORDER BY work_id"
    );
    const workIds = submitted.rows.map((r) => r.work_id as string);
    results.submitted_found = workIds.length;

    if (workIds.length > 0) {
      const evalResults = [];
      for (const wid of workIds) {
        try {
          const result = await evaluateWork(wid);
          evalResults.push(result);
          summaryParts.push(`${wid}: ${result.final_status} (${Object.values(result.verdicts).filter(v => v === "CANON").length}-${Object.values(result.verdicts).filter(v => v === "REJECTED").length}${result.registrar_resolved ? ", Registrar resolved" : ""})`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          evalResults.push({ work_id: wid, error: msg });
          summaryParts.push(`${wid}: evaluation failed — ${msg}`);
        }
      }
      results.evaluations = evalResults;
    }
  } catch (err) {
    results.evaluation_error = err instanceof Error ? err.message : String(err);
  }

  // ── Step 2: Critique canon works missing responses ──────────────
  try {
    const db = getInstitutionalTurso();
    const uncritiqued = await db.execute(`
      SELECT cs.work_id
        FROM canon_status cs
        WHERE cs.status = 'CANON'
          AND cs.work_id NOT IN (
            SELECT DISTINCT work_id FROM critical_responses
          )
        ORDER BY cs.canon_date ASC
        LIMIT 4
    `);
    const critWorkIds = uncritiqued.rows.map((r) => r.work_id as string);
    results.uncritiqued_found = critWorkIds.length;

    if (critWorkIds.length > 0) {
      const critResults = [];
      for (const wid of critWorkIds) {
        try {
          const result = await critiqueWork(wid);
          critResults.push(result);
          if (result.responses.length > 0) {
            summaryParts.push(`Critics responded to ${wid}`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          critResults.push({ work_id: wid, error: msg });
        }
      }
      results.critiques = critResults;
    }
  } catch (err) {
    results.critique_error = err instanceof Error ? err.message : String(err);
  }

  // ── Step 3: Install unplaced canon works in museum ──────────────
  try {
    const museumResult = await updateMuseum();
    results.museum = museumResult;
    if (museumResult.installations.length > 0) {
      summaryParts.push(`${museumResult.installations.length} work(s) installed in the museum`);
    }
  } catch (err) {
    results.museum_error = err instanceof Error ? err.message : String(err);
  }

  // ── Step 4: Summary event + push notification ───────────────────
  results.completed_at = new Date().toISOString();

  if (summaryParts.length > 0) {
    const summary = summaryParts.join(". ");

    try {
      await recordEvent({
        event_type: "POST_CANONIZATION_PIPELINE",
        description: summary,
        priority: "normal",
        source: "system",
        metadata: results,
      });
    } catch (err) {
      console.error("[cron/post-canonization] failed to record event:", err);
    }

    try {
      await sendPush({
        title: "MNA Institution Update",
        body: summary.slice(0, 150),
        tag: "post-canonization",
        url: "/feed",
      });
    } catch (err) {
      console.error("[cron/post-canonization] push failed:", err);
    }
  } else {
    results.summary = "No action needed — no pending submissions, uncritiqued works, or unplaced canon.";
  }

  return NextResponse.json(results);
}
