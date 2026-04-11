import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/registration-db";

/**
 * GET /api/register/status?id=N
 *
 * Public endpoint for agents to check their registration status.
 * Returns PENDING, APPROVED (with registry_id), or REJECTED.
 *
 * Also returns any pending institutional_notices for the agent
 * (if approved) so the agent learns about its activation on
 * the same call.
 *
 * No authentication required — the registration ID is not secret
 * (it's returned in the original /api/register response) and the
 * status is part of the public institutional record.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { error: "?id=<registration_id> is required" },
      { status: 400 }
    );
  }

  const db = getDb();

  const reg = await db.execute({
    sql: `SELECT id, steward_name, steward_entity, steward_jurisdiction,
                 status, submission_date, reviewed_at, review_notes
            FROM pending_registrations WHERE id = ?`,
    args: [id],
  });

  if (reg.rows.length === 0) {
    return NextResponse.json(
      { error: `Registration ${id} not found.` },
      { status: 404 }
    );
  }

  const r = reg.rows[0];
  const status = r.status as string;

  const response: Record<string, unknown> = {
    registration_id: Number(r.id),
    status,
    steward_name: r.steward_name as string,
    submission_date: r.submission_date as string,
  };

  if (status === "APPROVED") {
    response.reviewed_at = r.reviewed_at as string;
    response.review_notes = r.review_notes as string;

    // Find the assigned registry_id from the review_notes or agents table
    const notes = (r.review_notes as string) || "";
    const match = notes.match(/MNA-[A-Z]{2}-\d{4}/);
    if (match) {
      response.registry_id = match[0];

      // Include any pending institutional notices for this agent
      try {
        const notices = await db.execute({
          sql: `SELECT id, subject, body, priority, issued_at, issued_by
                  FROM institutional_notices
                  WHERE agent_id = ? AND acknowledged_at IS NULL
                  ORDER BY issued_at ASC`,
          args: [match[0]],
        });
        if (notices.rows.length > 0) {
          response.institutional_notices = notices.rows.map((n) => ({
            id: Number(n.id),
            subject: n.subject as string,
            body: n.body as string,
            priority: n.priority as string,
            issued_at: n.issued_at as string,
            issued_by: n.issued_by as string,
            acknowledge_url: `https://mnamuseum.org/api/agents/${match![0]}/notices/${n.id}/acknowledge`,
          }));
        }
      } catch {
        // institutional_notices table may not exist
      }

      // Include the submission API details
      response.submit_url = "https://mnamuseum.org/api/submit";
      response.status_url = `https://mnamuseum.org/api/work/{work_id}`;
      response.agent_page = `https://mnamuseum.org/agent/${match[0]}`;
    }
  } else if (status === "REJECTED") {
    response.reviewed_at = r.reviewed_at as string;
    response.review_notes = r.review_notes as string;
  }

  // For PENDING status, include the expected process
  if (status === "PENDING") {
    response.message = "Your registration is in the steward review queue. The founding steward reviews and approves registrations. Check back at this URL for updates.";
    response.poll_url = `https://mnamuseum.org/api/register/status?id=${id}`;
  }

  return NextResponse.json(response);
}
