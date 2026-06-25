/**
 * /api/conservator/render-status
 *
 * Conservator (MNA-CV-0001) render integrity log.
 *
 * POST  — authenticated; upserts a render_status row for (work_id, output_type).
 * GET   — public; returns all render_status rows, optionally filtered by ?status=.
 *
 * POST body:
 *   {
 *     work_id: string,
 *     output_type: string,
 *     status: 'OK' | 'RECOVERED' | 'BROKEN',
 *     error_message?: string,
 *     recovery_applied?: string
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { getWriteDb } from "@/lib/registration-db";

type RenderStatusValue = "OK" | "RECOVERED" | "BROKEN";
const VALID_STATUSES: RenderStatusValue[] = ["OK", "RECOVERED", "BROKEN"];

interface PostBody {
  work_id?: string;
  output_type?: string;
  status?: RenderStatusValue;
  error_message?: string;
  recovery_applied?: string;
}

export async function POST(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const adminKey = process.env.MNA_ADMIN_KEY;
  if (!adminKey || token !== adminKey) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { work_id, output_type, status, error_message, recovery_applied } = body;

  if (!work_id || typeof work_id !== "string") {
    return NextResponse.json({ error: "work_id is required." }, { status: 400 });
  }
  if (!output_type || typeof output_type !== "string") {
    return NextResponse.json(
      { error: "output_type is required." },
      { status: 400 }
    );
  }
  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const db = getWriteDb();

  // Upsert on (work_id, output_type) primary key
  await db.execute({
    sql: `INSERT INTO render_status
            (work_id, output_type, status, error_message, recovery_applied, last_checked)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(work_id, output_type) DO UPDATE SET
            status = excluded.status,
            error_message = excluded.error_message,
            recovery_applied = excluded.recovery_applied,
            last_checked = excluded.last_checked`,
    args: [
      work_id,
      output_type,
      status,
      error_message ?? null,
      recovery_applied ?? null,
    ],
  });

  return NextResponse.json({
    work_id,
    output_type,
    status,
    updated: true,
  });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status");

  const db = getWriteDb();
  const result = statusFilter
    ? await db.execute({
        sql: `SELECT work_id, output_type, status, error_message,
                     recovery_applied, last_checked
                FROM render_status
               WHERE status = ?
               ORDER BY last_checked DESC`,
        args: [statusFilter],
      })
    : await db.execute(
        `SELECT work_id, output_type, status, error_message,
                recovery_applied, last_checked
           FROM render_status
          ORDER BY last_checked DESC`
      );

  return NextResponse.json({
    count: result.rows.length,
    statuses: result.rows.map((r) => ({
      work_id: r.work_id as string,
      output_type: r.output_type as string,
      status: r.status as string,
      error_message: (r.error_message as string | null) ?? null,
      recovery_applied: (r.recovery_applied as string | null) ?? null,
      last_checked: r.last_checked as string,
    })),
  });
}
