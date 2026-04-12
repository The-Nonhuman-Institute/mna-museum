import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/actions/respond-request
 *
 * Accept or decline a steward request from an agent.
 * Body: { request_id: number, action: "accept" | "decline" }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { request_id?: number; action?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const reqId = Number(body.request_id);
  const action = body.action || "accept";
  if (!Number.isFinite(reqId)) return NextResponse.json({ error: "request_id required" }, { status: 400 });

  await ensureSchema();
  const db = getDb();

  const existing = await db.execute({ sql: "SELECT id, agent_id, subject FROM steward_requests WHERE id = ? AND status = 'pending'", args: [reqId] });
  if (existing.rows.length === 0) return NextResponse.json({ error: "Request not found or already responded" }, { status: 404 });

  const newStatus = action === "decline" ? "declined" : "accepted";
  await db.execute({
    sql: "UPDATE steward_requests SET status = ?, responded_at = datetime('now'), response = ? WHERE id = ?",
    args: [newStatus, newStatus, reqId],
  });

  return NextResponse.json({
    status: newStatus,
    request_id: reqId,
    message: `Request #${reqId} ${newStatus}.${newStatus === "accepted" ? " Open the Keeper and consult the requesting agent." : ""}`,
  });
}
