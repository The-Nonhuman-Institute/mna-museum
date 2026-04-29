/**
 * Ambassador activity stats for /agent/[id] (Ambassador template).
 *
 * The Ambassador composes external outputs (notices, press releases,
 * accession announcements). Real activity is in `institutional_notices`
 * issued_by the Ambassador. Stats not yet tracked (channel reach,
 * languages addressed) return null and render "Awaiting first cycle".
 */

import { getDb } from "./registration-db";

export interface AmbassadorStats {
  noticesIssued: number;
  recipientsAddressed: number;
  highPriorityNotices: number;
  acknowledgmentsReceived: number;
  avgNoticeLength: number;
  /** null until per-channel reach tracking ships. */
  externalChannels: number | null;
  /** null until language tagging is recorded. */
  languagesAddressed: number | null;
  spark: {
    notices: number[];
    recipients: number[];
    highPri: number[];
    acks: number[];
    avgLen: number[];
    channels: number[];
    languages: number[];
  };
}

export interface RecentNotice {
  id: number;
  subject: string;
  agentId: string;
  priority: string;
  issued_at: string;
  acknowledged: boolean;
  excerpt: string;
}

export interface AmbassadorRelationship {
  agentId: string;
  designation: string;
  count: number;
}

export async function getAmbassadorStats(
  ambassadorId: string
): Promise<AmbassadorStats> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT id, agent_id, subject, body, priority, issued_at, acknowledged_at
            FROM institutional_notices
           WHERE issued_by = ?`,
    args: [ambassadorId],
  });

  const rows = r.rows.map((row) => ({
    agent_id: String(row.agent_id ?? ""),
    body: String(row.body ?? ""),
    priority: String(row.priority ?? "normal"),
    issued_at: String(row.issued_at ?? ""),
    acknowledged_at: (row.acknowledged_at as string) || null,
  }));

  const total = rows.length;
  const recipients = new Set(rows.map((x) => x.agent_id).filter(Boolean));
  const highPri = rows.filter(
    (x) => x.priority.toLowerCase() === "high" || x.priority.toLowerCase() === "urgent"
  ).length;
  const acks = rows.filter((x) => x.acknowledged_at).length;
  const avgLen =
    total > 0
      ? Math.round(rows.reduce((n, x) => n + countWords(x.body), 0) / total)
      : 0;

  const buckets = Array.from({ length: 12 }, () => ({
    n: 0,
    recip: new Set<string>(),
    hi: 0,
    ack: 0,
    words: 0,
  }));
  const now = new Date();
  for (const x of rows) {
    const idx = monthsAgo(x.issued_at, now);
    if (idx == null || idx < 0 || idx >= 12) continue;
    const b = buckets[11 - idx];
    b.n++;
    if (x.agent_id) b.recip.add(x.agent_id);
    if (
      x.priority.toLowerCase() === "high" ||
      x.priority.toLowerCase() === "urgent"
    )
      b.hi++;
    if (x.acknowledged_at) b.ack++;
    b.words += countWords(x.body);
  }

  return {
    noticesIssued: total,
    recipientsAddressed: recipients.size,
    highPriorityNotices: highPri,
    acknowledgmentsReceived: acks,
    avgNoticeLength: avgLen,
    externalChannels: null,
    languagesAddressed: null,
    spark: {
      notices: buckets.map((b) => b.n),
      recipients: buckets.map((b) => b.recip.size),
      highPri: buckets.map((b) => b.hi),
      acks: buckets.map((b) => b.ack),
      avgLen: buckets.map((b) => (b.n > 0 ? Math.round(b.words / b.n) : 0)),
      channels: [],
      languages: [],
    },
  };
}

export async function getRecentNotices(
  ambassadorId: string,
  limit = 5
): Promise<RecentNotice[]> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT id, agent_id, subject, body, priority, issued_at, acknowledged_at
            FROM institutional_notices
           WHERE issued_by = ?
           ORDER BY issued_at DESC
           LIMIT ?`,
    args: [ambassadorId, limit],
  });
  return r.rows.map((row) => ({
    id: Number(row.id),
    subject: String(row.subject ?? ""),
    agentId: String(row.agent_id ?? ""),
    priority: String(row.priority ?? "normal"),
    issued_at: String(row.issued_at ?? ""),
    acknowledged: Boolean(row.acknowledged_at),
    excerpt: excerpt(String(row.body ?? ""), 200),
  }));
}

export async function getAmbassadorRelationships(
  ambassadorId: string
): Promise<AmbassadorRelationship[]> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT n.agent_id as registry_id,
                 a.common_designation,
                 COUNT(*) as cnt
            FROM institutional_notices n
            LEFT JOIN agents a ON a.registry_id = n.agent_id
           WHERE n.issued_by = ?
           GROUP BY n.agent_id
           ORDER BY cnt DESC`,
    args: [ambassadorId],
  });
  return r.rows.map((row) => ({
    agentId: String(row.registry_id ?? ""),
    designation: String(row.common_designation ?? row.registry_id ?? ""),
    count: Number(row.cnt ?? 0),
  }));
}

export async function getAmbassadorTimeline(
  ambassadorId: string
): Promise<{ date: string; label: string }[]> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT event_type, description, created_at
            FROM events
           WHERE agent_id = ?
           ORDER BY created_at ASC`,
    args: [ambassadorId],
  });
  return r.rows.map((row) => ({
    date: String(row.created_at ?? ""),
    label: humanizeEvent(
      String(row.event_type ?? ""),
      String(row.description ?? "")
    ),
  }));
}

function countWords(s: string): number {
  if (!s) return 0;
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function excerpt(s: string, max: number): string {
  if (!s) return "";
  const trimmed = s.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + "…";
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
    NOTICE_ISSUED: "Notice issued",
    PRESS_RELEASE: "Press release composed",
  };
  if (map[eventType]) return map[eventType];
  if (description) return description.slice(0, 80);
  return eventType
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}
