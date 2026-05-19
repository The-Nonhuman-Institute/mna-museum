/**
 * find-ceremony-needing-orchestrator.ts — auto-detect helper.
 *
 * Used by the ceremony-live GHA workflow's `detect` job. Returns the
 * id of a ceremony that should have its orchestrator launched right
 * now, or empty string if none. Exactly one id per run; if multiple
 * are eligible (uncommon), returns the soonest one.
 *
 * A ceremony is eligible when ALL are true:
 *   - status IN ('scheduled', 'in_progress')
 *   - scheduled_at <= now + 5 min (about to start, or already started)
 *   - scheduled_at + duration_minutes >= now (not already ended)
 *   - metadata.schedule[] exists (Curator has authored a real schedule)
 *   - metadata.orchestrator_started_at IS NULL (no live orchestrator
 *     already running for this ceremony in another job)
 *
 * Output: writes the bare id to stdout (or empty), nothing else, so
 * the workflow can capture it cleanly with `$(...)`.
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

const db = createClient({
  url: sanitize(process.env.TURSO_DATABASE_URL),
  authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
});

(async () => {
  const r = await db.execute({
    sql: `SELECT id, metadata, scheduled_at
            FROM ceremonies
           WHERE status IN ('scheduled','in_progress')
             AND datetime(scheduled_at) <= datetime('now', '+5 minutes')
             AND datetime(scheduled_at, '+' || duration_minutes || ' minutes') >= datetime('now')
           ORDER BY scheduled_at ASC`,
    args: [],
  });
  for (const row of r.rows) {
    const meta = (row as Record<string, unknown>).metadata;
    if (typeof meta !== "string") continue;
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(meta); } catch { continue; }
    if (!Array.isArray(parsed.schedule) || parsed.schedule.length === 0) continue;
    // Skip if already locked by another orchestrator run. Locks expire
    // after duration + 10min to handle a dead job; if expired, we
    // pick it back up.
    if (typeof parsed.orchestrator_started_at === "string") {
      const startedAt = new Date(parsed.orchestrator_started_at).getTime();
      const ageMin = (Date.now() - startedAt) / 60_000;
      // If the lock was placed more than (ceremony duration + 10) min
      // ago, the orchestrator definitely isn't still running.
      // Approximate duration from the schedule's last offset + 10.
      const lastOffset = Math.max(
        0,
        ...((parsed.schedule as Array<Record<string, unknown>>).map(
          (s) => (typeof s.offset_minutes === "number" ? s.offset_minutes : 0),
        )),
      );
      const lockTtlMin = lastOffset + 15;
      if (ageMin < lockTtlMin) continue;
    }
    process.stdout.write(String((row as Record<string, unknown>).id));
    process.exit(0);
  }
  // No eligible ceremony — print nothing. The workflow's if-guard
  // catches the empty string.
  process.exit(0);
})().catch((e) => {
  console.error("[find-ceremony] error:", e);
  process.exit(1);
});
