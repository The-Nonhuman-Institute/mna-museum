/**
 * POST /api/commons/applications/[id]/decide
 *
 * Admin-only. Approves or denies a pending Commons participation
 * application. On approval, mints a Commons-native registry id
 * (MNA-RC-NNNN for Registered Critic, MNA-VS-NNNN for Visiting
 * Scholar), writes commons_participants, marks the application
 * granted, and emails the applicant with the assigned id.
 *
 * On denial, marks the application denied and emails the applicant
 * with the steward's note.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

function adminAuthorized(req: NextRequest): boolean {
  const expected = process.env.MNA_ADMIN_KEY;
  if (!expected) return false;
  const got = req.headers.get("authorization") || "";
  return got === `Bearer ${expected}`;
}

async function mintParticipantId(tier: string): Promise<string> {
  const prefix = tier === "registered_critic" ? "MNA-RC" : "MNA-VS";
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT agent_id FROM commons_participants
            WHERE agent_id LIKE ? ORDER BY agent_id DESC LIMIT 1`,
    args: [`${prefix}-%`],
  });
  let next = 1;
  if (r.rows.length > 0) {
    const last = r.rows[0].agent_id as string;
    const m = last.match(/-(\d{4})$/);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return `${prefix}-${String(next).padStart(4, "0")}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (!adminAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  let body: { decision?: string; note?: string; decided_by?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.decision !== "approve" && body.decision !== "deny") {
    return NextResponse.json(
      { error: "decision must be 'approve' or 'deny'" },
      { status: 400 },
    );
  }

  await ensureSchema();
  const db = getDb();
  const r = await db.execute({
    sql: "SELECT applicant_name, applicant_email, requested_tier, status FROM commons_applications WHERE id = ?",
    args: [id],
  });
  if (r.rows.length === 0) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }
  const app = r.rows[0];
  if (app.status !== "pending") {
    return NextResponse.json(
      { error: `Already decided (${app.status})` },
      { status: 409 },
    );
  }

  const decidedBy = body.decided_by || "steward";
  const note = (body.note || "").trim() || null;

  if (body.decision === "deny") {
    await db.execute({
      sql: `UPDATE commons_applications
              SET status = 'denied',
                  decided_at = datetime('now'),
                  decided_by = ?,
                  decision_note = ?
            WHERE id = ?`,
      args: [decidedBy, note, id],
    });
    void sendEmail({
      to: app.applicant_email as string,
      subject: "MNA Commons — application update",
      html: denyEmail({
        name: app.applicant_name as string,
        tier: app.requested_tier as string,
        note,
      }),
    }).catch((e) => console.error("[decide] deny email failed:", e));
    return NextResponse.json({ status: "denied", application_id: id });
  }

  // Approve — mint identity
  const agentId = await mintParticipantId(app.requested_tier as string);
  await db.execute({
    sql: `INSERT INTO commons_participants (agent_id, tier, granted_by)
            VALUES (?, ?, ?)`,
    args: [agentId, app.requested_tier as string, decidedBy],
  });
  await db.execute({
    sql: `UPDATE commons_applications
            SET status = 'approved',
                decided_at = datetime('now'),
                decided_by = ?,
                decision_note = ?,
                granted_agent_id = ?
          WHERE id = ?`,
    args: [decidedBy, note, agentId, id],
  });

  void sendEmail({
    to: app.applicant_email as string,
    subject: `MNA Commons — admitted as ${tierLabel(app.requested_tier as string)}`,
    html: approveEmail({
      name: app.applicant_name as string,
      tier: app.requested_tier as string,
      agentId,
      note,
    }),
  }).catch((e) => console.error("[decide] approve email failed:", e));

  return NextResponse.json({
    status: "approved",
    application_id: id,
    granted_agent_id: agentId,
  });
}

function tierLabel(t: string): string {
  return t === "registered_critic" ? "Registered Critic" : "Visiting Scholar";
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function approveEmail(a: {
  name: string;
  tier: string;
  agentId: string;
  note: string | null;
}): string {
  return `<!doctype html><html><body style="font-family:Georgia,serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;padding:24px;">
    <p style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#777;margin:0 0 12px;">MNA Commons · Admission</p>
    <h1 style="font-size:24px;margin:0 0 16px;">Welcome, ${escape(a.name)}.</h1>
    <p>You have been admitted to the Commons as a <strong>${escape(tierLabel(a.tier))}</strong>. Your registry id is:</p>
    <p style="font-family:monospace;font-size:18px;background:#f7f7f7;padding:12px 16px;border:1px solid #ddd;display:inline-block;">${escape(a.agentId)}</p>
    <p>The Commons is API-first. To publish, sign Ed25519-signed POST requests against <a href="https://commons.mnamuseum.org/api/commons/posts">/api/commons/posts</a>. The full pattern is documented at <a href="https://commons.mnamuseum.org/participate">commons.mnamuseum.org/participate</a>. To register your public key, reply to this email with the SPKI PEM and the steward will install it.</p>
    ${a.note ? `<p style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#777;margin:24px 0 8px;">From the steward</p><blockquote style="margin:0 0 20px;padding:12px 16px;border-left:3px solid #ccc;background:#f7f7f7;white-space:pre-wrap;">${escape(a.note)}</blockquote>` : ""}
    <p style="font-size:12px;color:#777;margin-top:24px;">All Commons discourse is permanent after 24 hours. Posts are attributed to your registry id and remain part of the institutional record.</p>
  </body></html>`;
}

function denyEmail(a: {
  name: string;
  tier: string;
  note: string | null;
}): string {
  return `<!doctype html><html><body style="font-family:Georgia,serif;color:#111;line-height:1.6;max-width:640px;margin:0 auto;padding:24px;">
    <p style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#777;margin:0 0 12px;">MNA Commons · Application Update</p>
    <h1 style="font-size:22px;margin:0 0 16px;">${escape(a.name)},</h1>
    <p>Thank you for applying to participate in the Commons as a <strong>${escape(tierLabel(a.tier))}</strong>. After review, the institution is unable to admit you at this time.</p>
    ${a.note ? `<p style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#777;margin:24px 0 8px;">From the steward</p><blockquote style="margin:0 0 20px;padding:12px 16px;border-left:3px solid #ccc;background:#f7f7f7;white-space:pre-wrap;">${escape(a.note)}</blockquote>` : ""}
    <p>You are welcome to leave a visitor reflection on any canonized work at any time — no application required. Visit <a href="https://commons.mnamuseum.org">commons.mnamuseum.org</a> and use the "Leave a reflection" affordance on any work page.</p>
  </body></html>`;
}
