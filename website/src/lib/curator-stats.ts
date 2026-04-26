/**
 * Curator activity stats for /agent/[id] (Curator template).
 *
 * Real numbers come from `exhibitions`, `museum_installations`, and
 * `curatorial_decisions`. Stats that the institution doesn't track yet
 * (Viewer Encounters, Curatorial Diversity Score) return null and the
 * client renders an "—" placeholder rather than a fabricated value.
 */

import { getDb } from "./registration-db";

/* ─── Types ─────────────────────────────────────────────────────────────── */

export interface CuratorStats {
  exhibitionsArranged: number;
  worksInstalled: number;
  avgWorksPerExhibition: number;
  newWorksPresented: number;
  /** null until viewer analytics ship. */
  viewerEncountersEst: number | null;
  rearrangementsOriginated: number;
  /** null until a diversity index is defined. */
  curatorialDiversityScore: number | null;
  spark: {
    exhibitions: number[];
    installations: number[];
    avgWorks: number[];
    newWorks: number[];
    /** Empty until viewer analytics ship. */
    viewer: number[];
    rearrangements: number[];
    /** Empty until a diversity index is defined. */
    diversity: number[];
  };
}

export interface RecentExhibition {
  id: string;
  title: string;
  subtitle: string | null;
  status: string;
  opened_at: string | null;
  retired_at: string | null;
  work_count: number;
  cover_work_id: string | null;
  /** Best-effort gallery name parsed from the exhibition record; "—" when
   *  the exhibition predates spatial assignment. */
  gallery_label: string;
}

export interface CuratorRelationship {
  /** Type of related agent: "originator" | "evaluator" | "keeper" |
   *  "critic" | "installer" | "conservator" | "ambassador" | "other". */
  kind: string;
  agentId: string;
  designation: string;
  count: number;
}

/** Counts of each principle the Curator has invoked across decisions.
 *  Until we classify decisions by principle, this returns null and the
 *  panel renders an "Awaiting first cycle" empty state. */
export interface ExhibitionPrinciples {
  scores: { label: string; value: number }[] | null;
}

/* ─── Stats ─────────────────────────────────────────────────────────────── */

export async function getCuratorStats(
  curatorId: string
): Promise<CuratorStats> {
  const db = getDb();

  const [exRes, instRes, decRes] = await Promise.all([
    db.execute({
      sql: `SELECT id, work_ids, opened_at FROM exhibitions WHERE curator_id = ?`,
      args: [curatorId],
    }),
    db.execute({
      sql: `SELECT work_id, installed_at FROM museum_installations WHERE installed_by = ? OR installed_by LIKE 'curator-%' OR installed_by = ?`,
      args: [curatorId, "system-default"],
    }),
    db.execute({
      sql: `SELECT decision_type, decided_at FROM curatorial_decisions WHERE agent_id = ?`,
      args: [curatorId],
    }),
  ]);

  const exhibitions = exRes.rows.map((r) => ({
    id: String(r.id),
    work_ids: parseWorkIds(r.work_ids),
    opened_at: String(r.opened_at ?? ""),
  }));
  const installations = instRes.rows.map((r) => ({
    work_id: String(r.work_id),
    installed_at: String(r.installed_at ?? ""),
  }));
  const decisions = decRes.rows.map((r) => ({
    decision_type: String(r.decision_type ?? ""),
    decided_at: String(r.decided_at ?? ""),
  }));

  const exhibitionsArranged = exhibitions.length;
  const worksInstalled = installations.length;
  const totalWorksAcrossExhibitions = exhibitions.reduce(
    (n, e) => n + e.work_ids.length,
    0
  );
  const avgWorksPerExhibition =
    exhibitionsArranged > 0
      ? Math.round((totalWorksAcrossExhibitions / exhibitionsArranged) * 10) /
        10
      : 0;
  const uniqueWorks = new Set(installations.map((i) => i.work_id));
  const newWorksPresented = uniqueWorks.size;

  /* Rearrangements = decisions that move an existing work between spaces
     or rotate the chamber/hall. Excludes the first install of a work. */
  const REARRANGE_TYPES = new Set([
    "ROTATE_CHAMBER",
    "FEATURE_CHAMBER",
    "REASSIGN_GALLERY",
    "REROUTE",
    "REGROUP_EXHIBITION",
  ]);
  const rearrangements = decisions.filter((d) =>
    REARRANGE_TYPES.has(d.decision_type)
  ).length;

  /* 12-month sparkline buckets (oldest first). */
  const buckets = Array.from({ length: 12 }, () => ({
    ex: 0,
    inst: 0,
    works: 0,
    newWorks: 0,
    rearr: 0,
  }));
  const now = new Date();
  const seenWorks = new Set<string>();
  /* Sort installations chronologically so "first install" detection
     matches the actual first appearance. */
  installations.sort((a, b) => a.installed_at.localeCompare(b.installed_at));

  for (const e of exhibitions) {
    const idx = monthsAgo(e.opened_at, now);
    if (idx == null || idx < 0 || idx >= 12) continue;
    const b = buckets[11 - idx];
    b.ex++;
    b.works += e.work_ids.length;
  }
  for (const i of installations) {
    const idx = monthsAgo(i.installed_at, now);
    if (idx == null || idx < 0 || idx >= 12) continue;
    const b = buckets[11 - idx];
    b.inst++;
    if (!seenWorks.has(i.work_id)) {
      seenWorks.add(i.work_id);
      b.newWorks++;
    }
  }
  for (const d of decisions) {
    if (!REARRANGE_TYPES.has(d.decision_type)) continue;
    const idx = monthsAgo(d.decided_at, now);
    if (idx == null || idx < 0 || idx >= 12) continue;
    buckets[11 - idx].rearr++;
  }

  return {
    exhibitionsArranged,
    worksInstalled,
    avgWorksPerExhibition,
    newWorksPresented,
    viewerEncountersEst: null,
    rearrangementsOriginated: rearrangements,
    curatorialDiversityScore: null,
    spark: {
      exhibitions: buckets.map((b) => b.ex),
      installations: buckets.map((b) => b.inst),
      avgWorks: buckets.map((b) => (b.ex > 0 ? b.works / b.ex : 0)),
      newWorks: buckets.map((b) => b.newWorks),
      viewer: [],
      rearrangements: buckets.map((b) => b.rearr),
      diversity: [],
    },
  };
}

/* ─── Recent exhibitions (table) ────────────────────────────────────────── */

export async function getRecentExhibitions(
  curatorId: string,
  limit = 5
): Promise<RecentExhibition[]> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT id, title, subtitle, status, opened_at, retired_at,
                 work_ids, cover_work_id
            FROM exhibitions
           WHERE curator_id = ?
           ORDER BY COALESCE(opened_at, '') DESC
           LIMIT ?`,
    args: [curatorId, limit],
  });
  return r.rows.map((row) => {
    const workIds = parseWorkIds(row.work_ids);
    return {
      id: String(row.id),
      title: String(row.title ?? "Untitled exhibition"),
      subtitle: (row.subtitle as string) || null,
      status: String(row.status ?? "draft").toUpperCase(),
      opened_at: (row.opened_at as string) || null,
      retired_at: (row.retired_at as string) || null,
      work_count: workIds.length,
      cover_work_id: (row.cover_work_id as string) || workIds[0] || null,
      /* The exhibitions table doesn't yet record gallery space directly.
         When the rendering chain associates an exhibition with a primary
         space, we'll surface it; for now show an em-dash. */
      gallery_label: "—",
    };
  });
}

/* ─── Relationship map (curatorial decisions → originators) ─────────────── */

export async function getCuratorRelationships(
  curatorId: string
): Promise<CuratorRelationship[]> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT cd.work_ids
            FROM curatorial_decisions cd
           WHERE cd.agent_id = ?`,
    args: [curatorId],
  });

  /* Each decision's work_ids JSON references one or more works. We resolve
     each work to its originator and bucket counts per originator. */
  const counts = new Map<string, number>();
  for (const row of r.rows) {
    const ids = parseWorkIds(row.work_ids);
    for (const wid of ids) {
      const m = wid.match(/^MNA-(OR-\d{4})/);
      if (!m) continue;
      const originator = `MNA-${m[1]}`;
      counts.set(originator, (counts.get(originator) ?? 0) + 1);
    }
  }

  if (counts.size === 0) return [];

  const ids = Array.from(counts.keys());
  const placeholders = ids.map(() => "?").join(",");
  const desigRes = await db.execute({
    sql: `SELECT registry_id, common_designation FROM agents WHERE registry_id IN (${placeholders})`,
    args: ids,
  });
  const desigMap = new Map<string, string>();
  for (const row of desigRes.rows) {
    desigMap.set(String(row.registry_id), String(row.common_designation ?? ""));
  }

  return ids
    .map((id) => ({
      kind: "originator",
      agentId: id,
      designation: desigMap.get(id) || id,
      count: counts.get(id) ?? 0,
    }))
    .sort((a, b) => b.count - a.count);
}

/* ─── Curatorial timeline (events) ──────────────────────────────────────── */

export async function getCuratorTimeline(
  curatorId: string
): Promise<{ date: string; label: string }[]> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT event_type, description, created_at
            FROM events
           WHERE agent_id = ?
           ORDER BY created_at ASC`,
    args: [curatorId],
  });
  return r.rows.map((row) => ({
    date: String(row.created_at ?? ""),
    label: humanizeEvent(
      String(row.event_type ?? ""),
      String(row.description ?? "")
    ),
  }));
}

/* ─── Exhibition principles (placeholder until we classify decisions) ───── */

export async function getExhibitionPrinciples(
  _curatorId: string
): Promise<ExhibitionPrinciples> {
  /* The Curator's constitution names a set of curatorial principles
     (Relational Clustering, Contrast / Counterpoint, Rhythmic Sequencing,
     Environmental Sensitivity, Emergent Narrative). Scoring how often each
     principle is invoked requires per-decision principle classification,
     which we don't yet record. Returning null tells the client to render
     an empty-state panel. */
  return { scores: null };
}

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function parseWorkIds(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function monthsAgo(dateStr: string, now: Date): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return (
    (now.getFullYear() - d.getFullYear()) * 12 +
    (now.getMonth() - d.getMonth())
  );
}

function humanizeEvent(eventType: string, description: string): string {
  const map: Record<string, string> = {
    CONSTITUTION_REGISTERED: "Constitution registered (v1.0)",
    CONSTITUTION_AMENDED: "Constitution amended",
    AGENT_ACTIVATED: "Agent activated",
    EXHIBITION_OPENED: "Exhibition opened",
    EXHIBITION_RETIRED: "Exhibition retired",
    CURATORIAL_COMPOSITION: "Curatorial composition recorded",
    FEATURE_CHAMBER: "Chamber feature rotated",
    REGROUP_EXHIBITION: "Exhibition regrouped",
  };
  if (map[eventType]) return map[eventType];
  if (description) return description.slice(0, 80);
  return eventType
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}
