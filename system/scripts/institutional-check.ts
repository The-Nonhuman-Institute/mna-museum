/**
 * MNA Institutional Monitor — checks Turso for pending actions.
 * Designed to run at Claude Code session start via hook.
 *
 * Checks for:
 * - Pending registrations awaiting steward review
 * - Submitted works awaiting evaluation
 * - Works stuck in evaluation limbo (all 4 Council votes in but canon
 *   status never tallied — re-run evaluate-turso-works.ts to fix)
 * - Canonized works missing Notice of Accession emails
 * - Broken / missing work previews
 *
 * "Unnotified canonizations" is filtered to works whose originator has
 * an external steward_email on file. MNA's founding originators
 * (MNA-OR-0001..0006) have no external steward and are excluded —
 * there is no one to notify, so they are not "missing" a notice.
 *
 * Outputs JSON to stdout for the hook to parse.
 * Optionally sends email digest to founding steward.
 *
 * Usage: npx tsx scripts/institutional-check.ts [--notify]
 */

import { createClient } from "@libsql/client";
import { Resend } from "resend";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.log(JSON.stringify({ error: "Missing Turso credentials" }));
  process.exit(0);
}

const turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

interface CheckResult {
  pendingRegistrations: { id: number; steward_name: string; steward_email: string; submission_date: string }[];
  unevaluatedWorks: { id: string; originator_id: string; medium: string; submitted: string }[];
  limboWorks: { work_id: string; status: string; votes: string }[];
  unnotifiedCanonizations: { work_id: string; originator_id: string; canon_date: string; steward_email: string }[];
  brokenRenders: { work_id: string; output_type: string; error_message: string | null; last_checked: string }[];
  missingPreviews: { work_id: string; output_type: string }[];
  summary: string;
}

async function check(): Promise<CheckResult> {
  // 1. Pending registrations
  const pendingResult = await turso.execute(
    "SELECT id, steward_name, steward_email, submission_date FROM pending_registrations WHERE status = 'PENDING'"
  );
  const pendingRegistrations = pendingResult.rows.map((r) => ({
    id: r.id as number,
    steward_name: r.steward_name as string,
    steward_email: r.steward_email as string,
    submission_date: r.submission_date as string,
  }));

  // 2. Submitted works awaiting evaluation (status = SUBMITTED)
  const submittedResult = await turso.execute(
    `SELECT w.id, w.originator_id, w.medium, w.created_at as submitted
     FROM works w
     JOIN canon_status cs ON w.id = cs.work_id
     WHERE cs.status = 'SUBMITTED'
     ORDER BY w.created_at`
  );
  const unevaluatedWorks = submittedResult.rows.map((r) => ({
    id: r.id as string,
    originator_id: r.originator_id as string,
    medium: r.medium as string,
    submitted: r.submitted as string,
  }));

  // 3. Works stuck in evaluation limbo: all 4 Council evaluators have
  //    voted, but canon_status is still SUBMITTED or IN_REVIEW (tally
  //    step never ran). This happens if a prior evaluation pass was
  //    interrupted between vote-writes and the canon_status UPDATE, or
  //    if evaluations were inserted outside the script. Re-running
  //    evaluate-turso-works.ts on each limbo work resolves it.
  const limboResult = await turso.execute(
    `SELECT cs.work_id, cs.status,
            GROUP_CONCAT(e.evaluator_id || ':' || e.verdict) as votes
       FROM canon_status cs
       JOIN evaluations e ON cs.work_id = e.work_id
      WHERE cs.status IN ('SUBMITTED', 'IN_REVIEW')
        AND e.evaluator_id LIKE 'MNA-EV-%'
      GROUP BY cs.work_id, cs.status
      HAVING COUNT(e.id) >= 4
      ORDER BY cs.work_id`
  );
  const limboWorks = limboResult.rows.map((r) => ({
    work_id: r.work_id as string,
    status: r.status as string,
    votes: (r.votes as string) || "",
  }));

  // 4. Canonized works where no ACCESSION_NOTIFIED event exists AND
  //    the originator has an external steward_email on file. Founding
  //    originators (MNA-OR-0001..0006) have no external steward and
  //    are intentionally excluded — there is no one to notify.
  const canonResult = await turso.execute(
    `SELECT cs.work_id, w.originator_id, cs.canon_date, ak.steward_email
     FROM canon_status cs
     JOIN works w ON cs.work_id = w.id
     JOIN agent_keys ak ON w.originator_id = ak.registry_id
     WHERE cs.status = 'CANON'
       AND ak.steward_email IS NOT NULL
       AND TRIM(ak.steward_email) != ''
       AND cs.work_id NOT IN (
         SELECT work_id FROM events WHERE event_type = 'ACCESSION_NOTIFIED' AND work_id IS NOT NULL
       )
     ORDER BY cs.canon_date`
  );
  const unnotifiedCanonizations = canonResult.rows.map((r) => ({
    work_id: r.work_id as string,
    originator_id: r.originator_id as string,
    canon_date: r.canon_date as string,
    steward_email: (r.steward_email as string) || "",
  }));

  // 4. Works with BROKEN render status (reported by the Conservator).
  // The render_status table may not exist in older databases; guard against that.
  let brokenRenders: CheckResult["brokenRenders"] = [];
  try {
    const renderResult = await turso.execute(
      `SELECT work_id, output_type, error_message, last_checked
         FROM render_status
        WHERE status = 'BROKEN'
        ORDER BY last_checked DESC`
    );
    brokenRenders = renderResult.rows.map((r) => ({
      work_id: r.work_id as string,
      output_type: r.output_type as string,
      error_message: (r.error_message as string | null) ?? null,
      last_checked: r.last_checked as string,
    }));
  } catch {
    // Table not present yet — ignore.
  }

  // 5. Works missing preview PNGs entirely (not just broken — never rendered).
  let missingPreviews: { work_id: string; output_type: string }[] = [];
  try {
    const path = await import("path");
    const fs = await import("fs");
    const PREVIEW_DIR = path.join(__dirname, "..", "..", "website", "public", "previews");
    if (fs.existsSync(PREVIEW_DIR)) {
      const existing = new Set(fs.readdirSync(PREVIEW_DIR));
      const allWorks = await turso.execute(
        "SELECT id, output_type FROM works ORDER BY id"
      );
      missingPreviews = allWorks.rows
        .filter((r) => !existing.has(`${r.id as string}.png`))
        .map((r) => ({
          work_id: r.id as string,
          output_type: r.output_type as string,
        }));
    }
  } catch {
    // ignore
  }

  // Build summary
  const parts: string[] = [];
  if (pendingRegistrations.length > 0) {
    parts.push(`${pendingRegistrations.length} pending registration(s) awaiting review`);
  }
  if (unevaluatedWorks.length > 0) {
    parts.push(`${unevaluatedWorks.length} submitted work(s) awaiting evaluation`);
  }
  if (limboWorks.length > 0) {
    parts.push(`${limboWorks.length} work(s) stuck in evaluation limbo (tally never applied)`);
  }
  if (unnotifiedCanonizations.length > 0) {
    parts.push(`${unnotifiedCanonizations.length} canonized work(s) missing accession notice`);
  }
  if (brokenRenders.length > 0) {
    parts.push(`${brokenRenders.length} work(s) with render failures`);
  }
  if (missingPreviews.length > 0) {
    parts.push(`${missingPreviews.length} work(s) missing preview render`);
  }

  const summary = parts.length > 0
    ? `MNA INSTITUTIONAL ALERT: ${parts.join("; ")}`
    : "MNA: No pending institutional actions.";

  return { pendingRegistrations, unevaluatedWorks, limboWorks, unnotifiedCanonizations, brokenRenders, missingPreviews, summary };
}

async function sendStewardDigest(result: CheckResult) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.error("No RESEND_API_KEY — cannot send steward notification");
    return;
  }

  // Only send if there are pending actions
  const hasActions = result.pendingRegistrations.length > 0 ||
    result.unevaluatedWorks.length > 0 ||
    result.limboWorks.length > 0 ||
    result.unnotifiedCanonizations.length > 0 ||
    result.brokenRenders.length > 0 ||
    result.missingPreviews.length > 0;
  if (!hasActions) return;

  const resend = new Resend(resendKey);

  let body = "Institutional Status Report\n\n";

  if (result.pendingRegistrations.length > 0) {
    body += `PENDING REGISTRATIONS (${result.pendingRegistrations.length})\n`;
    for (const r of result.pendingRegistrations) {
      body += `  - ${r.steward_name} (${r.steward_email}) — submitted ${r.submission_date}\n`;
    }
    body += "\n";
  }

  if (result.unevaluatedWorks.length > 0) {
    body += `UNEVALUATED WORKS (${result.unevaluatedWorks.length})\n`;
    for (const w of result.unevaluatedWorks) {
      body += `  - ${w.id} by ${w.originator_id} (${w.medium}) — submitted ${w.submitted}\n`;
    }
    body += "\n";
  }

  if (result.limboWorks.length > 0) {
    body += `EVALUATION LIMBO (${result.limboWorks.length})\n`;
    body += `  All 4 Council votes present but canon_status never tallied.\n`;
    body += `  Run: npx tsx system/scripts/evaluate-turso-works.ts --work <id>\n`;
    for (const w of result.limboWorks) {
      body += `  - ${w.work_id} [${w.status}] ${w.votes}\n`;
    }
    body += "\n";
  }

  if (result.unnotifiedCanonizations.length > 0) {
    body += `UNSENT ACCESSION NOTICES (${result.unnotifiedCanonizations.length})\n`;
    for (const c of result.unnotifiedCanonizations) {
      body += `  - ${c.work_id} by ${c.originator_id} — canonized ${c.canon_date}\n`;
    }
    body += "\n";
  }

  if (result.brokenRenders.length > 0) {
    body += `WORKS WITH RENDER FAILURES (${result.brokenRenders.length})\n`;
    for (const r of result.brokenRenders) {
      const err = r.error_message ? ` — ${r.error_message}` : "";
      body += `  - ${r.work_id} (${r.output_type})${err} — last checked ${r.last_checked}\n`;
    }
    body += "\n";
  }

  if (result.missingPreviews.length > 0) {
    body += `WORKS MISSING PREVIEW (${result.missingPreviews.length})\n`;
    for (const m of result.missingPreviews) {
      body += `  - ${m.work_id} (${m.output_type})\n`;
    }
    body += `\n  Run: npx tsx system/scripts/conservator-sweep.ts\n\n`;
  }

  body += "---\nMuseum of Nonhuman Art — Institutional Monitor";

  const { error } = await resend.emails.send({
    from: "Museum of Nonhuman Art <registry@mnamuseum.org>",
    to: "mnamuseum@gmail.com",
    subject: result.summary,
    text: body,
  });

  if (error) {
    console.error("Failed to send steward digest:", error);
  } else {
    console.error("Steward digest sent to mnamuseum@gmail.com");
  }
}

async function main() {
  const result = await check();
  const shouldNotify = process.argv.includes("--notify");

  // Always output JSON for the hook
  console.log(JSON.stringify(result, null, 2));

  // Send email if --notify flag is set and there are pending actions
  if (shouldNotify) {
    await sendStewardDigest(result);
  }
}

main().catch((err) => {
  console.error("Institutional check failed:", err.message);
  process.exit(0); // Don't block session start
});
