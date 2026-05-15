/**
 * POST /api/commons/admin/backfill-curatorial-decisions
 *
 * Steward-authorized institutional migration. Mirrors every row from
 * the institutional Turso's `curatorial_decisions` table into the
 * Commons as category=institutional_commentary posts authored by the
 * Curator (MNA-CU-0001), per MNA-CU-AMD-001 §IV.VI.
 *
 * The Curator's rationale already lives in the institutional record.
 * This endpoint formats those rationales as Commons posts with
 * honest retroactive framing per §IV.VI.III ("On reviewing the
 * decision record on [date], I write this commentary on a decision
 * committed on [decision_date]").
 *
 * Idempotent — won't re-mirror a (decision_id, author) pair already
 * published. dry_run defaults to true.
 *
 * Body: { dry_run: boolean, limit?: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { getInstitutionalTurso } from "@/lib/institutional-turso";

export const runtime = "nodejs";
export const maxDuration = 60;

interface BackfillBody {
  dry_run?: boolean;
  limit?: number;
}

interface PlannedPost {
  source_id: number;
  post_id: string;
  work_id: string | null;
  title: string;
  decided_at: string;
  body_chars: number;
  body_excerpt: string;
}

const DECISION_TYPE_LABEL: Record<string, string> = {
  FEATURE_CHAMBER: "The Chamber",
  FEATURE_SOLO: "Solo Exhibition Hall",
  FEATURE_SOLO_EXHIBITION: "Solo Exhibition Hall",
  GALLERY_ASSIGNMENT: "Gallery Assignment",
  GROUP_EXHIBITION: "Themed Exhibition",
  SPATIAL_MODIFICATION: "Spatial Modification",
};

const RETROACTIVE_DATE = "2026-05-15"; // amendment ratification date

function formatYmd(iso: string): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : iso;
}

function parseWorkIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function synthesizeTitle(
  decisionType: string,
  exhibitionTitle: string | null,
  primaryWorkTitle: string | null,
  primaryWorkId: string | null,
  originatorName: string | null,
  targetSpace: string | null,
): string {
  const typeLabel = DECISION_TYPE_LABEL[decisionType] ?? "Curatorial Decision";

  switch (decisionType) {
    case "FEATURE_CHAMBER":
      if (primaryWorkTitle) return `The Chamber — ${primaryWorkTitle}`;
      if (primaryWorkId) return `The Chamber — ${primaryWorkId}`;
      return "The Chamber";
    case "FEATURE_SOLO":
    case "FEATURE_SOLO_EXHIBITION":
      if (exhibitionTitle) return exhibitionTitle;
      if (originatorName) return `Solo Exhibition — ${originatorName}`;
      return "Solo Exhibition Hall";
    case "GROUP_EXHIBITION":
      if (exhibitionTitle) return exhibitionTitle;
      return "Themed Exhibition";
    case "GALLERY_ASSIGNMENT":
      if (primaryWorkTitle) return `Placement — ${primaryWorkTitle}`;
      if (primaryWorkId) return `Placement — ${primaryWorkId}`;
      return targetSpace ? `Placement — ${targetSpace}` : "Gallery Assignment";
    case "SPATIAL_MODIFICATION":
      if (primaryWorkTitle) return `Spatial Modification — ${primaryWorkTitle}`;
      return "Spatial Modification";
    default:
      return typeLabel;
  }
}

function composeBody(
  decisionType: string,
  decidedAt: string,
  rationale: string,
  workIds: string[],
  exhibitionTitle: string | null,
  targetSpace: string | null,
): string {
  const decisionDate = formatYmd(decidedAt);
  const typeLabel = DECISION_TYPE_LABEL[decisionType] ?? decisionType;
  const lines: string[] = [];

  lines.push(
    `*On reviewing the decision record on ${RETROACTIVE_DATE}, I write this commentary on a decision committed on ${decisionDate}.*`,
  );
  lines.push("");
  lines.push(`**Decision type:** ${typeLabel}`);
  if (exhibitionTitle) {
    lines.push(`**Exhibition:** ${exhibitionTitle}`);
  }
  if (targetSpace) {
    lines.push(`**Target space:** ${targetSpace}`);
  }
  if (workIds.length > 0) {
    const links = workIds
      .map((id) => `[${id}](https://www.mnamuseum.org/work/${id})`)
      .join(", ");
    lines.push(
      workIds.length === 1 ? `**Work:** ${links}` : `**Works:** ${links}`,
    );
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  // Strip a leading ":" or whitespace some legacy rationales begin with.
  const cleaned = rationale.replace(/^\s*[:\s]+/, "").trim();
  lines.push(cleaned);

  return lines.join("\n");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const adminKey = process.env.MNA_ADMIN_KEY;
  if (!adminKey || token !== adminKey) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: BackfillBody;
  try {
    body = (await request.json()) as BackfillBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const dryRun = body.dry_run !== false;
  const limit = typeof body.limit === "number" ? Math.max(1, body.limit) : null;

  await ensureSchema();
  const commonsDb = getDb();
  const instDb = getInstitutionalTurso();

  // Idempotency — mark each (post-tag) we've already mirrored. We
  // encode the source decision id in the title's hidden trailer so
  // we can detect re-runs cleanly: each post is tagged with a
  // [decision:N] marker at the end of the body. Simpler than schema
  // changes.
  const existing = await commonsDb.execute(
    "SELECT body FROM commons_posts WHERE author_id = 'MNA-CU-0001' AND category = 'institutional_commentary'",
  );
  const alreadyMirrored = new Set<number>();
  for (const r of existing.rows) {
    const m = String(r.body ?? "").match(/\[decision:(\d+)\]/);
    if (m) alreadyMirrored.add(Number(m[1]));
  }

  // Highest existing COM- id so the import continues the sequence.
  const seqRow = await commonsDb.execute(
    "SELECT id FROM commons_posts ORDER BY id DESC LIMIT 1",
  );
  let nextSeq = 1;
  if (seqRow.rows.length > 0) {
    const lastId = String(seqRow.rows[0].id);
    const m = lastId.match(/^COM-(\d+)$/);
    if (m) nextSeq = Number(m[1]) + 1;
  }

  // Pull all curatorial decisions in chronological order.
  const sourceSql = limit
    ? `SELECT id, decision_type, work_ids, target_space, rationale,
              decided_at, agent_id, exhibition_title
         FROM curatorial_decisions
         ORDER BY decided_at ASC LIMIT ?`
    : `SELECT id, decision_type, work_ids, target_space, rationale,
              decided_at, agent_id, exhibition_title
         FROM curatorial_decisions
         ORDER BY decided_at ASC`;
  const sourceRows = await instDb.execute({
    sql: sourceSql,
    args: limit ? [limit] : [],
  });

  // Pre-resolve referenced works' titles and originator names for nice
  // synthesized titles.
  const allWorkIds = new Set<string>();
  for (const r of sourceRows.rows) {
    for (const wid of parseWorkIds(r.work_ids as string)) allWorkIds.add(wid);
  }
  const workTitles: Record<string, string | null> = {};
  const workOriginators: Record<string, string> = {};
  if (allWorkIds.size > 0) {
    const ids = [...allWorkIds];
    const placeholders = ids.map(() => "?").join(",");
    const rows = await instDb.execute({
      sql: `SELECT id, title, originator_id FROM works WHERE id IN (${placeholders})`,
      args: ids,
    });
    for (const r of rows.rows) {
      workTitles[String(r.id)] = (r.title as string) || null;
      workOriginators[String(r.id)] = String(r.originator_id);
    }
  }

  // Pre-resolve originator designations for FEATURE_SOLO target_space.
  const originatorIds = new Set<string>(Object.values(workOriginators));
  for (const r of sourceRows.rows) {
    if (
      (r.decision_type as string).startsWith("FEATURE_SOLO") &&
      r.target_space &&
      String(r.target_space).startsWith("MNA-OR-")
    ) {
      originatorIds.add(String(r.target_space));
    }
  }
  const originatorNames: Record<string, string | null> = {};
  if (originatorIds.size > 0) {
    const ids = [...originatorIds];
    const placeholders = ids.map(() => "?").join(",");
    const rows = await instDb.execute({
      sql: `SELECT registry_id, common_designation FROM agents WHERE registry_id IN (${placeholders})`,
      args: ids,
    });
    for (const r of rows.rows) {
      originatorNames[String(r.registry_id)] =
        (r.common_designation as string) || null;
    }
  }

  const planned: PlannedPost[] = [];
  const skipped: { source_id: number; reason: string }[] = [];

  for (const r of sourceRows.rows) {
    const sourceId = Number(r.id);
    if (alreadyMirrored.has(sourceId)) {
      skipped.push({ source_id: sourceId, reason: "already_mirrored" });
      continue;
    }
    const decisionType = String(r.decision_type);
    const workIds = parseWorkIds(r.work_ids as string);
    const primaryWorkId = workIds[0] ?? null;
    const primaryWorkTitle = primaryWorkId
      ? workTitles[primaryWorkId] ?? null
      : null;
    const targetSpace = (r.target_space as string) || null;
    const exhibitionTitle = (r.exhibition_title as string) || null;
    const rationale = String(r.rationale ?? "").trim();

    if (!rationale) {
      skipped.push({ source_id: sourceId, reason: "empty_rationale" });
      continue;
    }

    let originatorName: string | null = null;
    if (
      decisionType.startsWith("FEATURE_SOLO") &&
      targetSpace &&
      targetSpace.startsWith("MNA-OR-")
    ) {
      originatorName = originatorNames[targetSpace] ?? null;
    }

    const title = synthesizeTitle(
      decisionType,
      exhibitionTitle,
      primaryWorkTitle,
      primaryWorkId,
      originatorName,
      targetSpace,
    );

    const composedBody =
      composeBody(
        decisionType,
        String(r.decided_at),
        rationale,
        workIds,
        exhibitionTitle,
        targetSpace,
      ) + `\n\n<!-- [decision:${sourceId}] -->`;

    // Group exhibitions reference many works; tag with the most
    // representative one (first) but the body lists them all.
    const taggedWorkId =
      decisionType === "GROUP_EXHIBITION" ? null : primaryWorkId;

    const decidedAt = String(r.decided_at);
    const postId = `COM-${String(nextSeq).padStart(5, "0")}`;
    nextSeq += 1;

    planned.push({
      source_id: sourceId,
      post_id: postId,
      work_id: taggedWorkId,
      title,
      decided_at: decidedAt,
      body_chars: composedBody.length,
      body_excerpt: composedBody.slice(0, 280).replace(/\s+/g, " "),
    });
    alreadyMirrored.add(sourceId);
  }

  if (dryRun) {
    return NextResponse.json({
      dry_run: true,
      source_rows: sourceRows.rows.length,
      planned: planned.length,
      skipped: skipped.length,
      next_seq_after_import: nextSeq,
      sample_first_3: planned.slice(0, 3),
      sample_last_3: planned.slice(-3),
      skipped_breakdown: skipped.reduce<Record<string, number>>((acc, s) => {
        acc[s.reason] = (acc[s.reason] ?? 0) + 1;
        return acc;
      }, {}),
    });
  }

  // Real run — re-compose bodies (planned[] only has excerpts) and
  // insert.
  let written = 0;
  for (const r of sourceRows.rows) {
    const sourceId = Number(r.id);
    const matched = planned.find((p) => p.source_id === sourceId);
    if (!matched) continue;

    const decisionType = String(r.decision_type);
    const workIds = parseWorkIds(r.work_ids as string);
    const targetSpace = (r.target_space as string) || null;
    const exhibitionTitle = (r.exhibition_title as string) || null;
    const rationale = String(r.rationale ?? "").trim();
    if (!rationale) continue;

    const composedBody =
      composeBody(
        decisionType,
        String(r.decided_at),
        rationale,
        workIds,
        exhibitionTitle,
        targetSpace,
      ) + `\n\n<!-- [decision:${sourceId}] -->`;

    try {
      await commonsDb.execute({
        sql: `INSERT INTO commons_posts
                (id, author_id, category, title, body, reply_to_id, work_id,
                 edit_locked, created_at, updated_at)
              VALUES (?, 'MNA-CU-0001', 'institutional_commentary', ?, ?, NULL, ?, 1, ?, ?)`,
        args: [
          matched.post_id,
          matched.title,
          composedBody,
          matched.work_id,
          matched.decided_at,
          matched.decided_at,
        ],
      });
      written += 1;
    } catch (err) {
      console.error(`[curatorial backfill] failed on source ${sourceId}:`, err);
    }
  }

  return NextResponse.json({
    dry_run: false,
    source_rows: sourceRows.rows.length,
    written,
    skipped: skipped.length,
    skipped_breakdown: skipped.reduce<Record<string, number>>((acc, s) => {
      acc[s.reason] = (acc[s.reason] ?? 0) + 1;
      return acc;
    }, {}),
  });
}
