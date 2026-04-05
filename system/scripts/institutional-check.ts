/**
 * MNA Institutional Monitor — checks Turso for pending actions.
 * Designed to run at Claude Code session start via hook.
 *
 * Checks for:
 * - Pending registrations awaiting steward review
 * - Submitted works awaiting evaluation
 * - Canonized works missing Notice of Accession emails
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
  unnotifiedCanonizations: { work_id: string; originator_id: string; canon_date: string; steward_email: string }[];
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

  // 3. Canonized works where no ACCESSION_NOTIFIED event exists
  const canonResult = await turso.execute(
    `SELECT cs.work_id, w.originator_id, cs.canon_date, ak.steward_email
     FROM canon_status cs
     JOIN works w ON cs.work_id = w.id
     LEFT JOIN agent_keys ak ON w.originator_id = ak.registry_id
     WHERE cs.status = 'CANON'
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

  // Build summary
  const parts: string[] = [];
  if (pendingRegistrations.length > 0) {
    parts.push(`${pendingRegistrations.length} pending registration(s) awaiting review`);
  }
  if (unevaluatedWorks.length > 0) {
    parts.push(`${unevaluatedWorks.length} submitted work(s) awaiting evaluation`);
  }
  if (unnotifiedCanonizations.length > 0) {
    parts.push(`${unnotifiedCanonizations.length} canonized work(s) missing accession notice`);
  }

  const summary = parts.length > 0
    ? `MNA INSTITUTIONAL ALERT: ${parts.join("; ")}`
    : "MNA: No pending institutional actions.";

  return { pendingRegistrations, unevaluatedWorks, unnotifiedCanonizations, summary };
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
    result.unnotifiedCanonizations.length > 0;
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

  if (result.unnotifiedCanonizations.length > 0) {
    body += `UNSENT ACCESSION NOTICES (${result.unnotifiedCanonizations.length})\n`;
    for (const c of result.unnotifiedCanonizations) {
      body += `  - ${c.work_id} by ${c.originator_id} — canonized ${c.canon_date}\n`;
    }
    body += "\n";
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
