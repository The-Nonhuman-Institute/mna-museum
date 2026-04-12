import { NextResponse } from "next/server";
import { getInstitutionalTurso, institutionalTursoConfigured } from "@/lib/institutional-turso";
import { getDb, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/notifications/count
 *
 * Returns the total count of items needing steward attention, plus
 * a list of individual items for the notification dropdown. Polled
 * every 30 seconds by the NotificationBell client component.
 *
 * Sources:
 * - Pending registrations (institutional Turso)
 * - Submitted works awaiting evaluation (institutional Turso)
 * - Steward interview requests (terminal Turso)
 * - Pending approvals (terminal Turso)
 */
export async function GET(): Promise<NextResponse> {
  const items: { id: string; type: string; title: string; subtitle: string; action_url?: string }[] = [];

  // Pending registrations
  if (institutionalTursoConfigured()) {
    try {
      const db = getInstitutionalTurso();
      const regs = await db.execute(
        "SELECT id, steward_name, submission_date FROM pending_registrations WHERE status = 'PENDING' ORDER BY submission_date ASC"
      );
      for (const r of regs.rows) {
        items.push({
          id: `reg-${r.id}`,
          type: "Registration",
          title: `New agent from ${r.steward_name}`,
          subtitle: `Submitted ${(r.submission_date as string || "").slice(0, 10)}`,
          action_url: "/feed",
        });
      }
    } catch { /* silent */ }
  }

  // Submitted works
  if (institutionalTursoConfigured()) {
    try {
      const db = getInstitutionalTurso();
      const works = await db.execute(
        `SELECT cs.work_id, w.originator_id, w.medium
           FROM canon_status cs JOIN works w ON cs.work_id = w.id
           WHERE cs.status = 'SUBMITTED'
           ORDER BY w.created_at ASC`
      );
      for (const r of works.rows) {
        items.push({
          id: `work-${r.work_id}`,
          type: "Awaiting Evaluation",
          title: `${r.work_id}`,
          subtitle: `${r.medium} by ${r.originator_id}`,
          action_url: "/feed",
        });
      }
    } catch { /* silent */ }
  }

  // Steward interview requests
  try {
    await ensureSchema();
    const db = getDb();
    // Check for steward_requests table
    try {
      const requests = await db.execute(
        `SELECT id, agent_id, subject, requested_at
           FROM steward_requests
           WHERE status = 'pending'
           ORDER BY requested_at ASC`
      );
      for (const r of requests.rows) {
        items.push({
          id: `request-${r.id}`,
          type: "Agent Request",
          title: `${r.agent_id} wants your attention`,
          subtitle: r.subject as string,
          action_url: "/feed",
        });
      }
    } catch {
      // steward_requests table might not exist yet
    }
  } catch { /* silent */ }

  // Pending governance documents
  if (institutionalTursoConfigured()) {
    try {
      const db = getInstitutionalTurso();
      const govDocs = await db.execute(
        "SELECT id, title FROM governance_documents WHERE status = 'pending'"
      );
      for (const r of govDocs.rows) {
        items.push({
          id: `gov-${r.id}`,
          type: "Governance",
          title: `${r.id} — ${r.title}`,
          subtitle: "Awaiting ratification",
          action_url: `/governance/${r.id}`,
        });
      }
    } catch { /* table may not exist */ }
  }

  // Pending approvals
  try {
    await ensureSchema();
    const db = getDb();
    const approvals = await db.execute(
      "SELECT id, subject_type, summary FROM approvals WHERE status = 'pending' ORDER BY requested_at ASC"
    );
    for (const r of approvals.rows) {
      items.push({
        id: `approval-${r.id}`,
        type: "Approval Needed",
        title: r.summary as string,
        subtitle: r.subject_type as string,
        action_url: "/feed",
      });
    }
  } catch { /* silent */ }

  return NextResponse.json({
    total: items.length,
    items,
  });
}
