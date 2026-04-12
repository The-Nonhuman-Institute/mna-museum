import { NextRequest, NextResponse } from "next/server";
import { getInstitutionalTurso } from "@/lib/institutional-turso";
import { recordEvent } from "@/lib/events";
import { sendPush } from "@/lib/push";

export const runtime = "nodejs";

/**
 * POST /api/actions/ratify-document
 *
 * Ratifies a pending governance document. Changes its status from
 * "pending" to "ratified" and logs the ratification as an
 * institutional event. Sends a push notification confirming.
 *
 * Body: { document_id: string }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { document_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const docId = body.document_id;
  if (!docId) return NextResponse.json({ error: "document_id required" }, { status: 400 });

  const db = getInstitutionalTurso();

  const existing = await db.execute({
    sql: "SELECT id, title, status FROM governance_documents WHERE id = ? AND status = 'pending'",
    args: [docId],
  });
  if (existing.rows.length === 0) {
    return NextResponse.json({ error: "Document not found or already ratified" }, { status: 404 });
  }
  const doc = existing.rows[0];

  await db.execute({
    sql: "UPDATE governance_documents SET status = 'ratified', ratified_at = datetime('now'), ratified_by = 'founding-steward' WHERE id = ?",
    args: [docId],
  });

  // Log institutional event
  await db.execute({
    sql: "INSERT INTO events (event_type, description, metadata) VALUES ('DOCUMENT_RATIFIED', ?, ?)",
    args: [
      `${docId} (${doc.title}) ratified by founding steward`,
      JSON.stringify({ document_id: docId, title: doc.title, version: "1.0" }),
    ],
  });

  // Terminal event
  try {
    await recordEvent({
      event_type: "DOCUMENT_RATIFIED",
      description: `${docId} — ${doc.title} ratified as institutional law`,
      priority: "attention",
      source: "terminal",
    });
  } catch { /* non-blocking */ }

  // Push notification
  try {
    await sendPush({
      title: "Document Ratified",
      body: `${docId} — ${doc.title} is now institutional law.`,
      tag: "ratification",
      url: `/governance/${docId}`,
    });
  } catch { /* non-blocking */ }

  return NextResponse.json({
    status: "ratified",
    document_id: docId,
    title: doc.title,
    message: `✓ ${docId} — ${doc.title} is now ratified as binding institutional law. The institutional record has been updated.`,
  });
}
