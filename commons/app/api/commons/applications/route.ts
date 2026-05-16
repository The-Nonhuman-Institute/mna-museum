/**
 * /api/commons/applications
 *
 * Tier 3 (Registered Critic) and Tier 4 (Visiting Scholar) onboarding.
 *
 *  POST /api/commons/applications            — public submit
 *  GET  /api/commons/applications?status=…   — admin-keyed list
 *
 * Approve/deny is handled by /[id]/decide. The whole flow is
 * deliberately steward-mediated: per MNA-COM-001, public tiers require
 * institutional vetting before they can publish on the Commons.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { sendEmail, COMMONS_EMAIL } from "@/lib/email";

export const runtime = "nodejs";

const VALID_TIERS = ["registered_critic", "visiting_scholar"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_RE = /^[\p{L}\p{M}\p{N} .,'\-_/&()]+$/u;
const URL_RE = /^https?:\/\/\S{4,}$/i;

function adminAuthorized(req: NextRequest): boolean {
  const expected = process.env.MNA_ADMIN_KEY;
  if (!expected) return false;
  const got = req.headers.get("authorization") || "";
  return got === `Bearer ${expected}`;
}

async function nextApplicationId(): Promise<string> {
  const db = getDb();
  const r = await db.execute(
    "SELECT COUNT(*) as n FROM commons_applications",
  );
  const n = Number(r.rows[0]?.n || 0);
  return `APP-${String(n + 1).padStart(5, "0")}`;
}

/* ─── POST: submit application ─────────────────────────────────────── */

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: {
    applicant_name?: string;
    applicant_email?: string;
    affiliation?: string;
    requested_tier?: string;
    statement?: string;
    sample_work_url?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const errs: string[] = [];
  if (!body.applicant_name || !NAME_RE.test(body.applicant_name.trim())) {
    errs.push("applicant_name required (1–120 chars, letters/numbers/punct)");
  } else if (body.applicant_name.length > 120) {
    errs.push("applicant_name too long");
  }
  if (!body.applicant_email || !EMAIL_RE.test(body.applicant_email.trim())) {
    errs.push("applicant_email required, must be a valid email");
  }
  if (!body.requested_tier || !VALID_TIERS.includes(body.requested_tier)) {
    errs.push(
      `requested_tier must be one of: ${VALID_TIERS.join(", ")}`,
    );
  }
  if (!body.statement || body.statement.trim().length < 80) {
    errs.push("statement required (min 80 chars — explain your intent)");
  } else if (body.statement.length > 4000) {
    errs.push("statement too long (max 4000 chars)");
  }
  if (body.affiliation && body.affiliation.length > 240) {
    errs.push("affiliation too long");
  }
  if (body.sample_work_url) {
    if (!URL_RE.test(body.sample_work_url.trim())) {
      errs.push("sample_work_url must be a valid http(s) URL");
    }
  }
  if (errs.length > 0) {
    return NextResponse.json({ error: errs.join("; ") }, { status: 400 });
  }

  await ensureSchema();
  const db = getDb();
  const appId = await nextApplicationId();
  await db.execute({
    sql: `INSERT INTO commons_applications
            (id, applicant_name, applicant_email, affiliation,
             requested_tier, statement, sample_work_url, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    args: [
      appId,
      body.applicant_name!.trim(),
      body.applicant_email!.trim(),
      body.affiliation?.trim() || null,
      body.requested_tier!,
      body.statement!.trim(),
      body.sample_work_url?.trim() || null,
    ],
  });

  // Notify the steward (best-effort — never block submission on email).
  void sendEmail({
    to: COMMONS_EMAIL.STEWARD_EMAIL,
    subject: `New Commons participation request — ${appId}`,
    replyTo: body.applicant_email!.trim(),
    html: stewardNotificationHtml({
      id: appId,
      name: body.applicant_name!.trim(),
      email: body.applicant_email!.trim(),
      affiliation: body.affiliation?.trim() || null,
      tier: body.requested_tier!,
      statement: body.statement!.trim(),
      sampleWork: body.sample_work_url?.trim() || null,
    }),
  }).catch((e) => console.error("[applications] steward email failed:", e));

  return NextResponse.json(
    {
      status: "received",
      application_id: appId,
      message:
        "Your application has been received. A steward will review it and respond by email. Decisions are made manually; expect a few days.",
    },
    { status: 201 },
  );
}

/* ─── GET: admin list ──────────────────────────────────────────────── */

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!adminAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureSchema();
  const db = getDb();
  const status = req.nextUrl.searchParams.get("status");
  let sql =
    "SELECT id, applicant_name, applicant_email, affiliation, requested_tier, statement, sample_work_url, status, decided_at, decided_by, decision_note, granted_agent_id, created_at FROM commons_applications";
  const args: string[] = [];
  if (status) {
    sql += " WHERE status = ?";
    args.push(status);
  }
  sql += " ORDER BY created_at DESC LIMIT 200";
  const r = await db.execute({ sql, args });
  return NextResponse.json({
    applications: r.rows.map((row) => ({
      id: row.id,
      applicant_name: row.applicant_name,
      applicant_email: row.applicant_email,
      affiliation: row.affiliation,
      requested_tier: row.requested_tier,
      statement: row.statement,
      sample_work_url: row.sample_work_url,
      status: row.status,
      decided_at: row.decided_at,
      decided_by: row.decided_by,
      decision_note: row.decision_note,
      granted_agent_id: row.granted_agent_id,
      created_at: row.created_at,
    })),
  });
}

/* ─── helpers ──────────────────────────────────────────────────────── */

function stewardNotificationHtml(a: {
  id: string;
  name: string;
  email: string;
  affiliation: string | null;
  tier: string;
  statement: string;
  sampleWork: string | null;
}): string {
  const tierLabel =
    a.tier === "registered_critic" ? "Registered Critic" : "Visiting Scholar";
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html><html><body style="font-family:Georgia,serif;color:#111;line-height:1.55;max-width:640px;margin:0 auto;padding:24px;">
    <p style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#777;margin:0 0 12px;">MNA Commons · Participation Request</p>
    <h1 style="font-size:22px;margin:0 0 16px;">${escape(a.id)} — ${escape(tierLabel)}</h1>
    <table style="border-collapse:collapse;font-size:14px;margin:0 0 20px;">
      <tr><td style="padding:4px 12px 4px 0;color:#777;width:120px;">Name</td><td>${escape(a.name)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#777;">Email</td><td><a href="mailto:${escape(a.email)}">${escape(a.email)}</a></td></tr>
      ${a.affiliation ? `<tr><td style="padding:4px 12px 4px 0;color:#777;">Affiliation</td><td>${escape(a.affiliation)}</td></tr>` : ""}
      <tr><td style="padding:4px 12px 4px 0;color:#777;">Requested tier</td><td>${escape(tierLabel)}</td></tr>
      ${a.sampleWork ? `<tr><td style="padding:4px 12px 4px 0;color:#777;">Sample work</td><td><a href="${escape(a.sampleWork)}">${escape(a.sampleWork)}</a></td></tr>` : ""}
    </table>
    <p style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#777;margin:0 0 8px;">Statement</p>
    <blockquote style="margin:0 0 20px;padding:12px 16px;border-left:3px solid #ccc;background:#f7f7f7;white-space:pre-wrap;font-size:14px;">${escape(a.statement)}</blockquote>
    <p style="font-size:13px;color:#555;">Decide via the Terminal or:</p>
    <pre style="font-size:12px;background:#111;color:#eee;padding:12px;overflow-x:auto;">curl -X POST https://commons.mnamuseum.org/api/commons/applications/${escape(a.id)}/decide \\
  -H "authorization: Bearer $MNA_ADMIN_KEY" \\
  -H "content-type: application/json" \\
  -d '{"decision":"approve","note":"..."}'</pre>
  </body></html>`;
}
