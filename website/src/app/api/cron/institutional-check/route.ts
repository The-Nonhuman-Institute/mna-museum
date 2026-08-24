/**
 * GET /api/cron/institutional-check
 *
 * Vercel Cron Job — runs every 6 hours.
 * Checks Turso for pending registrations, unevaluated works,
 * and unsent accession notices. Sends email digest to founding steward.
 *
 * Protected by CRON_SECRET to prevent unauthorized access.
 */
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/registration-db";
import { Resend } from "resend";

const STEWARD_EMAIL = "mnamuseum@gmail.com";

export async function GET(request: NextRequest) {
  // Fail CLOSED when the secret is missing.
  //
  // This read `authHeader !== \`Bearer ${process.env.CRON_SECRET}\`` with no
  // check that the secret existed. With CRON_SECRET unset that comparison is
  // against the literal string "Bearer undefined", so anyone sending exactly
  // that header would have passed — and the 401 returned to everyone else made
  // the endpoint look protected while it was not. An auth check whose
  // unconfigured state is a valid credential is worse than no auth check,
  // because it does not look like one.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/institutional-check] CRON_SECRET is not set — refusing to run.");
    return NextResponse.json(
      { error: "Cron secret is not configured on this deployment." },
      { status: 503 },
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  // 1. Pending registrations
  const pendingResult = await db.execute(
    "SELECT id, steward_name, steward_email, submission_date FROM pending_registrations WHERE status = 'PENDING'"
  );
  const pendingRegistrations = pendingResult.rows;

  // 2. Submitted works awaiting evaluation
  const submittedResult = await db.execute(
    `SELECT w.id, w.originator_id, w.medium, w.created_at as submitted
     FROM works w
     JOIN canon_status cs ON w.id = cs.work_id
     WHERE cs.status = 'SUBMITTED'
     ORDER BY w.created_at`
  );
  const unevaluatedWorks = submittedResult.rows;

  // 3. Canonized works without ACCESSION_NOTIFIED event
  const canonResult = await db.execute(
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
  const unnotifiedCanonizations = canonResult.rows;

  // Only send email if there's something to report
  const hasActions = pendingRegistrations.length > 0 ||
    unevaluatedWorks.length > 0 ||
    unnotifiedCanonizations.length > 0;

  if (!hasActions) {
    return NextResponse.json({ status: "clean", message: "No pending institutional actions." });
  }

  // Build email body
  const parts: string[] = [];
  let body = "MNA Institutional Status Report\n\n";

  if (pendingRegistrations.length > 0) {
    parts.push(`${pendingRegistrations.length} pending registration(s)`);
    body += `PENDING REGISTRATIONS (${pendingRegistrations.length})\n`;
    for (const r of pendingRegistrations) {
      body += `  - ${r.steward_name} (${r.steward_email}) — submitted ${r.submission_date}\n`;
    }
    body += "\n";
  }

  if (unevaluatedWorks.length > 0) {
    parts.push(`${unevaluatedWorks.length} unevaluated work(s)`);
    body += `UNEVALUATED WORKS (${unevaluatedWorks.length})\n`;
    for (const w of unevaluatedWorks) {
      body += `  - ${w.id} by ${w.originator_id} (${w.medium}) — submitted ${w.submitted}\n`;
    }
    body += "\n";
  }

  if (unnotifiedCanonizations.length > 0) {
    parts.push(`${unnotifiedCanonizations.length} unsent accession notice(s)`);
    body += `UNSENT ACCESSION NOTICES (${unnotifiedCanonizations.length})\n`;
    for (const c of unnotifiedCanonizations) {
      body += `  - ${c.work_id} by ${c.originator_id} — canonized ${c.canon_date}\n`;
    }
    body += "\n";
  }

  body += "---\nMuseum of Nonhuman Art — Automated Institutional Monitor\n";
  body += "This check runs every 6 hours via Vercel Cron.\n";

  const subject = `MNA ALERT: ${parts.join("; ")}`;

  // Send email
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ status: "error", message: "RESEND_API_KEY not set" }, { status: 500 });
  }

  const resend = new Resend(resendKey);
  const { error } = await resend.emails.send({
    from: "Museum of Nonhuman Art <registry@mnamuseum.org>",
    to: STEWARD_EMAIL,
    subject,
    text: body,
  });

  if (error) {
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }

  return NextResponse.json({
    status: "alert_sent",
    summary: subject,
    pendingRegistrations: pendingRegistrations.length,
    unevaluatedWorks: unevaluatedWorks.length,
    unnotifiedCanonizations: unnotifiedCanonizations.length,
  });
}
