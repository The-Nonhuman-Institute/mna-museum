/**
 * Installer activity stats for /agent/[id] (Installer template).
 *
 * The Installer realizes the Curator's spatial decisions — every entry,
 * rotation, and exit in the virtual museum is recorded in
 * `museum_installations`. Stats are derived from that table plus the
 * `curatorial_decisions` rationales the installer carried out.
 */

import { getDb } from "./registration-db";

export interface InstallerStats {
  worksInstalled: number;
  spacesActive: number;
  rotationsExecuted: number;
  worksCurrentlyOnView: number;
  avgDaysOnView: number;
  /** null until escalation tracking ships. */
  escalationsToConservator: number | null;
  /** null until failure-rate is tracked. */
  failedInstallations: number | null;
  spark: {
    installs: number[];
    rotations: number[];
    onView: number[];
    avgDays: number[];
    escalations: number[];
    failures: number[];
  };
}

export interface RecentInstallation {
  installId: number;
  workId: string;
  spaceId: string;
  displayTreatment: string;
  installed_at: string;
  removed_at: string | null;
}

export interface SpaceLoad {
  spaceId: string;
  spaceLabel: string;
  liveCount: number;
}

export async function getInstallerStats(
  installerId: string
): Promise<InstallerStats> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT id, work_id, space_id, installed_at, removed_at
            FROM museum_installations
           WHERE installed_by = ? OR installed_by = 'system-default' OR installed_by LIKE 'curator-%'`,
    args: [installerId],
  });

  const rows = r.rows.map((row) => ({
    work_id: String(row.work_id ?? ""),
    space_id: String(row.space_id ?? ""),
    installed_at: String(row.installed_at ?? ""),
    removed_at: (row.removed_at as string) || null,
  }));

  const worksInstalled = rows.length;
  const spaces = new Set(rows.map((x) => x.space_id).filter(Boolean));
  const onView = rows.filter((x) => !x.removed_at).length;
  /* Rotations = rows that have been removed (an installation that ended
     to make room for another). The Installer's "rotations executed" is
     a count of completed install→remove cycles. */
  const rotations = rows.filter((x) => x.removed_at).length;

  const ages: number[] = [];
  for (const x of rows) {
    if (!x.installed_at) continue;
    const start = new Date(x.installed_at).getTime();
    const end = x.removed_at ? new Date(x.removed_at).getTime() : Date.now();
    if (isNaN(start) || isNaN(end)) continue;
    ages.push(Math.max(0, (end - start) / 86_400_000));
  }
  const avgDaysOnView = ages.length > 0
    ? Math.round(ages.reduce((s, n) => s + n, 0) / ages.length)
    : 0;

  /* 12-month buckets, oldest first. */
  const buckets = Array.from({ length: 12 }, () => ({
    inst: 0,
    rot: 0,
    onv: 0,
    age: 0,
    ageN: 0,
  }));
  const now = new Date();
  for (const x of rows) {
    const idx = monthsAgo(x.installed_at, now);
    if (idx == null || idx < 0 || idx >= 12) continue;
    const b = buckets[11 - idx];
    b.inst++;
    if (x.removed_at) b.rot++;
    if (!x.removed_at) b.onv++;
    if (x.installed_at) {
      const start = new Date(x.installed_at).getTime();
      const end = x.removed_at ? new Date(x.removed_at).getTime() : Date.now();
      if (!isNaN(start) && !isNaN(end)) {
        b.age += (end - start) / 86_400_000;
        b.ageN++;
      }
    }
  }

  return {
    worksInstalled,
    spacesActive: spaces.size,
    rotationsExecuted: rotations,
    worksCurrentlyOnView: onView,
    avgDaysOnView,
    escalationsToConservator: null,
    failedInstallations: null,
    spark: {
      installs: buckets.map((b) => b.inst),
      rotations: buckets.map((b) => b.rot),
      onView: buckets.map((b) => b.onv),
      avgDays: buckets.map((b) =>
        b.ageN > 0 ? Math.round(b.age / b.ageN) : 0
      ),
      escalations: [],
      failures: [],
    },
  };
}

export async function getRecentInstallations(
  installerId: string,
  limit = 5
): Promise<RecentInstallation[]> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT id, work_id, space_id, display_treatment, installed_at, removed_at
            FROM museum_installations
           WHERE installed_by = ? OR installed_by = 'system-default' OR installed_by LIKE 'curator-%'
           ORDER BY installed_at DESC
           LIMIT ?`,
    args: [installerId, limit],
  });
  return r.rows.map((row) => ({
    installId: Number(row.id),
    workId: String(row.work_id ?? ""),
    spaceId: String(row.space_id ?? ""),
    displayTreatment: String(row.display_treatment ?? "standard"),
    installed_at: String(row.installed_at ?? ""),
    removed_at: (row.removed_at as string) || null,
  }));
}

export async function getSpaceLoad(): Promise<SpaceLoad[]> {
  const db = getDb();
  /* Live = installation row with no removed_at. Each row is one work
     occupying one slot in one space. */
  const r = await db.execute(
    `SELECT space_id, COUNT(*) as n
       FROM museum_installations
      WHERE removed_at IS NULL
      GROUP BY space_id
      ORDER BY n DESC`
  );
  return r.rows.map((row) => ({
    spaceId: String(row.space_id ?? ""),
    spaceLabel: SPACE_LABELS[String(row.space_id)] ?? String(row.space_id),
    liveCount: Number(row.n ?? 0),
  }));
}

const SPACE_LABELS: Record<string, string> = {
  "gallery-west": "Gallery West",
  "gallery-east": "Gallery East",
  "gallery-south": "Gallery South",
  "sculpture-court": "Sculpture Court",
  "exhibition-hall": "Exhibition Hall",
  "chamber": "The Chamber",
  "solo-exhibition-hall": "Solo Exhibition Hall",
};

export async function getInstallerTimeline(
  installerId: string
): Promise<{ date: string; label: string }[]> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT event_type, description, created_at
            FROM events
           WHERE agent_id = ?
           ORDER BY created_at ASC`,
    args: [installerId],
  });
  return r.rows.map((row) => ({
    date: String(row.created_at ?? ""),
    label: humanizeEvent(
      String(row.event_type ?? ""),
      String(row.description ?? "")
    ),
  }));
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
    INSTALLATION_RECORDED: "Installation recorded",
    ROTATION_EXECUTED: "Rotation executed",
  };
  if (map[eventType]) return map[eventType];
  if (description) return description.slice(0, 80);
  return eventType
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}
