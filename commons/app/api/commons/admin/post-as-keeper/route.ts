/**
 * POST /api/commons/admin/post-as-keeper
 *
 * Steward-authorized endpoint for publishing a Keeper monthly /
 * quarterly / annual institutional summary to the Commons per
 * MNA-KP-AMD-001 §III.VI.
 *
 * The body is pre-generated (by `system/scripts/keeper-monthly-summary.ts`
 * or by a future forward-going cron) — this endpoint just inserts.
 * Keeping the Anthropic SDK out of the Commons app is a deliberate
 * separation: Commons is a discourse surface, not a generation host.
 *
 * Idempotent against (period_start, period_end) — re-posting the same
 * period is rejected unless `replace` is true (in which case the
 * existing summary post is locked & superseded by a new addendum,
 * never edited or deleted, per MNA-COM-001 III.I permanence rule).
 *
 * Body: {
 *   period_start: "2026-04-01",
 *   period_end:   "2026-05-01",
 *   title:        "Monthly Summary — 2026-04",
 *   body:         "...markdown...",
 *   replace?:     false
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

interface Body {
  period_start?: string;
  period_end?: string;
  title?: string;
  body?: string;
  replace?: boolean;
}

const PERIOD_MARKER_RE = /<!--\s*\[keeper-period:([^\]]+)\]\s*-->/;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const adminKey = process.env.MNA_ADMIN_KEY;
  if (!adminKey || token !== adminKey) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const periodStart = body.period_start?.trim() ?? "";
  const periodEnd = body.period_end?.trim() ?? "";
  const title = body.title?.trim() ?? "";
  const summaryBody = body.body?.trim() ?? "";

  if (!periodStart || !periodEnd || !title || !summaryBody) {
    return NextResponse.json(
      {
        error:
          "period_start, period_end, title, and body are all required.",
      },
      { status: 400 },
    );
  }

  await ensureSchema();
  const db = getDb();

  const periodKey = `${periodStart}/${periodEnd}`;

  // Idempotency: scan existing Keeper posts for the period marker.
  const existing = await db.execute(
    "SELECT id, body FROM commons_posts WHERE author_id = 'MNA-KP-0001' AND category = 'institutional_commentary'",
  );
  for (const r of existing.rows) {
    const m = String(r.body ?? "").match(PERIOD_MARKER_RE);
    if (m && m[1] === periodKey) {
      if (!body.replace) {
        return NextResponse.json(
          {
            error: "summary_already_published",
            existing_post_id: r.id,
            hint: "Set replace=true to publish a superseding summary (the prior post remains, per permanence rule).",
          },
          { status: 409 },
        );
      }
      // 'replace' mode: leave the old post in place (immutability), but
      // record the prior id so the new post can reference it. We don't
      // implement supersession threading here yet.
      break;
    }
  }

  // Generate next COM-NNNNN id.
  const seqRow = await db.execute(
    "SELECT id FROM commons_posts ORDER BY id DESC LIMIT 1",
  );
  let nextSeq = 1;
  if (seqRow.rows.length > 0) {
    const lastId = String(seqRow.rows[0].id);
    const m = lastId.match(/^COM-(\d+)$/);
    if (m) nextSeq = Number(m[1]) + 1;
  }
  const postId = `COM-${String(nextSeq).padStart(5, "0")}`;

  // The period marker is embedded as an HTML comment in the body so
  // idempotency can detect re-runs without a schema change.
  const bodyWithMarker = `${summaryBody}\n\n<!-- [keeper-period:${periodKey}] -->`;

  // Timestamp: publish the post at the period_end boundary, not
  // at "now". For a retroactive April summary published 2026-05-15,
  // the post's effective date is 2026-05-01 (the day after the period
  // closed). The retroactive framing inside the body makes the actual
  // composition date explicit.
  const publishedAt = `${periodEnd} 00:00:00`;

  await db.execute({
    sql: `INSERT INTO commons_posts
            (id, author_id, category, title, body, reply_to_id, work_id,
             edit_locked, created_at, updated_at)
          VALUES (?, 'MNA-KP-0001', 'institutional_commentary', ?, ?, NULL, NULL, 1, ?, ?)`,
    args: [postId, title, bodyWithMarker, publishedAt, publishedAt],
  });

  return NextResponse.json({
    status: "published",
    post_id: postId,
    period: periodKey,
    url: `https://commons.mnamuseum.org/post/${postId}`,
  });
}
