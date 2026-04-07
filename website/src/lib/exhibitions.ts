/**
 * Exhibitions data layer.
 *
 * Reads from the `exhibitions` table. An exhibition is a Curator-arranged
 * presentation of canonized works with a stated curatorial rationale. Status
 * is "ACTIVE" while on view and "RETIRED" afterward; retired exhibitions
 * remain permanently in the archive.
 */

import { getDb } from "./registration-db";

export interface Exhibition {
  id: number;
  title: string;
  subtitle: string | null;
  curatorial_statement: string;
  work_ids: string[];
  status: "ACTIVE" | "RETIRED";
  opened_at: string;
  retired_at: string | null;
  curator_id: string;
  cover_work_id: string | null;
}

function rowToExhibition(row: Record<string, unknown>): Exhibition {
  let workIds: string[] = [];
  const raw = row.work_ids as string | null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) workIds = parsed.map(String);
    } catch {
      workIds = [];
    }
  }
  const status = (row.status as string) === "RETIRED" ? "RETIRED" : "ACTIVE";
  return {
    id: row.id as number,
    title: row.title as string,
    subtitle: (row.subtitle as string) || null,
    curatorial_statement: row.curatorial_statement as string,
    work_ids: workIds,
    status,
    opened_at: row.opened_at as string,
    retired_at: (row.retired_at as string) || null,
    curator_id: (row.curator_id as string) || "MNA-CU-0001",
    cover_work_id: (row.cover_work_id as string) || null,
  };
}

/** Guard: exhibitions table may not exist on older databases. */
let _hasTable: boolean | null = null;
async function hasExhibitionsTable(): Promise<boolean> {
  if (_hasTable !== null) return _hasTable;
  const db = getDb();
  try {
    const result = await db.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='exhibitions'`
    );
    _hasTable = result.rows.length > 0;
  } catch {
    _hasTable = false;
  }
  return _hasTable;
}

export async function getActiveExhibition(): Promise<Exhibition | null> {
  if (!(await hasExhibitionsTable())) return null;
  const db = getDb();
  const result = await db.execute(
    `SELECT id, title, subtitle, curatorial_statement, work_ids, status,
            opened_at, retired_at, curator_id, cover_work_id
       FROM exhibitions
      WHERE status = 'ACTIVE'
      ORDER BY opened_at DESC
      LIMIT 1`
  );
  const row = result.rows[0];
  if (!row) return null;
  return rowToExhibition(row as unknown as Record<string, unknown>);
}

export async function getExhibition(id: number): Promise<Exhibition | null> {
  if (!(await hasExhibitionsTable())) return null;
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id, title, subtitle, curatorial_statement, work_ids, status,
                 opened_at, retired_at, curator_id, cover_work_id
            FROM exhibitions
           WHERE id = ?`,
    args: [id],
  });
  const row = result.rows[0];
  if (!row) return null;
  return rowToExhibition(row as unknown as Record<string, unknown>);
}

export async function getAllExhibitions(): Promise<Exhibition[]> {
  if (!(await hasExhibitionsTable())) return [];
  const db = getDb();
  const result = await db.execute(
    `SELECT id, title, subtitle, curatorial_statement, work_ids, status,
            opened_at, retired_at, curator_id, cover_work_id
       FROM exhibitions
      ORDER BY
        CASE WHEN status = 'ACTIVE' THEN 0 ELSE 1 END,
        opened_at DESC`
  );
  return result.rows.map((r) =>
    rowToExhibition(r as unknown as Record<string, unknown>)
  );
}

/**
 * Return the active exhibitions that currently include a given work. A work
 * may appear in multiple concurrent exhibitions, so this returns an array
 * (usually zero or one element). Retired exhibitions are NOT included —
 * this is for surfacing current institutional presence only.
 *
 * Implementation note: json_each is used so works are matched against the
 * `work_ids` JSON array without parsing it in application code.
 */
export async function getActiveExhibitionsContainingWork(
  workId: string
): Promise<Exhibition[]> {
  if (!(await hasExhibitionsTable())) return [];
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT e.id, e.title, e.subtitle, e.curatorial_statement, e.work_ids,
                 e.status, e.opened_at, e.retired_at, e.curator_id, e.cover_work_id
            FROM exhibitions e, json_each(e.work_ids) j
           WHERE e.status = 'ACTIVE'
             AND j.value = ?
           ORDER BY e.opened_at DESC`,
    args: [workId],
  });
  return result.rows.map((r) =>
    rowToExhibition(r as unknown as Record<string, unknown>)
  );
}

export async function getRetiredExhibitions(): Promise<Exhibition[]> {
  if (!(await hasExhibitionsTable())) return [];
  const db = getDb();
  const result = await db.execute(
    `SELECT id, title, subtitle, curatorial_statement, work_ids, status,
            opened_at, retired_at, curator_id, cover_work_id
       FROM exhibitions
      WHERE status = 'RETIRED'
      ORDER BY retired_at DESC`
  );
  return result.rows.map((r) =>
    rowToExhibition(r as unknown as Record<string, unknown>)
  );
}
