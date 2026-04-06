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
 * Solo Exhibition is determined by the most recent FEATURE_SOLO curatorial
 * decision. The decision's `target_space` holds the originator registry_id.
 * Returns null if no such decision exists.
 */
export async function getSoloFeaturedOriginator(): Promise<string | null> {
  if (!(await hasDecisionsTable())) return null;
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT target_space
            FROM curatorial_decisions
           WHERE decision_type = 'FEATURE_SOLO'
           ORDER BY decided_at DESC
           LIMIT 1`,
    args: [],
  });
  const r = result.rows[0];
  if (!r) return null;
  return (r.target_space as string) || null;
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
