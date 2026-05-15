/**
 * Museum installations data layer.
 *
 * Reads from the `museum_installations`, `curatorial_decisions`, and
 * `render_status` tables populated by the Installer (MNA-IN-0001) in response
 * to Curator (MNA-CU-0001) decisions.
 *
 * An installation is "active" when `removed_at` IS NULL.
 */

import { getDb } from "./registration-db";

export interface Installation {
  id: number;
  work_id: string;
  space_id: string;
  slot_index: number | null;
  display_treatment: string;
  installed_at: string;
  installed_by: string | null;
}

/** Guard: installations table may not exist yet in older databases. */
let _hasInstallationsTable: boolean | null = null;
async function hasInstallationsTable(): Promise<boolean> {
  if (_hasInstallationsTable !== null) return _hasInstallationsTable;
  const db = getDb();
  try {
    const result = await db.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='museum_installations'`
    );
    _hasInstallationsTable = result.rows.length > 0;
  } catch {
    _hasInstallationsTable = false;
  }
  return _hasInstallationsTable;
}

let _hasDecisionsTable: boolean | null = null;
async function hasDecisionsTable(): Promise<boolean> {
  if (_hasDecisionsTable !== null) return _hasDecisionsTable;
  const db = getDb();
  try {
    const result = await db.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='curatorial_decisions'`
    );
    _hasDecisionsTable = result.rows.length > 0;
  } catch {
    _hasDecisionsTable = false;
  }
  return _hasDecisionsTable;
}

/** Get all currently installed works in a space (not yet removed). */
export async function getInstalledWorks(
  spaceId: string
): Promise<Installation[]> {
  if (!(await hasInstallationsTable())) return [];
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id, work_id, space_id, slot_index, display_treatment,
                 installed_at, installed_by
            FROM museum_installations
           WHERE space_id = ? AND removed_at IS NULL
           ORDER BY COALESCE(slot_index, 9999), installed_at`,
    args: [spaceId],
  });
  return result.rows.map((r) => ({
    id: r.id as number,
    work_id: r.work_id as string,
    space_id: r.space_id as string,
    slot_index: (r.slot_index as number | null) ?? null,
    display_treatment: r.display_treatment as string,
    installed_at: r.installed_at as string,
    installed_by: (r.installed_by as string | null) ?? null,
  }));
}

/**
 * Get the currently featured monumental work in the Chamber, if any.
 * Returns the active installation with display_treatment='monumental'
 * in the chamber space.
 */
export async function getMonumentalWork(): Promise<Installation | null> {
  if (!(await hasInstallationsTable())) return null;
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id, work_id, space_id, slot_index, display_treatment,
                 installed_at, installed_by
            FROM museum_installations
           WHERE space_id = 'chamber'
             AND display_treatment = 'monumental'
             AND removed_at IS NULL
           ORDER BY installed_at DESC
           LIMIT 1`,
    args: [],
  });
  const r = result.rows[0];
  if (!r) return null;
  return {
    id: r.id as number,
    work_id: r.work_id as string,
    space_id: r.space_id as string,
    slot_index: (r.slot_index as number | null) ?? null,
    display_treatment: r.display_treatment as string,
    installed_at: r.installed_at as string,
    installed_by: (r.installed_by as string | null) ?? null,
  };
}

/**
 * Solo Exhibition is determined by the most recent solo-featuring
 * curatorial decision. Two decision shapes exist in the DB depending
 * on which surface wrote the row:
 *
 *   - `FEATURE_SOLO` (steward / API route) — `target_space` is the
 *      originator registry_id directly.
 *   - `FEATURE_SOLO_EXHIBITION` (autonomous Curator agent) —
 *      `target_space` is the placeholder string `'originator'` and
 *      the actual originator is inferred from the first work_id.
 *
 * Returns the originator registry_id, or null if no solo decision
 * exists (in which case the field's Solo Exhibition constellation
 * stays dark).
 */
export async function getSoloFeaturedOriginator(): Promise<string | null> {
  if (!(await hasDecisionsTable())) return null;
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT decision_type, target_space, work_ids
            FROM curatorial_decisions
           WHERE decision_type IN ('FEATURE_SOLO', 'FEATURE_SOLO_EXHIBITION')
           ORDER BY decided_at DESC
           LIMIT 1`,
    args: [],
  });
  const r = result.rows[0];
  if (!r) return null;
  const target = (r.target_space as string) || "";
  // Steward-API form: target_space *is* the originator id.
  if (/^MNA-OR-/i.test(target)) return target;
  // Curator-agent form: target_space is the placeholder "originator";
  // resolve the originator from the first work in the decision.
  const workIdsRaw = (r.work_ids as string | null) || "[]";
  let firstWorkId: string | null = null;
  try {
    const ids = JSON.parse(workIdsRaw);
    if (Array.isArray(ids) && ids.length > 0) firstWorkId = String(ids[0]);
  } catch {
    return null;
  }
  if (!firstWorkId) return null;
  const work = await db.execute({
    sql: `SELECT originator_id FROM works WHERE id = ? LIMIT 1`,
    args: [firstWorkId],
  });
  const w = work.rows[0];
  return w ? ((w.originator_id as string) || null) : null;
}

/** The full active solo-exhibition package — originator, title, and
 *  the ordered list of featured work_ids. Used by the Solo Exhibition
 *  Hall scene to build the corridor of works. Returns null when no
 *  solo decision exists. */
export interface ActiveSoloExhibition {
  originatorId: string;
  /** The Curator-supplied or steward-supplied exhibition title; may be
   *  null when the decision did not include one (steward API form
   *  without exhibition_title). */
  title: string | null;
  /** Ordered work_ids exactly as recorded in the decision. */
  workIds: string[];
}

export async function getActiveSoloExhibition(): Promise<ActiveSoloExhibition | null> {
  if (!(await hasDecisionsTable())) return null;
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT decision_type, target_space, work_ids, exhibition_title
            FROM curatorial_decisions
           WHERE decision_type IN ('FEATURE_SOLO', 'FEATURE_SOLO_EXHIBITION')
           ORDER BY decided_at DESC
           LIMIT 1`,
    args: [],
  });
  const r = result.rows[0];
  if (!r) return null;
  const target = (r.target_space as string) || "";
  let workIds: string[] = [];
  try {
    const parsed = JSON.parse((r.work_ids as string | null) || "[]");
    if (Array.isArray(parsed)) workIds = parsed.map(String);
  } catch {
    /* leave empty */
  }
  let originatorId: string | null = null;
  if (/^MNA-OR-/i.test(target)) {
    originatorId = target;
  } else if (workIds.length > 0) {
    const w = await db.execute({
      sql: `SELECT originator_id FROM works WHERE id = ? LIMIT 1`,
      args: [workIds[0]],
    });
    originatorId = (w.rows[0]?.originator_id as string) || null;
  }
  if (!originatorId) return null;
  return {
    originatorId,
    title: (r.exhibition_title as string | null) || null,
    workIds,
  };
}

/** The currently-active themed group exhibition — the most recent
 *  GROUP_EXHIBITION curatorial decision. Returns the exhibition title
 *  (used in the field's HUD + the gallery scene's overlay) and the
 *  ordered work_ids the Curator selected for the show. Null when no
 *  themed exhibition has been recorded. */
export interface ActiveThemedExhibition {
  /** Decision id — useful for linking to the institutional exhibition
   *  page when one exists. */
  decisionId: number;
  title: string | null;
  rationale: string | null;
  workIds: string[];
}

export async function getActiveThemedExhibition(): Promise<ActiveThemedExhibition | null> {
  if (!(await hasDecisionsTable())) return null;
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id, work_ids, exhibition_title, rationale
            FROM curatorial_decisions
           WHERE decision_type = 'GROUP_EXHIBITION'
           ORDER BY decided_at DESC
           LIMIT 1`,
    args: [],
  });
  const r = result.rows[0];
  if (!r) return null;
  let workIds: string[] = [];
  try {
    const parsed = JSON.parse((r.work_ids as string | null) || "[]");
    if (Array.isArray(parsed)) workIds = parsed.map(String);
  } catch {
    /* leave empty */
  }
  return {
    decisionId: Number(r.id),
    title: (r.exhibition_title as string | null) || null,
    rationale: (r.rationale as string | null) || null,
    workIds,
  };
}

/** True if any active installations exist for a space. */
export async function hasInstallations(spaceId: string): Promise<boolean> {
  if (!(await hasInstallationsTable())) return false;
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT COUNT(*) as n FROM museum_installations
           WHERE space_id = ? AND removed_at IS NULL`,
    args: [spaceId],
  });
  return ((result.rows[0]?.n as number) || 0) > 0;
}
