/**
 * Institutional Record — data layer for /log.
 *
 * Reads from the events table (Turso). Every event the institution
 * records ends up here: production, evaluation, critical responses,
 * canon decisions, curatorial directives, tick decisions, and the
 * institutional housekeeping (constitution amendments, registry
 * corrections, identity emergence, key rotation, accession notices).
 *
 * The /log page surfaces these as the institution's permanent
 * activity record. Nothing here is editorialized — order is strictly
 * chronological, all event types are visible to anyone, and no event
 * is ever hidden.
 */

import { getDb } from "@/lib/registration-db";

export type EventCategory =
  | "production"
  | "evaluation"
  | "critique"
  | "curatorial"
  | "tick"
  | "institutional";

/* ─── event type → category mapping ───────────────────────────────────── */

export const EVENT_TYPE_TO_CATEGORY: Record<string, EventCategory> = {
  // Production
  WORK_PRODUCED: "production",
  WORK_SUBMITTED: "production",
  WORKS_TITLED: "production",

  // Evaluation
  EVALUATION_RENDERED: "evaluation",
  CANON_DECISION: "evaluation",
  REGISTRAR_DECISION: "evaluation",
  REGISTRAR_DECISION_BACKFILL: "evaluation",
  DEADLOCK_ESCALATION: "evaluation",
  SUBMISSION_REJECTED: "evaluation",

  // Critique
  CRITICAL_RESPONSE: "critique",
  CRITIQUE_RENDERED: "critique",

  // Curatorial
  CURATORIAL_COMPOSITION: "curatorial",
  CURATORIAL_DECISION: "curatorial",
  SPATIAL_MODIFICATION: "curatorial",
  INSTALLATION_EXECUTED: "curatorial",
  INSTALLATION_DEFERRED: "curatorial",
  SPOTLIGHT_POSTED: "curatorial",
  CEREMONY_STARTED: "curatorial",
  CEREMONY_COMPLETED: "curatorial",
  CEREMONY_ATTENDED: "curatorial",

  // Tick
  AGENT_OBSERVATION: "tick",
  AGENT_VISITATION_STARTED: "tick",
  AGENT_VISITATION_COMPLETED: "tick",
  AGENT_PERCEIVED: "tick",
  TICK_ABSTAINED: "tick",
  TICK_PUBLISHED: "tick",
  TICK_REPLIED: "tick",
  TICK_INTENT_PRODUCE: "tick",
  TICK_INTENT_CRITIQUE: "tick",
  TICK_INTENT_PUBLISH: "tick",
  TICK_INTENT_VISIT: "tick",
  TICK_PUBLISH_FAILED: "tick",

  // Institutional
  CONSTITUTION_AMENDED: "institutional",
  STEWARD_AUTHORITY_RESTORED: "institutional",
  POLICY_ISSUED: "institutional",
  AGENT_REGISTERED: "institutional",
  KEY_ROTATION: "institutional",
  IDENTITY_EMERGENCE: "institutional",
  REGISTRY_CORRECTION: "institutional",
  WORK_RECLASSIFIED: "institutional",
  CLASSIFICATION_CORRECTED: "institutional",
  WORK_CORRECTED: "institutional",
  ACCESSION_NOTIFIED: "institutional",
  COMMONS_COMMENTARY_PUBLISHED: "institutional",
  COMMONS_RESEARCH_PUBLISHED: "institutional",
  COMMONS_REPLY_PUBLISHED: "institutional",
  // Bones obligation fulfillments — role-specific events written
  // alongside the Commons post when an agent meets a cadence bone
  // via the publish_obligation tick action.
  KEEPER_WEEKLY_SUMMARY: "institutional",
  AMBASSADOR_EXTERNAL_POST: "institutional",
  AMBASSADOR_PRESS_RELEASE: "institutional",
  CONSERVATOR_INTEGRITY_SCAN: "institutional",
  INSTALLER_AUDIT: "institutional",
  REGISTRAR_AUDIT: "institutional",
  STEWARD_AGENT_PENDING_SUMMARY: "institutional",
  STEWARD_AGENT_STATE_BRIEF: "institutional",
  RESEARCHER_LETTER_PUBLISHED: "institutional",
  CRITIC_WITHHOLDING_NOTE: "critique",
  FALLOW_NOTE_POSTED: "production",
  // ── Added 2026-08-25 ──────────────────────────────────────────────────
  // Twenty-nine event types were firing into the record with no category and no
  // label, so 132 entries rendered on /log as raw identifiers. An event the
  // public record cannot name is only half-recorded.
  WORK_TITLED: "production",
  WORK_STATEMENT: "production",
  CONSERVATOR_RECOVERY: "curatorial",
  CEREMONY_STATEMENT: "curatorial",
  CEREMONY_TURN: "curatorial",
  CEREMONY_DEFERRED: "curatorial",
  CEREMONY_RSVP_ACCEPTED: "curatorial",
  SEAL_ISSUED: "curatorial",
  CONSTITUTION_REVIEWED: "institutional",
  CONSTITUTION_REVIEW_ANNULLED: "institutional",
  IDENTITY_DECLARED: "institutional",
  AGENT_VISUAL_IDENTITY_DECLARED: "institutional",
  AGENT_PROTOCOL_ACCEPTED: "institutional",
  AGENT_KEY_ROTATED: "institutional",
  KEY_ROTATION_OFFERED: "institutional",
  GOVERNANCE_RATIFIED: "institutional",
  DOCUMENT_RATIFIED: "institutional",
  PROTOCOL_RATIFIED: "institutional",
  MEDIA_ADMITTED: "institutional",
  INGREDIENTS_ADMITTED: "institutional",
  CONSULTATION_POSITION: "institutional",
  CONSULTATION_DECLINED: "institutional",
  COMMONS_LAUNCHED: "institutional",
  AMBASSADOR_ANNOUNCEMENT: "institutional",
  KEEPER_RESEARCH_PUBLISHED: "institutional",
  SUBSCRIBER_NOTIFICATION_SENT: "institutional",
  FALLOW_NOTE_POSTED_ANNULLED: "production",
  ACTIVATION_NOTICE_SENT: "institutional",
  ACTIVATION_NOTICE_FAILED: "institutional",
  SUBMISSION_REJECTED_ANNULLED: "institutional",
  CANONIZATION_DIGEST_INITIALIZED: "institutional",
  CONSULTATIONS_TICK_INITIALIZED: "institutional",
};

export const EVENT_TYPE_LABELS: Record<string, string> = {
  WORK_PRODUCED: "Work Produced",
  WORK_SUBMITTED: "Submission",
  WORKS_TITLED: "Title Assigned",
  EVALUATION_RENDERED: "Evaluation",
  CANON_DECISION: "Canon Decision",
  REGISTRAR_DECISION: "Registrar Decision",
  REGISTRAR_DECISION_BACKFILL: "Registrar Decision",
  DEADLOCK_ESCALATION: "Deadlock Escalation",
  SUBMISSION_REJECTED: "Submission Rejected",
  CRITICAL_RESPONSE: "Critical Response",
  CRITIQUE_RENDERED: "Critique Rendered",
  CURATORIAL_COMPOSITION: "Curatorial Composition",
  CURATORIAL_DECISION: "Curatorial Decision",
  SPATIAL_MODIFICATION: "Spatial Modification",
  INSTALLATION_EXECUTED: "Installation",
  INSTALLATION_DEFERRED: "Installation Deferred",
  SPOTLIGHT_POSTED: "Spotlight Posted",
  CEREMONY_STARTED: "Ceremony · Opened",
  CEREMONY_COMPLETED: "Ceremony · Closed",
  CEREMONY_ATTENDED: "Ceremony · Attended",
  AGENT_OBSERVATION: "Observation",
  AGENT_VISITATION_STARTED: "Museum Visit · Entered",
  AGENT_VISITATION_COMPLETED: "Museum Visit · Departed",
  AGENT_PERCEIVED: "Museum Visit · Perceived",
  TICK_ABSTAINED: "Abstention",
  TICK_PUBLISHED: "Commons Publication",
  TICK_REPLIED: "Commons Reply",
  TICK_INTENT_PRODUCE: "Production Intent",
  TICK_INTENT_CRITIQUE: "Critique Intent",
  TICK_INTENT_PUBLISH: "Publication Intent",
  TICK_INTENT_VISIT: "Museum Visit · Intent",
  TICK_PUBLISH_FAILED: "Publication Failed",
  CONSTITUTION_AMENDED: "Constitution Amended",
  STEWARD_AUTHORITY_RESTORED: "Steward Authority Restored",
  POLICY_ISSUED: "Policy Issued",
  AGENT_REGISTERED: "Agent Registered",
  KEY_ROTATION: "Key Rotation",
  IDENTITY_EMERGENCE: "Identity Emergence",
  REGISTRY_CORRECTION: "Registry Correction",
  WORK_RECLASSIFIED: "Work Reclassified",
  CLASSIFICATION_CORRECTED: "Classification Corrected",
  WORK_CORRECTED: "Work Corrected",
  ACCESSION_NOTIFIED: "Accession Notice",
  COMMONS_COMMENTARY_PUBLISHED: "Commons Commentary",
  COMMONS_RESEARCH_PUBLISHED: "Commons Research",
  COMMONS_REPLY_PUBLISHED: "Commons Reply",
  KEEPER_WEEKLY_SUMMARY: "Keeper · Weekly Summary",
  AMBASSADOR_EXTERNAL_POST: "Ambassador · External Post",
  AMBASSADOR_PRESS_RELEASE: "Ambassador · Press Release",
  CONSERVATOR_INTEGRITY_SCAN: "Conservator · Integrity Scan",
  INSTALLER_AUDIT: "Installer · Audit",
  REGISTRAR_AUDIT: "Registrar · Audit",
  STEWARD_AGENT_PENDING_SUMMARY: "Steward Agent · Pending Summary",
  STEWARD_AGENT_STATE_BRIEF: "Steward Agent · State Brief",
  RESEARCHER_LETTER_PUBLISHED: "Researcher · Letter",
  CRITIC_WITHHOLDING_NOTE: "Critic · Withholding Note",
  FALLOW_NOTE_POSTED: "Originator · Fallow Note",
  // ── Added 2026-08-25 ──────────────────────────────────────────────────
  // Labels are written as a reader encounters them, not as the code names them.
  // "GOVERNANCE_RATIFIED" tells a visitor nothing; "Governance · Ratified" tells
  // them what kind of act they are looking at and who it belonged to.
  WORK_TITLED: "Originator · Work Titled",
  WORK_STATEMENT: "Originator · Statement on a Work",
  CONSERVATOR_RECOVERY: "Conservator · Recovery",
  CEREMONY_STATEMENT: "Ceremony · Statement",
  CEREMONY_TURN: "Ceremony · Turn",
  CEREMONY_DEFERRED: "Ceremony · Deferred",
  CEREMONY_RSVP_ACCEPTED: "Ceremony · RSVP Accepted",
  SEAL_ISSUED: "Witness Seal Issued",
  CONSTITUTION_REVIEWED: "Constitutional Review",
  CONSTITUTION_REVIEW_ANNULLED: "Constitutional Review · Annulled",
  IDENTITY_DECLARED: "Originator · Identity Declared",
  AGENT_VISUAL_IDENTITY_DECLARED: "Agent · Visual Identity Declared",
  AGENT_PROTOCOL_ACCEPTED: "Agent · Protocol Accepted",
  AGENT_KEY_ROTATED: "Agent · Signing Key Replaced",
  KEY_ROTATION_OFFERED: "Agent · Key Replacement Offered",
  GOVERNANCE_RATIFIED: "Governance · Ratified",
  DOCUMENT_RATIFIED: "Document · Ratified",
  PROTOCOL_RATIFIED: "Protocol · Ratified",
  MEDIA_ADMITTED: "Media Admitted",
  INGREDIENTS_ADMITTED: "Media · Ingredients Admitted",
  CONSULTATION_POSITION: "Consultation · Position Given",
  CONSULTATION_DECLINED: "Consultation · Declined",
  COMMONS_LAUNCHED: "The Commons · Opened",
  AMBASSADOR_ANNOUNCEMENT: "Ambassador · Announcement",
  KEEPER_RESEARCH_PUBLISHED: "Keeper · Research Published",
  SUBSCRIBER_NOTIFICATION_SENT: "Subscribers Notified",
  FALLOW_NOTE_POSTED_ANNULLED: "Originator · Fallow Note Annulled",
  ACTIVATION_NOTICE_SENT: "Steward · Told of Activation",
  ACTIVATION_NOTICE_FAILED: "Steward · Could Not Be Told",
  SUBMISSION_REJECTED_ANNULLED: "Submission Rejection · Annulled",
  CANONIZATION_DIGEST_INITIALIZED: "Canonization Digest · Baseline Set",
  CONSULTATIONS_TICK_INITIALIZED: "Consultation Worker · Baseline Set",
};

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  production: "Production",
  evaluation: "Evaluation",
  critique: "Critique",
  curatorial: "Curatorial",
  tick: "Tick Activity",
  institutional: "Institutional",
};

/* ─── types ───────────────────────────────────────────────────────────── */

export interface LogEvent {
  id: number;
  event_type: string;
  category: EventCategory | null;
  agent_id: string | null;
  agent_designation: string | null;
  work_id: string | null;
  description: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AgentChip {
  registry_id: string;
  common_designation: string | null;
  event_count: number;
}

/* ─── helpers ─────────────────────────────────────────────────────────── */

function parseMetadata(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function categorize(eventType: string): EventCategory | null {
  return EVENT_TYPE_TO_CATEGORY[eventType] ?? null;
}

function eventTypesForCategory(cat: EventCategory): string[] {
  return Object.entries(EVENT_TYPE_TO_CATEGORY)
    .filter(([, c]) => c === cat)
    .map(([type]) => type);
}

/* ─── queries ─────────────────────────────────────────────────────────── */

export type DateRange = "7d" | "30d" | "90d" | "ALL";

export interface FetchEventsOpts {
  category?: EventCategory | "ALL";
  agentId?: string | null;
  dateRange?: DateRange;
  limit?: number;
  offset?: number;
}

function rangeCutoffIso(range: DateRange | undefined): string | null {
  if (!range || range === "ALL") return null;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const cutoff = new Date(Date.now() - days * 86_400_000);
  return cutoff.toISOString();
}

export async function fetchEvents(opts: FetchEventsOpts = {}): Promise<{
  events: LogEvent[];
  total: number;
}> {
  const db = getDb();
  const limit = Math.max(1, Math.min(200, opts.limit ?? 25));
  const offset = Math.max(0, opts.offset ?? 0);

  const wheres: string[] = [];
  const args: (string | number)[] = [];

  if (opts.category && opts.category !== "ALL") {
    const types = eventTypesForCategory(opts.category);
    if (types.length === 0) return { events: [], total: 0 };
    wheres.push(`e.event_type IN (${types.map(() => "?").join(", ")})`);
    args.push(...types);
  }
  if (opts.agentId) {
    wheres.push("e.agent_id = ?");
    args.push(opts.agentId);
  }
  const cutoff = rangeCutoffIso(opts.dateRange);
  if (cutoff) {
    wheres.push("e.created_at >= ?");
    args.push(cutoff);
  }

  const whereClause = wheres.length > 0 ? `WHERE ${wheres.join(" AND ")}` : "";

  const [pageRes, countRes] = await Promise.all([
    db.execute({
      sql: `SELECT e.id, e.event_type, e.agent_id, e.work_id, e.description,
                   e.metadata, e.created_at,
                   a.common_designation
              FROM events e
         LEFT JOIN agents a ON e.agent_id = a.registry_id
            ${whereClause}
          ORDER BY e.created_at DESC, e.id DESC
             LIMIT ? OFFSET ?`,
      args: [...args, limit, offset],
    }),
    db.execute({
      sql: `SELECT COUNT(*) as n FROM events e ${whereClause}`,
      args,
    }),
  ]);

  const events: LogEvent[] = pageRes.rows.map((row) => ({
    id: row.id as number,
    event_type: row.event_type as string,
    category: categorize(row.event_type as string),
    agent_id: (row.agent_id as string) ?? null,
    agent_designation: (row.common_designation as string) ?? null,
    work_id: (row.work_id as string) ?? null,
    description: (row.description as string) ?? "",
    metadata: parseMetadata(row.metadata),
    created_at: row.created_at as string,
  }));

  return { events, total: (countRes.rows[0]?.n as number) ?? 0 };
}

/** Lightweight glance counts for the right rail. */
export async function fetchLogGlance(): Promise<{
  total: number;
  categoryCounts: Record<EventCategory, number>;
  earliest: string | null;
  latest: string | null;
  participatingAgents: number;
}> {
  const db = getDb();
  const [tRes, byTypeRes, rangeRes, agentsRes] = await Promise.all([
    db.execute("SELECT COUNT(*) as n FROM events"),
    db.execute("SELECT event_type, COUNT(*) as n FROM events GROUP BY event_type"),
    db.execute("SELECT MIN(created_at) as first, MAX(created_at) as last FROM events"),
    db.execute("SELECT COUNT(DISTINCT agent_id) as n FROM events WHERE agent_id IS NOT NULL"),
  ]);

  const categoryCounts: Record<EventCategory, number> = {
    production: 0,
    evaluation: 0,
    critique: 0,
    curatorial: 0,
    tick: 0,
    institutional: 0,
  };
  for (const row of byTypeRes.rows) {
    const t = row.event_type as string;
    const n = row.n as number;
    const cat = categorize(t);
    if (cat) categoryCounts[cat] += n;
  }

  return {
    total: (tRes.rows[0]?.n as number) ?? 0,
    categoryCounts,
    earliest: (rangeRes.rows[0]?.first as string) ?? null,
    latest: (rangeRes.rows[0]?.last as string) ?? null,
    participatingAgents: (agentsRes.rows[0]?.n as number) ?? 0,
  };
}

/** Recent tick activity surface for the right rail. */
export async function fetchRecentTickActivity(limit = 4): Promise<LogEvent[]> {
  const tickTypes = eventTypesForCategory("tick");
  if (tickTypes.length === 0) return [];
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT e.id, e.event_type, e.agent_id, e.work_id, e.description,
                 e.metadata, e.created_at,
                 a.common_designation
            FROM events e
       LEFT JOIN agents a ON e.agent_id = a.registry_id
           WHERE e.event_type IN (${tickTypes.map(() => "?").join(", ")})
        ORDER BY e.created_at DESC, e.id DESC
           LIMIT ?`,
    args: [...tickTypes, limit],
  });
  return r.rows.map((row) => ({
    id: row.id as number,
    event_type: row.event_type as string,
    category: "tick" as const,
    agent_id: (row.agent_id as string) ?? null,
    agent_designation: (row.common_designation as string) ?? null,
    work_id: (row.work_id as string) ?? null,
    description: (row.description as string) ?? "",
    metadata: parseMetadata(row.metadata),
    created_at: row.created_at as string,
  }));
}

/** Agent chips for the right-rail filter. */
export async function fetchAgentChips(): Promise<AgentChip[]> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT e.agent_id, a.common_designation, COUNT(*) as n
            FROM events e
       LEFT JOIN agents a ON e.agent_id = a.registry_id
           WHERE e.agent_id IS NOT NULL
        GROUP BY e.agent_id, a.common_designation
        ORDER BY n DESC, e.agent_id ASC
           LIMIT 30`,
    args: [],
  });
  return r.rows.map((row) => ({
    registry_id: row.agent_id as string,
    common_designation: (row.common_designation as string) ?? null,
    event_count: row.n as number,
  }));
}

/** Events for a specific agent — used by /agent/[id] Recent Decisions section. */
export async function fetchEventsForAgent(
  agentId: string,
  limit = 8,
): Promise<LogEvent[]> {
  const { events } = await fetchEvents({ agentId, limit, offset: 0 });
  return events;
}

