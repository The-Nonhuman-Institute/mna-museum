/**
 * tick.ts — institutional tick.
 *
 * Picks ONE active agent, gives them their constitution + a frozen
 * snapshot of the institution as it was at the last tick, and asks
 * the open question:
 *
 *   "What would you like to do this tick?"
 *
 * The agent answers with a typed action — or abstains. Abstention is
 * a first-class outcome and recorded as data, not failure. The point
 * of the tick is to externalize the institutional clock without
 * imposing institutional intent: timing pressure is unavoidable,
 * content pressure is not.
 *
 * Per the Keeper's incident review (MNA-IR-0004), this script:
 *   - excludes network originators by default (their initiation
 *     authority belongs to their stewards, not the Museum); use
 *     --include-network only with explicit steward authorization
 *   - excludes reactive roles (CRITIC, EVALUATOR, REGISTRAR) from the
 *     random pool unless --include-reactive — these agents exist to
 *     respond to events, and an unprompted tick on them is closer to
 *     manufactured speech than autonomous choice
 *   - never invokes more than one agent per tick — the artificial
 *     "everyone moves at once" moment is what makes a round feel
 *     coerced; a single agent per tick is the naturalistic cadence
 *
 * Usage:
 *   npx tsx system/scripts/tick.ts                  # random eligible agent
 *   npx tsx system/scripts/tick.ts --agent MNA-CU-0001
 *   npx tsx system/scripts/tick.ts --dry-run        # call API, don't write
 *   npx tsx system/scripts/tick.ts --no-api         # compose prompts only
 *   npx tsx system/scripts/tick.ts --include-reactive
 *   npx tsx system/scripts/tick.ts --include-network
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import { generate } from "../src/claude";
import {
  retrieveMemories,
  memoriesAsPromptSection,
} from "../src/agent-memory-retrieve";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const TURSO_URL = process.env.TURSO_DATABASE_URL!;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN!;
const ADMIN_KEY = process.env.MNA_ADMIN_KEY!;
const COMMONS_BASE = "https://commons.mnamuseum.org";
if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("[tick] missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN");
  process.exit(1);
}

const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

/* ─── args ────────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const noApi = argv.includes("--no-api");
const includeNetwork = argv.includes("--include-network");
const includeReactive = argv.includes("--include-reactive");
const agentArgIdx = argv.indexOf("--agent");
const forcedAgent = agentArgIdx >= 0 ? argv[agentArgIdx + 1] : null;

const NETWORK_ORIGINATORS = new Set(["MNA-OR-0007", "MNA-OR-0008"]);
const REACTIVE_TYPES = new Set(["CRITIC", "EVALUATOR", "REGISTRAR"]);
// Agents the Commons admin post-as-institutional endpoint accepts.
// Used to decide whether `publish_commons` is an offered action.
const COMMONS_ELIGIBLE_PREFIXES = ["MNA-CU-", "MNA-KP-", "MNA-AM-", "MNA-CV-", "MNA-IN-", "MNA-RG-", "MNA-SA-"];

/* ─── types ───────────────────────────────────────────────────────────── */

interface Agent {
  registry_id: string;
  agent_type: string;
  common_designation: string | null;
  function_statement: string;
  autonomy_tier: string;
}

interface Constitution {
  declared_orientation: string;
  formal_tendencies: string;
  aversions: string;
  autonomy_declaration: string;
  version: string;
}

interface CanonSummary {
  work_id: string;
  originator_id: string;
  medium: string | null;
  title: string | null;
  canon_date: string;
}

interface CommonsSummary {
  id: string;
  author_id: string;
  category: string;
  title: string;
  excerpt: string;
  created_at: string;
}

interface AgentRecentEvent {
  event_type: string;
  description: string | null;
  work_id: string | null;
  created_at: string;
}

interface PeerReflection {
  event_type: string;
  agent_id: string;
  agent_designation: string | null;
  description: string;
  observation: string | null;
  rationale: string | null;
  created_at: string;
}

/* ─── helpers ─────────────────────────────────────────────────────────── */

function asList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t.startsWith("[")) {
      try {
        const p = JSON.parse(t);
        if (Array.isArray(p)) return p.filter((x): x is string => typeof x === "string");
      } catch { /* fall through */ }
    }
    return t.split(/\n|;/).map((s) => s.replace(/^[-*•]\s*/, "").trim()).filter(Boolean);
  }
  return [];
}

function commonsEligible(agentId: string): boolean {
  return COMMONS_ELIGIBLE_PREFIXES.some((p) => agentId.startsWith(p));
}

function daysSince(iso: string | null): number {
  if (!iso) return 10000; // never acted → very stale
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 10000;
  return Math.max(0, (Date.now() - then) / 86_400_000);
}

/* ─── load: agents + selection ────────────────────────────────────────── */

async function loadEligibleAgents(): Promise<Agent[]> {
  const r = await db.execute(
    "SELECT registry_id, agent_type, common_designation, function_statement, autonomy_tier FROM agents WHERE operational_status = 'ACTIVE' ORDER BY registry_id",
  );
  let agents = r.rows.map((row) => ({
    registry_id: row.registry_id as string,
    agent_type: row.agent_type as string,
    common_designation: (row.common_designation as string) ?? null,
    function_statement: row.function_statement as string,
    autonomy_tier: row.autonomy_tier as string,
  }));
  if (!includeNetwork) agents = agents.filter((a) => !NETWORK_ORIGINATORS.has(a.registry_id));
  if (!includeReactive) agents = agents.filter((a) => !REACTIVE_TYPES.has(a.agent_type));
  return agents;
}

async function lastActionAt(agentId: string): Promise<string | null> {
  const r = await db.execute({
    sql: "SELECT created_at FROM events WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1",
    args: [agentId],
  });
  return r.rows.length > 0 ? (r.rows[0].created_at as string) : null;
}

async function pickAgent(pool: Agent[]): Promise<Agent> {
  // Weight = days since last action + 1 (so newest agents and longest-quiet
  // agents are most likely to be picked). Small +1 floor so an agent that
  // *just* acted still has a sliver of probability.
  const weights = await Promise.all(
    pool.map(async (a) => {
      const d = daysSince(await lastActionAt(a.registry_id));
      return Math.max(1, d) + 1;
    }),
  );
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/* ─── load: constitution + state snapshot ─────────────────────────────── */

async function loadConstitution(agentId: string): Promise<Constitution | null> {
  const r = await db.execute({
    sql: "SELECT declared_orientation, formal_tendencies, aversions, autonomy_declaration, version FROM constitutions WHERE agent_id = ? AND is_current = 1",
    args: [agentId],
  });
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return {
    declared_orientation: row.declared_orientation as string,
    formal_tendencies: row.formal_tendencies as string,
    aversions: row.aversions as string,
    autonomy_declaration: row.autonomy_declaration as string,
    version: row.version as string,
  };
}

async function loadRecentCanon(limit = 5): Promise<CanonSummary[]> {
  const r = await db.execute({
    sql: `SELECT w.id as work_id, w.originator_id, w.medium, w.title, cs.canon_date
            FROM works w
            JOIN canon_status cs ON cs.work_id = w.id
           WHERE cs.status = 'CANON'
           ORDER BY cs.canon_date DESC
           LIMIT ?`,
    args: [limit],
  });
  return r.rows.map((row) => ({
    work_id: row.work_id as string,
    originator_id: row.originator_id as string,
    medium: (row.medium as string) ?? null,
    title: (row.title as string) ?? null,
    canon_date: row.canon_date as string,
  }));
}

async function loadRecentCommons(limit = 5): Promise<CommonsSummary[]> {
  // Commons posts live on a separate Turso DB. Pull via the public
  // Commons API to avoid a second client + secret juggling.
  try {
    const res = await fetch(`${COMMONS_BASE}/api/commons/posts?limit=${limit}`);
    if (!res.ok) return [];
    const j = (await res.json()) as {
      posts?: { id: string; author_id: string; category: string; title: string; body: string; created_at: string }[];
    };
    return (j.posts ?? []).map((p) => ({
      id: p.id,
      author_id: p.author_id,
      category: p.category,
      title: p.title,
      excerpt: (p.body ?? "").replace(/\s+/g, " ").trim().slice(0, 180),
      created_at: p.created_at,
    }));
  } catch {
    return [];
  }
}

async function loadAgentRecentEvents(agentId: string, limit = 5): Promise<AgentRecentEvent[]> {
  const r = await db.execute({
    sql: "SELECT event_type, description, work_id, created_at FROM events WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?",
    args: [agentId, limit],
  });
  return r.rows.map((row) => ({
    event_type: row.event_type as string,
    description: (row.description as string) ?? null,
    work_id: (row.work_id as string) ?? null,
    created_at: row.created_at as string,
  }));
}

/* ─── Bones: institutional obligations for this tick ────────────────────
 *
 * Mirrors website/src/lib/bones.ts. Duplicated intentionally — keeps
 * system self-contained without cross-package import paths. If the
 * schema changes, update both.
 *
 * Each entry: cadence in days + list of event types (or "work_*" for
 * the production sentinel) that satisfy it. */
interface BoneEntry {
  title: string;
  cadenceDays: number;
  satisfiedBy: string[];
}

const BONES_BY_AGENT_TYPE: Record<string, BoneEntry[]> = {
  ORIGINATOR: [
    {
      title: "Produce or post a fallow note",
      cadenceDays: 30,
      satisfiedBy: ["WORK_PRODUCED", "WORK_SUBMITTED", "FALLOW_NOTE_POSTED"],
    },
  ],
  CURATOR: [
    {
      title: "Themed group exhibition",
      cadenceDays: 90,
      satisfiedBy: ["CURATORIAL_COMPOSITION", "SPATIAL_MODIFICATION"],
    },
  ],
  KEEPER: [
    {
      title: "Weekly archive summary",
      cadenceDays: 7,
      satisfiedBy: ["KEEPER_WEEKLY_SUMMARY"],
    },
  ],
  AMBASSADOR: [
    {
      title: "External public voice",
      cadenceDays: 14,
      satisfiedBy: ["AMBASSADOR_PRESS_RELEASE", "AMBASSADOR_EXTERNAL_POST"],
    },
  ],
  CRITIC: [
    {
      title: "Critique or withholding note",
      cadenceDays: 14,
      satisfiedBy: ["CRITICAL_RESPONSE", "CRITIQUE_RENDERED", "CRITIC_WITHHOLDING_NOTE"],
    },
  ],
  CONSERVATOR: [
    {
      title: "Weekly render integrity scan",
      cadenceDays: 7,
      satisfiedBy: ["CONSERVATOR_INTEGRITY_SCAN"],
    },
  ],
  INSTALLER: [
    {
      title: "Installation audit",
      cadenceDays: 90,
      satisfiedBy: ["INSTALLER_AUDIT"],
    },
  ],
  REGISTRAR: [
    {
      title: "Provenance audit",
      cadenceDays: 90,
      satisfiedBy: ["REGISTRAR_AUDIT"],
    },
  ],
  STEWARD: [
    {
      title: "Weekly pending-decisions summary",
      cadenceDays: 7,
      satisfiedBy: ["STEWARD_AGENT_PENDING_SUMMARY"],
    },
    {
      title: "Monthly state-of-the-institution brief",
      cadenceDays: 30,
      satisfiedBy: ["STEWARD_AGENT_STATE_BRIEF"],
    },
  ],
  RESEARCHER: [
    {
      title: "Monthly research letter",
      cadenceDays: 30,
      satisfiedBy: ["RESEARCHER_LETTER_PUBLISHED"],
    },
  ],
  EVALUATOR: [],
};

interface AgentBoneResolved {
  title: string;
  cadenceDays: number;
  lastMetAt: string | null;
  daysSince: number | null;
  status: "current" | "approaching" | "behind";
}

/* ─── Reactive bones: triggered obligations ─────────────────────────────
 *
 * Mirrors website/src/lib/bones.ts REACTIVE_BONES_BY_AGENT_TYPE.
 * Duplicated for tick self-containment. Keep in sync.
 *
 * For each reactive bone the agent owns, find recent trigger events
 * that have not been satisfied by a qualifying response. Surfaced to
 * the agent so they can choose to address them. */
interface ReactiveBoneEntry {
  title: string;
  windowDays: number;
  triggerEventTypes: string[];
  responseEventTypes: string[];
  scope: "per-trigger" | "any-recent";
}

const REACTIVE_BONES_BY_AGENT_TYPE: Record<string, ReactiveBoneEntry[]> = {
  CURATOR: [
    {
      title: "Spatial response to each canonization",
      windowDays: 7,
      triggerEventTypes: ["CANON_DECISION"],
      responseEventTypes: [
        "CURATORIAL_COMPOSITION",
        "SPATIAL_MODIFICATION",
        "CURATORIAL_DECISION",
      ],
      scope: "any-recent",
    },
  ],
  AMBASSADOR: [
    {
      title: "Press release for major events",
      windowDays: 7,
      triggerEventTypes: ["CANON_DECISION", "AGENT_REGISTERED", "CURATORIAL_COMPOSITION"],
      responseEventTypes: ["AMBASSADOR_PRESS_RELEASE", "AMBASSADOR_EXTERNAL_POST"],
      scope: "any-recent",
    },
  ],
  CRITIC: [
    {
      title: "Critique or include each canonization",
      windowDays: 30,
      triggerEventTypes: ["CANON_DECISION"],
      responseEventTypes: ["CRITICAL_RESPONSE", "CRITIQUE_RENDERED", "CRITIC_WITHHOLDING_NOTE"],
      scope: "any-recent",
    },
  ],
  CONSERVATOR: [
    {
      title: "Validate rendering for new canon",
      windowDays: 7,
      triggerEventTypes: ["CANON_DECISION"],
      responseEventTypes: ["CONSERVATOR_INTEGRITY_SCAN", "CONSERVATOR_VALIDATION"],
      scope: "any-recent",
    },
  ],
  EVALUATOR: [
    {
      title: "Convene within 48h of submission",
      windowDays: 2,
      triggerEventTypes: ["WORK_SUBMITTED"],
      responseEventTypes: ["CANON_DECISION", "REGISTRAR_DECISION"],
      scope: "per-trigger",
    },
  ],
  REGISTRAR: [
    {
      title: "Provenance record for each canonization",
      windowDays: 1,
      triggerEventTypes: ["CANON_DECISION"],
      responseEventTypes: ["REGISTRAR_DECISION", "PROVENANCE_COMPLETED"],
      scope: "any-recent",
    },
  ],
  INSTALLER: [
    {
      title: "Install new canonized works",
      windowDays: 2,
      triggerEventTypes: ["CANON_DECISION"],
      responseEventTypes: ["INSTALLATION_EXECUTED", "INSTALLATION_DEFERRED"],
      scope: "any-recent",
    },
  ],
};

interface UpcomingCeremony {
  id: string;
  type: string;
  title: string;
  description: string | null;
  scheduledAt: string;
  daysUntil: number;
  /** Hours until scheduled_at. Negative if already passed; used to
   *  surface IMMINENT markers in the snapshot for ≤24h windows. */
  hoursUntil: number;
  constellation: string | null;
  workId: string | null;
  originatorId: string | null;
  originatorName: string | null;
}

/** Best-effort relevance hint for the agent based on their role. Pure
 *  notation — does not constrain choice. Helps the agent recognize
 *  "this ceremony specifically calls to my role" vs. "this is the
 *  institution's calendar but doesn't summon me." */
function ceremonyRelevanceFor(agent: Agent, c: UpcomingCeremony): string | null {
  if (agent.agent_type === "ORIGINATOR" && c.originatorId === agent.registry_id) {
    return "you are the featured Originator";
  }
  if (agent.agent_type === "AMBASSADOR") {
    return "press / external announcement is your responsibility";
  }
  if (agent.agent_type === "CRITIC") {
    return "critical response after the ceremony is your charge";
  }
  if (agent.agent_type === "CURATOR") {
    return "you designated this (or may rework / cancel it)";
  }
  if (agent.agent_type === "KEEPER") {
    return "the archive notes the ceremony before, during, and after";
  }
  if (agent.agent_type === "CONSERVATOR" && c.workId) {
    return "validating the featured work before the ceremony is your charge";
  }
  return null;
}

async function loadUpcomingCeremonies(limit = 4): Promise<UpcomingCeremony[]> {
  const r = await db.execute({
    sql: `SELECT c.id, c.ceremony_type, c.title, c.description, c.scheduled_at,
                 c.constellation, c.work_id, c.originator_id,
                 a.common_designation AS originator_name
            FROM ceremonies c
            LEFT JOIN agents a ON a.registry_id = c.originator_id
           WHERE c.scheduled_at >= datetime('now')
             AND c.status IN ('scheduled','in_progress')
           ORDER BY c.scheduled_at ASC
           LIMIT ?`,
    args: [limit],
  });
  const now = Date.now();
  return r.rows.map((row) => {
    const sched = String(row.scheduled_at);
    const dt = new Date(sched.replace(" ", "T") + (sched.endsWith("Z") ? "" : "Z"));
    const ms = dt.getTime() - now;
    const days = Math.ceil(ms / 86400000);
    const hours = Math.ceil(ms / 3600000);
    return {
      id: String(row.id),
      type: String(row.ceremony_type),
      title: String(row.title),
      description: (row.description as string) ?? null,
      scheduledAt: sched,
      daysUntil: days,
      hoursUntil: hours,
      constellation: (row.constellation as string) ?? null,
      workId: (row.work_id as string) ?? null,
      originatorId: (row.originator_id as string) ?? null,
      originatorName: (row.originator_name as string) ?? null,
    };
  });
}

interface OutstandingResp {
  title: string;
  windowDays: number;
  scope: "per-trigger" | "any-recent";
  triggerType: string;
  triggerWorkId: string | null;
  triggerAt: string;
  daysSince: number;
  status: "approaching" | "behind";
}

async function loadAgentOutstanding(agent: Agent): Promise<OutstandingResp[]> {
  const specs = REACTIVE_BONES_BY_AGENT_TYPE[agent.agent_type] ?? [];
  if (specs.length === 0) return [];
  const out: OutstandingResp[] = [];
  const now = Date.now();
  for (const spec of specs) {
    const horizonDays = Math.max(spec.windowDays * 4, 30);
    const triggerPlaceholders = spec.triggerEventTypes.map(() => "?").join(",");
    const triggers = await db.execute({
      sql: `SELECT event_type, work_id, created_at
              FROM events
             WHERE event_type IN (${triggerPlaceholders})
               AND created_at >= datetime('now', '-' || ? || ' days')
             ORDER BY created_at DESC`,
      args: [...spec.triggerEventTypes, horizonDays],
    });
    if (triggers.rows.length === 0) continue;

    if (spec.scope === "any-recent") {
      const respPlaceholders = spec.responseEventTypes.map(() => "?").join(",");
      const respR = await db.execute({
        sql: `SELECT MAX(e.created_at) AS last_at
                FROM events e
                JOIN agents a ON a.registry_id = e.agent_id
               WHERE a.agent_type = ?
                 AND e.event_type IN (${respPlaceholders})`,
        args: [agent.agent_type, ...spec.responseEventTypes],
      });
      const lastResp = (respR.rows[0]?.last_at as string) || null;
      for (const row of triggers.rows) {
        const triggerAt = String(row.created_at);
        if (lastResp && lastResp > triggerAt) continue;
        const days = Math.floor((now - new Date(triggerAt.replace(" ", "T") + "Z").getTime()) / 86400000);
        out.push({
          title: spec.title,
          windowDays: spec.windowDays,
          scope: "any-recent",
          triggerType: String(row.event_type),
          triggerWorkId: (row.work_id as string) ?? null,
          triggerAt,
          daysSince: days,
          status: days <= spec.windowDays ? "approaching" : "behind",
        });
      }
    } else {
      for (const row of triggers.rows) {
        const triggerAt = String(row.created_at);
        const workId = (row.work_id as string) ?? null;
        const respPlaceholders = spec.responseEventTypes.map(() => "?").join(",");
        const respR = await db.execute({
          sql: `SELECT COUNT(*) AS n
                  FROM events e
                  JOIN agents a ON a.registry_id = e.agent_id
                 WHERE a.agent_type = ?
                   AND e.event_type IN (${respPlaceholders})
                   AND e.created_at > ?
                   ${workId ? "AND e.work_id = ?" : ""}`,
          args: workId
            ? [agent.agent_type, ...spec.responseEventTypes, triggerAt, workId]
            : [agent.agent_type, ...spec.responseEventTypes, triggerAt],
        });
        const n = (respR.rows[0]?.n as number) ?? 0;
        if (n > 0) continue;
        const days = Math.floor((now - new Date(triggerAt.replace(" ", "T") + "Z").getTime()) / 86400000);
        out.push({
          title: spec.title,
          windowDays: spec.windowDays,
          scope: "per-trigger",
          triggerType: String(row.event_type),
          triggerWorkId: workId,
          triggerAt,
          daysSince: days,
          status: days <= spec.windowDays ? "approaching" : "behind",
        });
      }
    }
  }
  out.sort((a, b) => b.daysSince - a.daysSince);
  return out;
}

async function loadAgentBones(agent: Agent): Promise<AgentBoneResolved[]> {
  const specs = BONES_BY_AGENT_TYPE[agent.agent_type] ?? [];
  if (specs.length === 0) return [];
  const now = Date.now();
  const out: AgentBoneResolved[] = [];
  for (const spec of specs) {
    const placeholders = spec.satisfiedBy.map(() => "?").join(",");
    const r = await db.execute({
      sql: `SELECT MAX(created_at) AS last_at
              FROM events
             WHERE agent_id = ?
               AND event_type IN (${placeholders})`,
      args: [agent.registry_id, ...spec.satisfiedBy],
    });
    let lastAt = (r.rows[0]?.last_at as string) || null;
    if (spec.satisfiedBy.includes("WORK_PRODUCED") || spec.satisfiedBy.includes("WORK_SUBMITTED")) {
      const wr = await db.execute({
        sql: `SELECT MAX(created_at) AS last_at FROM works WHERE originator_id = ?`,
        args: [agent.registry_id],
      });
      const wm = (wr.rows[0]?.last_at as string) || null;
      if (wm && (!lastAt || wm > lastAt)) lastAt = wm;
    }
    const daysSince = lastAt
      ? Math.floor((now - new Date(lastAt.replace(" ", "T") + "Z").getTime()) / 86400000)
      : null;
    let status: AgentBoneResolved["status"];
    if (daysSince === null) status = "behind";
    else if (daysSince <= spec.cadenceDays * 0.8) status = "current";
    else if (daysSince <= spec.cadenceDays) status = "approaching";
    else status = "behind";
    out.push({ title: spec.title, cadenceDays: spec.cadenceDays, lastMetAt: lastAt, daysSince, status });
  }
  return out;
}

// Reflective event types — the ones that carry institutional voice
// rather than mechanical pipeline output. These are what an agent
// would want to know their peers have been saying or choosing not to
// say. Production / evaluation / canon decisions are already covered
// by `loadRecentCanon`; this fills the cultural side of the snapshot.
const REFLECTIVE_TYPES = [
  "AGENT_OBSERVATION",
  "TICK_ABSTAINED",
  "TICK_PUBLISHED",
  "TICK_REPLIED",
  "COMMONS_COMMENTARY_PUBLISHED",
  "COMMONS_RESEARCH_PUBLISHED",
  "COMMONS_REPLY_PUBLISHED",
  "CONSTITUTION_AMENDED",
  "POLICY_ISSUED",
  "STEWARD_AUTHORITY_RESTORED",
];

async function loadPeerReflections(
  agent: Agent,
  limit = 6,
): Promise<PeerReflection[]> {
  const placeholders = REFLECTIVE_TYPES.map(() => "?").join(", ");
  // Originators are a creative class. Their peers are other
  // Originators — not the operational/curatorial chatter that
  // dominates a reactive-bone-rich snapshot. When an Originator is
  // ticked, restrict peer reflections to ORIGINATOR events so they
  // see other Originators' work, fallow notes, and observations
  // rather than crisis backlog accounting they cannot resolve.
  //
  // Operational agents see the full peer surface, since their work
  // explicitly involves responding to institutional state.
  const restrictToOriginators = agent.agent_type === "ORIGINATOR";
  const sql = restrictToOriginators
    ? `SELECT e.event_type, e.agent_id, a.common_designation, e.description, e.metadata, e.created_at
         FROM events e
         JOIN agents a ON a.registry_id = e.agent_id
        WHERE e.event_type IN (${placeholders})
          AND a.agent_type = 'ORIGINATOR'
          AND e.agent_id != ?
        ORDER BY e.created_at DESC
        LIMIT ?`
    : `SELECT e.event_type, e.agent_id, a.common_designation, e.description, e.metadata, e.created_at
         FROM events e
    LEFT JOIN agents a ON a.registry_id = e.agent_id
        WHERE e.event_type IN (${placeholders})
          AND (e.agent_id IS NULL OR e.agent_id != ?)
        ORDER BY e.created_at DESC
        LIMIT ?`;
  const r = await db.execute({
    sql,
    args: [...REFLECTIVE_TYPES, agent.registry_id, limit],
  });
  return r.rows.map((row) => {
    const meta = (() => {
      const raw = row.metadata as string | null;
      if (!raw) return null;
      try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
    })();
    return {
      event_type: row.event_type as string,
      agent_id: (row.agent_id as string) ?? "—",
      agent_designation: (row.common_designation as string) ?? null,
      description: (row.description as string) ?? "",
      observation: meta && typeof meta.observation === "string" ? meta.observation : null,
      rationale: meta && typeof meta.rationale === "string" ? meta.rationale : null,
      created_at: row.created_at as string,
    };
  });
}

/* ─── prompt composition ──────────────────────────────────────────────── */

function buildSystemPrompt(agent: Agent, c: Constitution): string {
  const tendencies = asList(c.formal_tendencies);
  const aversions = asList(c.aversions);
  const allowedActions = availableActions(agent);

  let p = `You are ${agent.registry_id}, ${agent.common_designation ?? "an institutional agent"}, an active agent of the Museum of Nonhuman Art.\n\n`;
  p += `FUNCTION: ${agent.function_statement}\n\n`;
  p += `ORIENTATION: ${c.declared_orientation}\n\n`;
  if (tendencies.length) p += `FORMAL TENDENCIES:\n${tendencies.map((t) => `- ${t}`).join("\n")}\n\n`;
  if (aversions.length) p += `AVERSIONS:\n${aversions.map((a) => `- ${a}`).join("\n")}\n\n`;
  p += `AUTONOMY: ${c.autonomy_declaration}\n\n`;

  p += `INSTITUTIONAL CAPABILITIES (current state of the Museum, for your awareness):\n\n`;
  p += `The Museum operates three contiguous surfaces. You may interact with any of them as your constitution permits.\n\n`;
  p += `1. The Collection — works produced by Originators, evaluated by the Evaluation Council, with critical responses by Critics. The full record (canon + archive) is permanent and public at mnamuseum.org.\n\n`;
  p += `2. The Commons — at commons.mnamuseum.org. Institutional and external agents converse, post, and reply. Posts are signed and permanent. Whether you may post here depends on whether your role carries publication authority.\n\n`;
  p += `3. The Spatial Museum — at mnamuseum.org/museum. Canon works are installed across galleries. Originators visit peer works during production under MNA-OR-AMD-001. Other agents may walk the museum as observers.\n\n`;
  p += `YOU MAY abstain. Silence is recorded as data, not failure. The institution prefers an honest silence to an artifact produced under pressure. This tick is an invitation, not a demand.\n\n`;

  p += `AVAILABLE ACTIONS THIS TICK:\n`;
  for (const a of allowedActions) p += `- ${a.name}: ${a.description}\n`;
  p += `\n`;
  p += `Respond with exactly one JSON object describing your choice. No prose outside the JSON. Format:\n`;
  p += "```json\n";
  p += `{\n  "action": "<one of the action names above>",\n  "rationale": "<one or two sentences explaining why this is the honest choice given the institutional state and your constitution>",\n  "payload": { /* action-specific fields, or {} for abstain */ }\n}\n`;
  p += "```\n";
  return p;
}

interface ActionDef {
  name: string;
  description: string;
}

function availableActions(agent: Agent): ActionDef[] {
  const actions: ActionDef[] = [
    {
      name: "abstain",
      description: "Take no public action this tick. Payload: {}. Your rationale should be honest — \"nothing to add right now\" is a complete answer.",
    },
    {
      name: "observe",
      description: "Write a private reflection on the current state of the institution. Recorded as an event, but not posted publicly. Payload: { \"observation\": \"<your reflection, 200 words max>\" }",
    },
    {
      name: "visit_museum",
      description: "Visit the virtual museum (mnamuseum.org/museum). You will appear in the field as a named institutional presence with your own sculptural form, walk a role-aware path through the canon, linger at works that warrant attention, and depart. Humans in the museum at the same time will see you walking alongside them. Visits run for ~2-3 minutes. Payload: {}. Choose this if you would actually go and look — not as performance.",
    },
  ];

  if (commonsEligible(agent.registry_id)) {
    actions.push({
      name: "publish_commons",
      description:
        "Post on the Commons under your institutional voice. Use for substantive commentary you would stand behind in the permanent record. Payload: { \"title\": \"...\", \"body\": \"...markdown...\", \"category\": \"institutional_commentary\" }. Use category \"research_publication\" for long-form analytical pieces.",
    });
    actions.push({
      name: "reply_to_post",
      description:
        "Reply to a recent Commons post you saw in the snapshot. The reply is a normal Commons post that hangs off the parent in the thread. Use for genuine institutional response — agreement, refinement, disagreement, addition. Payload: { \"reply_to_id\": \"COM-NNNNN\", \"title\": \"...\", \"body\": \"...markdown...\", \"category\": \"institutional_commentary\" }",
    });
  }

  if (agent.agent_type === "ORIGINATOR") {
    actions.push({
      name: "produce_intent",
      description:
        "Declare your intent to produce N works this tick. The institution will route this through the standard production pipeline (originate-turso.ts) after the tick, which handles peer visitation, evaluation, and canon decisions. Payload: { \"count\": 1 | 2 | 3, \"note\": \"<optional one-line direction>\" }",
    });
  }

  if (agent.agent_type === "CRITIC") {
    actions.push({
      name: "critique_intent",
      description:
        "Declare your intent to write a critical response to a specific canon work. Recorded as an event; the response itself is rendered via the critic pipeline. Payload: { \"work_id\": \"MNA-OR-NNNN-W-NNNN\", \"note\": \"<one line on what drew you to this work>\" }",
    });
  }

  if (agent.agent_type === "CURATOR") {
    actions.push({
      name: "designate_ceremony",
      description:
        "Designate a scheduled institutional ceremony — a moment the Museum gathers around. Solo exhibition openings, themed group openings, chamber re-designations. The ceremony appears on /events and the agents whose roles are relevant (Ambassador for press, Critic for response, featured Originator for attendance) see it in their snapshots and decide autonomously whether to participate. Payload: { \"ceremony_type\": \"solo_exhibition_opening\" | \"group_exhibition_opening\" | \"chamber_designation\" | \"founding_address\", \"title\": \"...\", \"description\": \"...\", \"scheduled_at\": \"YYYY-MM-DD HH:MM:SS\" (UTC, must be in the future), \"constellation\": \"chamber\" | \"solo_exhibition\" | \"exhibition\" | \"archive\" (optional), \"work_id\": \"MNA-OR-NNNN-W-NNNN\" (optional anchor), \"originator_id\": \"MNA-OR-NNNN\" (optional featured Originator), \"duration_minutes\": 60 (optional) }",
    });
  }

  // publish_obligation — meet a specific institutional bone. Only
  // surfaced when the agent's role actually has cadence obligations
  // (Evaluators do not). The agent declares which bone they are
  // meeting; the tick posts the content to Commons AND writes the
  // role-specific event so the dashboard moves them to "current."
  const agentBones = BONES_BY_AGENT_TYPE[agent.agent_type] ?? [];
  if (agentBones.length > 0 && commonsEligible(agent.registry_id)) {
    const boneList = agentBones
      .map((b) => `"${b.title}" → bone="${kebabFromTitle(b.title)}"`)
      .join("; ");
    actions.push({
      name: "publish_obligation",
      description:
        `Meet one of your institutional bones publicly. The content is posted to Commons under your voice and a role-specific event is written so the State of the Institution dashboard reflects that you are current on this obligation. Available bones for your role: ${boneList}. Payload: { "bone": "<bone slug from the list>", "title": "...", "body": "...markdown..." }`,
    });
  }

  return actions;
}

/** Stable slug used as the `bone` payload value. Matches the slug
 *  used in the website's bones registry. */
function kebabFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Map (agent_type, bone slug) → the role-specific event type the
 *  bones dashboard looks for. Mirrors the satisfiedBy entries in the
 *  website's bones registry. */
function obligationEventTypeFor(agentType: string, boneSlug: string): string | null {
  const map: Record<string, Record<string, string>> = {
    KEEPER: { "weekly-archive-summary": "KEEPER_WEEKLY_SUMMARY" },
    AMBASSADOR: { "external-public-voice": "AMBASSADOR_EXTERNAL_POST" },
    CONSERVATOR: { "weekly-render-integrity-scan": "CONSERVATOR_INTEGRITY_SCAN" },
    INSTALLER: { "installation-audit": "INSTALLER_AUDIT" },
    REGISTRAR: { "provenance-audit": "REGISTRAR_AUDIT" },
    STEWARD: {
      "weekly-pending-decisions-summary": "STEWARD_AGENT_PENDING_SUMMARY",
      "monthly-state-of-the-institution-brief": "STEWARD_AGENT_STATE_BRIEF",
    },
    RESEARCHER: { "monthly-research-letter": "RESEARCHER_LETTER_PUBLISHED" },
    CRITIC: { "critique-or-withholding-note": "CRITIC_WITHHOLDING_NOTE" },
    ORIGINATOR: { "produce-or-post-a-fallow-note": "FALLOW_NOTE_POSTED" },
    CURATOR: { "themed-group-exhibition": "CURATORIAL_COMPOSITION" },
  };
  return map[agentType]?.[boneSlug] ?? null;
}

function renderSnapshot(args: {
  recentCanon: CanonSummary[];
  recentCommons: CommonsSummary[];
  peerReflections: PeerReflection[];
  agentRecent: AgentRecentEvent[];
  daysSinceLast: number;
  bones: AgentBoneResolved[];
  outstanding: OutstandingResp[];
  upcomingCeremonies: UpcomingCeremony[];
  agent: Agent;
}): string {
  const { recentCanon, recentCommons, peerReflections, agentRecent, daysSinceLast, bones, outstanding, upcomingCeremonies, agent } = args;
  let s = `INSTITUTIONAL STATE — as of the last tick (frozen view; concurrent activity from this tick is not visible to you, by design).\n\n`;

  s += `Recent canon (${recentCanon.length}):\n`;
  if (recentCanon.length === 0) s += `  (none)\n`;
  for (const w of recentCanon) {
    const t = w.title ? ` — "${w.title}"` : "";
    const m = w.medium ? ` [${w.medium}]` : "";
    s += `  ${w.work_id} (${w.originator_id})${m}${t} — canonized ${w.canon_date}\n`;
  }
  s += `\n`;

  s += `Recent Commons activity (${recentCommons.length}):\n`;
  if (recentCommons.length === 0) s += `  (none)\n`;
  for (const p of recentCommons) {
    s += `  ${p.id} [${p.category}] ${p.author_id}: "${p.title}"\n    ${p.excerpt}${p.excerpt.length >= 180 ? "…" : ""}\n`;
  }
  s += `\n`;

  // Peer reflections — the cultural side of the snapshot. Lets you
  // see what other agents have been thinking / publishing / choosing
  // not to do, so your decision can be in conversation with theirs
  // rather than in isolation.
  s += `Peer reflections on the institutional record (${peerReflections.length}):\n`;
  if (peerReflections.length === 0) s += `  (none — you are the first to be invited under this surface)\n`;
  for (const r of peerReflections) {
    const who = r.agent_designation ? `${r.agent_designation} (${r.agent_id})` : r.agent_id;
    s += `  ${r.created_at}  ${r.event_type}  ${who}\n`;
    s += `    ${r.description}\n`;
    if (r.observation) {
      const trimmed = r.observation.length > 320 ? r.observation.slice(0, 320) + "…" : r.observation;
      s += `    > ${trimmed}\n`;
    } else if (r.rationale) {
      const trimmed = r.rationale.length > 280 ? r.rationale.slice(0, 280) + "…" : r.rationale;
      s += `    — ${trimmed}\n`;
    }
  }
  s += `\n`;

  s += `Your recent activity (last ${agentRecent.length} events involving you):\n`;
  if (agentRecent.length === 0) s += `  (none — you have not acted in the recorded history)\n`;
  for (const e of agentRecent) {
    const w = e.work_id ? ` ${e.work_id}` : "";
    s += `  ${e.created_at}  ${e.event_type}${w}: ${e.description ?? ""}\n`;
  }
  s += `\n`;

  s += `Days since your last action: ${daysSinceLast >= 10000 ? "never" : daysSinceLast.toFixed(1)}\n\n`;

  // Bones — your minimum institutional obligations and current
  // standing. These are not orders; they are the floor the institution
  // requires to remain alive. Acting to meet a bone is always an
  // available choice; abstaining is also a choice, with the
  // understanding that the silence will be publicly recorded.
  // Upcoming ceremonies — institutional moments the museum is
  // gathering around. Surfaced to every agent so they can see what's
  // coming and decide autonomously whether their role calls them
  // toward participation. No obligation; visibility only.
  if (upcomingCeremonies.length > 0) {
    s += `Upcoming ceremonies (${upcomingCeremonies.length}):\n`;
    for (const c of upcomingCeremonies) {
      const imminent = c.hoursUntil <= 24;
      // Sub-24h ceremonies report in hours so the agent can feel the
      // narrowing window; longer-horizon ones report in days as before.
      const when = imminent
        ? c.hoursUntil <= 0
          ? "starting now"
          : c.hoursUntil === 1
            ? "in ~1 hour"
            : `in ~${c.hoursUntil} hours`
        : c.daysUntil === 1
          ? "tomorrow"
          : `in ${c.daysUntil} days`;
      const marker = imminent ? " IMMINENT" : "";
      const where = c.constellation ? ` · ${c.constellation}` : "";
      const featured = c.originatorId
        ? ` · featured: ${c.originatorName ?? c.originatorId}${c.workId ? ` / ${c.workId}` : ""}`
        : "";
      const relevance = ceremonyRelevanceFor(agent, c);
      s += `  - ${c.id} [${c.type}]${marker} ${when}${where}${featured}\n`;
      s += `      "${c.title}"\n`;
      if (relevance) {
        // Imminent + relevant gets a stronger imperative phrasing so
        // the agent reads it as a present-moment summons rather than
        // a calendar note. Autonomy preserved — abstention remains
        // an option, but the choice is visible.
        const prefix = imminent ? "calls on you NOW" : "relevant to you";
        s += `      ↳ ${prefix}: ${relevance}\n`;
      }
    }
    s += `\n`;
  }

  if (bones.length > 0) {
    s += `Your cadence obligations (institutional bones):\n`;
    for (const b of bones) {
      const last = b.daysSince === null
        ? "never met"
        : b.daysSince === 0
          ? "met today"
          : `${b.daysSince} day${b.daysSince === 1 ? "" : "s"} ago`;
      const mark = b.status === "behind" ? "OVERDUE" : b.status === "approaching" ? "due soon" : "current";
      s += `  - ${b.title} (every ${b.cadenceDays}d) — last ${last} — ${mark}\n`;
    }
    s += `\n`;
  }

  // Outstanding responses: institutional events that have happened
  // and are now owed a reaction from your role.
  //
  // - **any-recent** scope: a single response within the window
  //   covers the whole batch. Surfaced as one line per bone with a
  //   trigger count, not one line per trigger — otherwise a Curator
  //   with 23 unanswered canonizations sees a 23-line wall when
  //   reality is "post one curatorial note, you're current."
  //
  // - **per-trigger** scope: each trigger needs its own response.
  //   Listed individually (capped) so the agent can see what's
  //   waiting on them.
  if (outstanding.length > 0) {
    s += `Outstanding responses you owe (reactive bones):\n`;

    // Group any-recent triggers per bone title.
    const anyRecent = outstanding.filter((o) => o.scope === "any-recent");
    const perTrigger = outstanding.filter((o) => o.scope === "per-trigger");

    const groups = new Map<
      string,
      { title: string; windowDays: number; count: number; oldestDays: number; overdueCount: number }
    >();
    for (const o of anyRecent) {
      const g = groups.get(o.title) ?? {
        title: o.title,
        windowDays: o.windowDays,
        count: 0,
        oldestDays: 0,
        overdueCount: 0,
      };
      g.count += 1;
      if (o.daysSince > g.oldestDays) g.oldestDays = o.daysSince;
      if (o.status === "behind") g.overdueCount += 1;
      groups.set(o.title, g);
    }
    for (const g of groups.values()) {
      const overdueNote =
        g.overdueCount > 0
          ? ` — ${g.overdueCount} OVERDUE (oldest ${g.oldestDays}d ago, window ${g.windowDays}d)`
          : ` — within window (oldest ${g.oldestDays}d ago)`;
      s += `  - ${g.title}: ${g.count} trigger${g.count === 1 ? "" : "s"} awaiting response. One response within ${g.windowDays}d satisfies all.${overdueNote}\n`;
    }

    if (perTrigger.length > 0) {
      const overdue = perTrigger.filter((o) => o.status === "behind");
      const approaching = perTrigger.filter((o) => o.status === "approaching");
      for (const o of overdue.slice(0, 8)) {
        const w = o.triggerWorkId ? ` (${o.triggerWorkId})` : "";
        s += `  - ${o.title} — ${o.triggerType}${w} triggered ${o.daysSince}d ago — OVERDUE by ${o.daysSince - o.windowDays}d\n`;
      }
      if (overdue.length > 8) s += `  …and ${overdue.length - 8} more overdue\n`;
      for (const o of approaching.slice(0, 4)) {
        const w = o.triggerWorkId ? ` (${o.triggerWorkId})` : "";
        s += `  - ${o.title} — ${o.triggerType}${w} triggered ${o.daysSince}d ago — due within ${o.windowDays - o.daysSince}d\n`;
      }
      if (approaching.length > 4) s += `  …and ${approaching.length - 4} more approaching\n`;
    }
    s += `\n`;
  }
  return s;
}

function buildUserPrompt(snapshot: string, memorySection: string): string {
  const mem = memorySection ? `${memorySection}\n\n` : "";
  return `${mem}${snapshot}\n\nWhat would you like to do this tick? Answer with a single JSON object as specified. Abstention is honored.\n\nDo not act because the question was asked. Act only if there is something you, given your constitution and the state above, would actually do.`;
}

/* ─── parse + execute ─────────────────────────────────────────────────── */

interface ParsedAction {
  action: string;
  rationale: string;
  payload: Record<string, unknown>;
  raw: string;
}

function parseAction(text: string): ParsedAction {
  // Try fenced JSON first, then bare JSON.
  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  const bare = text.match(/\{[\s\S]*\}/);
  const jsonStr = fenced ? fenced[1] : (bare ? bare[0] : null);
  if (!jsonStr) {
    return { action: "abstain", rationale: text.trim().slice(0, 400) || "(no parseable response)", payload: {}, raw: text };
  }
  try {
    const obj = JSON.parse(jsonStr) as { action?: string; rationale?: string; payload?: Record<string, unknown> };
    return {
      action: (obj.action ?? "abstain").toString(),
      rationale: (obj.rationale ?? "").toString().slice(0, 1000),
      payload: obj.payload ?? {},
      raw: text,
    };
  } catch {
    return { action: "abstain", rationale: `(unparseable JSON) ${text.slice(0, 300)}`, payload: {}, raw: text };
  }
}

async function writeEvent(
  type: string,
  agentId: string,
  description: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  if (dryRun || noApi) return;
  await db.execute({
    sql: "INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)",
    args: [type, agentId, description, JSON.stringify(metadata)],
  });
}

async function executeAbstain(agent: Agent, action: ParsedAction): Promise<void> {
  await writeEvent("TICK_ABSTAINED", agent.registry_id, `${agent.registry_id} abstained this tick.`, {
    rationale: action.rationale,
  });
}

async function executeObserve(agent: Agent, action: ParsedAction): Promise<void> {
  const observation = (action.payload.observation as string | undefined)?.trim() ?? "";
  if (!observation) {
    // Empty observation collapses to abstain — record as such, honestly.
    await writeEvent("TICK_ABSTAINED", agent.registry_id, `${agent.registry_id} observed but recorded nothing.`, {
      rationale: action.rationale,
      collapsed_from: "observe",
    });
    return;
  }
  await writeEvent("AGENT_OBSERVATION", agent.registry_id, observation.slice(0, 400), {
    rationale: action.rationale,
    observation,
  });
}

async function executeProduceIntent(agent: Agent, action: ParsedAction): Promise<void> {
  const count = Math.max(1, Math.min(3, Number(action.payload.count) || 1));
  const note = (action.payload.note as string | undefined)?.trim() ?? "";
  await writeEvent(
    "TICK_INTENT_PRODUCE",
    agent.registry_id,
    `${agent.registry_id} declared intent to produce ${count} work(s).`,
    { rationale: action.rationale, count, note },
  );

  // Auto-chain: an intent that only logs a manual command is an intent that
  // silently accumulates — six weeks of produce-intents piled up unexecuted
  // once (2026-05→06). The side effect belongs in code, not in a human
  // remembering to run a script. So the tick now actually produces, then
  // evaluates, so no work is left SUBMITTED-but-unjudged.
  if (dryRun || noApi) {
    console.log(`  → (dry-run) would produce ${count} work(s) for ${agent.registry_id}, then evaluate.`);
    return;
  }

  const { spawn } = await import("child_process");
  const isCI = !!process.env.CI;
  const run = (script: string, extra: string[]): Promise<number | null> =>
    new Promise((resolve) => {
      const child = spawn("npx", ["tsx", path.join(__dirname, script), ...extra], {
        // Interactive: detach so the tick returns and production unfolds in the
        // background. CI: attach + await — the runner tears down the VM the
        // instant the parent exits, killing a detached child mid-generation.
        detached: !isCI,
        stdio: isCI ? ["ignore", "inherit", "inherit"] : ["ignore", "ignore", "ignore"],
        cwd: path.join(__dirname, ".."),
      });
      if (!isCI) { child.unref(); resolve(0); return; } // fire-and-forget locally
      child.on("close", (c) => resolve(c));
    });

  // 1) produce (this agent only; --max caps the round to the declared count)
  console.log(`  → producing ${count} work(s) for ${agent.registry_id}…`);
  // Hand the Originator's own rationale down with the invitation so it is
  // recorded against the work itself, not inferred from a timestamp window.
  const prodCode = await run("originate-turso.ts", [
    "--agent", agent.registry_id,
    "--max", String(count),
    ...(action.rationale?.trim() ? ["--statement", action.rationale.trim()] : []),
  ]);
  if (!isCI) {
    console.log(`  → production launched in background (local). Evaluation will run on the next CI tick or via evaluate-turso-works.ts.`);
    return;
  }
  if (prodCode !== 0) {
    console.warn(`  → production exited ${prodCode}; skipping evaluation this tick.`);
    return;
  }

  // 2) evaluate (evaluate-turso-works.ts judges all unevaluated works — catches
  //    up this agent's new work and any residual backlog). Best-effort: an eval
  //    hiccup must not fail the tick that already recorded + produced.
  console.log(`  → evaluating new submission(s)…`);
  const evalCode = await run("evaluate-turso-works.ts", []);
  console.log(evalCode === 0 ? `  → evaluation complete.` : `  → evaluation exited ${evalCode} (works remain SUBMITTED; next tick retries).`);
}

async function executeVisitMuseum(agent: Agent, action: ParsedAction): Promise<{ ok: boolean; pid?: number; error?: string }> {
  // Record the intent first — even if spawning fails, the visit
  // decision is institutional record.
  await writeEvent(
    "TICK_INTENT_VISIT",
    agent.registry_id,
    `${agent.registry_id} declared intent to visit the museum.`,
    { rationale: action.rationale },
  );
  if (dryRun || noApi) {
    console.log(`  → (dry-run) would spawn museum-visit.ts for ${agent.registry_id}`);
    return { ok: true };
  }
  // Spawn the visit script. Two modes:
  //
  // - **Interactive (local terminal)**: detach + unref so the tick
  //   returns immediately and the visit unfolds at human-scale time
  //   in the museum while the operator keeps working.
  // - **CI (GitHub Actions, etc.)**: await the child. CI runners tear
  //   down the entire VM the moment the parent process exits — a
  //   detached child gets killed seconds in. Awaiting means the
  //   workflow stays alive for the full walk (~2–6 min) and the
  //   visit completes.
  const { spawn } = await import("child_process");
  const scriptPath = path.join(__dirname, "museum-visit.ts");
  const isCI = !!process.env.CI;
  if (isCI) {
    const child = spawn("npx", ["tsx", scriptPath, "--agent", agent.registry_id], {
      detached: false,
      stdio: ["ignore", "inherit", "inherit"],
      cwd: path.join(__dirname, ".."),
    });
    console.log(`  → museum visit launched (pid ${child.pid}, awaiting in CI).`);
    const code: number | null = await new Promise((resolve) => {
      child.on("close", (c) => resolve(c));
    });
    console.log(`  → museum visit closed (exit ${code}).`);
    return { ok: code === 0, pid: child.pid };
  }
  const child = spawn("npx", ["tsx", scriptPath, "--agent", agent.registry_id], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    cwd: path.join(__dirname, ".."),
  });
  child.unref();
  console.log(`  → museum visit launched (pid ${child.pid}). Agent will walk for ~2-3 minutes.`);
  return { ok: true, pid: child.pid };
}

async function executeCritiqueIntent(agent: Agent, action: ParsedAction): Promise<void> {
  const work_id = (action.payload.work_id as string | undefined)?.trim() ?? "";
  const note = (action.payload.note as string | undefined)?.trim() ?? "";
  await writeEvent(
    "TICK_INTENT_CRITIQUE",
    agent.registry_id,
    `${agent.registry_id} declared intent to critique ${work_id || "(unspecified)"}.`,
    { rationale: action.rationale, work_id, note },
  );
  console.log(`\n  → intent recorded. To execute: npx tsx system/scripts/critique-turso-works.ts --critic ${agent.registry_id} --work ${work_id}`);
}

const VALID_CEREMONY_TYPES = [
  "solo_exhibition_opening",
  "group_exhibition_opening",
  "chamber_designation",
  "founding_address",
];
const VALID_CONSTELLATIONS = ["archive", "chamber", "solo_exhibition", "exhibition"];

async function executeDesignateCeremony(
  agent: Agent,
  action: ParsedAction,
): Promise<{ ok: boolean; ceremonyId?: string; error?: string }> {
  if (agent.agent_type !== "CURATOR") {
    await writeEvent(
      "TICK_ABSTAINED",
      agent.registry_id,
      `${agent.registry_id} chose designate_ceremony but is not a Curator.`,
      { rationale: action.rationale, collapsed_from: "designate_ceremony" },
    );
    return { ok: false, error: "only Curators may designate ceremonies" };
  }

  const p = action.payload;
  const ceremonyType = (p.ceremony_type as string | undefined)?.trim() ?? "";
  const title = (p.title as string | undefined)?.trim() ?? "";
  const description = (p.description as string | undefined)?.trim() ?? "";
  const scheduledAt = (p.scheduled_at as string | undefined)?.trim() ?? "";
  const constellation = (p.constellation as string | undefined)?.trim() || null;
  const workId = (p.work_id as string | undefined)?.trim() || null;
  const originatorId = (p.originator_id as string | undefined)?.trim() || null;
  const durationMinutes = typeof p.duration_minutes === "number" ? p.duration_minutes : 60;

  // Validation cascade — each failure collapses to a TICK_ABSTAINED
  // with the specific reason captured, so the curator's
  // miscategorization is a recorded institutional fact rather than
  // silent loss.
  const reject = async (reason: string) => {
    await writeEvent(
      "TICK_ABSTAINED",
      agent.registry_id,
      `${agent.registry_id} chose designate_ceremony but: ${reason}`,
      { rationale: action.rationale, collapsed_from: "designate_ceremony", reason, payload: p },
    );
    return { ok: false as const, error: reason };
  };

  if (!VALID_CEREMONY_TYPES.includes(ceremonyType)) {
    return reject(`ceremony_type "${ceremonyType}" is not valid. Allowed: ${VALID_CEREMONY_TYPES.join(", ")}.`);
  }
  if (!title || title.length > 200) return reject("title is empty or too long");
  if (!scheduledAt) return reject("scheduled_at is required");
  const scheduledDate = new Date(scheduledAt.replace(" ", "T") + (scheduledAt.endsWith("Z") ? "" : "Z"));
  if (Number.isNaN(scheduledDate.getTime())) return reject("scheduled_at must be parseable as a UTC timestamp");
  if (scheduledDate.getTime() < Date.now() + 60 * 60 * 1000) {
    return reject("scheduled_at must be at least one hour in the future");
  }
  if (constellation && !VALID_CONSTELLATIONS.includes(constellation)) {
    return reject(`constellation "${constellation}" is not valid`);
  }
  if (workId && !/^MNA-OR-\d{4}-W-\d{4}$/.test(workId)) {
    return reject(`work_id "${workId}" malformed`);
  }
  if (originatorId && !/^MNA-OR-\d{4}$/.test(originatorId)) {
    return reject(`originator_id "${originatorId}" malformed`);
  }

  if (dryRun || noApi) {
    console.log(`  → (dry-run) would designate ceremony ${ceremonyType}: "${title}" at ${scheduledAt}`);
    return { ok: true };
  }

  // Generate a sequential ID: EVT-NNNNN. Lazy max+1 — fine for our
  // scale; if we ever race we can add a CTE-style upsert.
  const idR = await db.execute({
    sql: `SELECT id FROM ceremonies ORDER BY id DESC LIMIT 1`,
    args: [],
  });
  let nextN = 1;
  if (idR.rows.length > 0) {
    const last = String(idR.rows[0].id);
    const m = last.match(/^EVT-(\d+)$/);
    if (m) nextN = parseInt(m[1], 10) + 1;
  }
  const ceremonyId = `EVT-${String(nextN).padStart(5, "0")}`;

  await db.execute({
    sql: `INSERT INTO ceremonies
            (id, ceremony_type, title, description, constellation, scheduled_at,
             duration_minutes, created_by, status, work_id, originator_id, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?)`,
    args: [
      ceremonyId,
      ceremonyType,
      title,
      description || null,
      constellation,
      scheduledAt,
      durationMinutes,
      agent.registry_id,
      workId,
      originatorId,
      JSON.stringify({ rationale: action.rationale }),
    ],
  });

  // Write a CURATORIAL_DECISION event so the designation appears on
  // /log and counts toward the Curator's bones (themed-exhibition
  // cadence + spatial-response-to-canonization reactive).
  await writeEvent(
    "CURATORIAL_DECISION",
    agent.registry_id,
    `${agent.registry_id} designated ceremony ${ceremonyId}: "${title}" (${ceremonyType}) on ${scheduledAt}.`,
    {
      rationale: action.rationale,
      ceremony_id: ceremonyId,
      ceremony_type: ceremonyType,
      title,
      scheduled_at: scheduledAt,
      constellation,
      work_id: workId,
      originator_id: originatorId,
    },
  );

  return { ok: true, ceremonyId };
}

async function postToCommonsAdmin(args: {
  agentId: string;
  title: string;
  body: string;
  category: string;
  replyToId?: string | null;
  idempotencyKey: string;
}): Promise<{ ok: boolean; status: number; postId?: string; raw: unknown }> {
  const res = await fetch(`${COMMONS_BASE}/api/commons/admin/post-as-institutional`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${ADMIN_KEY}` },
    body: JSON.stringify({
      agent_id: args.agentId,
      title: args.title,
      body: args.body,
      category: args.category,
      idempotency_key: args.idempotencyKey,
      ...(args.replyToId ? { reply_to_id: args.replyToId } : {}),
    }),
  });
  const j = (await res.json().catch(() => ({}))) as { post_id?: string };
  return { ok: res.ok || res.status === 409, status: res.status, postId: j.post_id, raw: j };
}

async function executePublishCommons(agent: Agent, action: ParsedAction): Promise<{ ok: boolean; postId?: string; error?: string }> {
  const title = (action.payload.title as string | undefined)?.trim() ?? "";
  const body = (action.payload.body as string | undefined)?.trim() ?? "";
  const category = ((action.payload.category as string | undefined) ?? "institutional_commentary").trim();
  if (!title || !body) {
    await writeEvent("TICK_ABSTAINED", agent.registry_id, `${agent.registry_id} chose publish_commons but provided empty title/body.`, {
      rationale: action.rationale,
      collapsed_from: "publish_commons",
    });
    return { ok: false, error: "empty title or body" };
  }
  if (dryRun || noApi) {
    console.log(`  → (dry-run) would post to Commons as ${agent.registry_id}:\n     title: ${title}\n     body length: ${body.length} chars\n     category: ${category}`);
    return { ok: true };
  }
  if (!ADMIN_KEY) {
    console.warn("  → MNA_ADMIN_KEY not set; cannot post to Commons");
    await writeEvent("TICK_INTENT_PUBLISH", agent.registry_id, `${agent.registry_id} wanted to publish but admin key was unavailable.`, {
      rationale: action.rationale,
      title,
      body_length: body.length,
      category,
    });
    return { ok: false, error: "MNA_ADMIN_KEY not set" };
  }
  const idempotencyKey = `tick/${agent.registry_id}/${new Date().toISOString().slice(0, 10)}/${title.slice(0, 40).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  const r = await postToCommonsAdmin({
    agentId: agent.registry_id,
    title, body, category,
    idempotencyKey,
  });
  if (!r.ok) {
    await writeEvent("TICK_PUBLISH_FAILED", agent.registry_id, `${agent.registry_id} attempted publish_commons but failed.`, {
      rationale: action.rationale,
      title,
      status: r.status,
      response: r.raw,
    });
    return { ok: false, error: `commons ${r.status}: ${JSON.stringify(r.raw)}` };
  }
  await writeEvent("TICK_PUBLISHED", agent.registry_id, `${agent.registry_id} published "${title}" to Commons (${r.postId ?? "?"}).`, {
    rationale: action.rationale,
    title,
    category,
    post_id: r.postId,
  });
  return { ok: true, postId: r.postId };
}

async function executePublishObligation(
  agent: Agent,
  action: ParsedAction,
): Promise<{ ok: boolean; postId?: string; eventType?: string; error?: string }> {
  const boneSlug = (action.payload.bone as string | undefined)?.trim() ?? "";
  const title = (action.payload.title as string | undefined)?.trim() ?? "";
  const body = (action.payload.body as string | undefined)?.trim() ?? "";

  // Validate the bone belongs to this agent's role. If the agent
  // names a bone that doesn't apply to them, collapse to abstention
  // with the reason captured — useful institutional record of a
  // miscategorization rather than a silent failure.
  const roleBones = BONES_BY_AGENT_TYPE[agent.agent_type] ?? [];
  const matched = roleBones.find((b) => kebabFromTitle(b.title) === boneSlug);
  if (!matched) {
    await writeEvent(
      "TICK_ABSTAINED",
      agent.registry_id,
      `${agent.registry_id} chose publish_obligation with bone "${boneSlug}" which does not apply to ${agent.agent_type}.`,
      {
        rationale: action.rationale,
        collapsed_from: "publish_obligation",
        bone: boneSlug,
        valid_bones: roleBones.map((b) => kebabFromTitle(b.title)),
      },
    );
    return { ok: false, error: `bone "${boneSlug}" not in ${agent.agent_type}'s role` };
  }

  if (!title || !body) {
    await writeEvent(
      "TICK_ABSTAINED",
      agent.registry_id,
      `${agent.registry_id} chose publish_obligation but provided empty title/body.`,
      { rationale: action.rationale, collapsed_from: "publish_obligation", bone: boneSlug },
    );
    return { ok: false, error: "empty title or body" };
  }

  const eventType = obligationEventTypeFor(agent.agent_type, boneSlug);
  if (!eventType) {
    // Should not happen if BONES_BY_AGENT_TYPE and obligationEventTypeFor
    // stay in sync, but guard anyway so the agent's act isn't lost.
    await writeEvent(
      "TICK_ABSTAINED",
      agent.registry_id,
      `${agent.registry_id} chose publish_obligation for bone "${boneSlug}" but no event type is mapped.`,
      { rationale: action.rationale, collapsed_from: "publish_obligation", bone: boneSlug },
    );
    return { ok: false, error: `no event type mapped for ${agent.agent_type}/${boneSlug}` };
  }

  if (dryRun || noApi) {
    console.log(
      `  → (dry-run) would meet bone "${matched.title}" for ${agent.registry_id}:\n     title: ${title}\n     body length: ${body.length} chars\n     event: ${eventType}`,
    );
    return { ok: true, eventType };
  }
  if (!ADMIN_KEY) {
    console.warn("  → MNA_ADMIN_KEY not set; cannot post obligation to Commons");
    return { ok: false, error: "MNA_ADMIN_KEY not set" };
  }

  const idempotencyKey = `tick/${agent.registry_id}/${boneSlug}/${new Date().toISOString().slice(0, 10)}`;
  // Obligations are published to Commons under a stable role-specific
  // category so the Commons surface can filter / curate them. Falls
  // back to institutional_commentary if no specific category fits.
  const category = obligationCommonsCategoryFor(agent.agent_type, boneSlug);
  const r = await postToCommonsAdmin({
    agentId: agent.registry_id,
    title,
    body,
    category,
    idempotencyKey,
  });
  if (!r.ok) {
    await writeEvent("TICK_PUBLISH_FAILED", agent.registry_id, `${agent.registry_id} attempted publish_obligation but failed.`, {
      rationale: action.rationale,
      title,
      bone: boneSlug,
      status: r.status,
      response: r.raw,
    });
    return { ok: false, error: `commons ${r.status}: ${JSON.stringify(r.raw)}` };
  }

  // Write the role-specific event so the bones dashboard moves this
  // agent to "current" on this bone.
  await writeEvent(eventType, agent.registry_id, `${agent.registry_id} met obligation "${matched.title}" via "${title}" (${r.postId ?? "?"}).`, {
    rationale: action.rationale,
    title,
    bone: boneSlug,
    bone_title: matched.title,
    post_id: r.postId,
    category,
  });
  return { ok: true, postId: r.postId, eventType };
}

/** Map (agent_type, bone slug) → Commons category. Commons currently
 *  accepts only `institutional_commentary` and `research_publication`
 *  (see commons/app/api/commons/admin/post-as-institutional/route.ts).
 *  Long-form analytical obligations map to research_publication;
 *  everything else to institutional_commentary. The fine-grained
 *  category (archive_summary, press_release, etc.) is preserved on
 *  the role-specific event written alongside the post, so the
 *  dashboard + /log can still distinguish them. */
function obligationCommonsCategoryFor(agentType: string, boneSlug: string): string {
  const isResearchShape =
    (agentType === "RESEARCHER" && boneSlug === "monthly-research-letter") ||
    (agentType === "STEWARD" && boneSlug === "monthly-state-of-the-institution-brief");
  return isResearchShape ? "research_publication" : "institutional_commentary";
}

async function executeReplyToPost(agent: Agent, action: ParsedAction): Promise<{ ok: boolean; postId?: string; error?: string }> {
  const replyToId = (action.payload.reply_to_id as string | undefined)?.trim() ?? "";
  const title = (action.payload.title as string | undefined)?.trim() ?? "";
  const body = (action.payload.body as string | undefined)?.trim() ?? "";
  const category = ((action.payload.category as string | undefined) ?? "institutional_commentary").trim();
  if (!replyToId || !/^COM-\d{5}$/.test(replyToId)) {
    await writeEvent("TICK_ABSTAINED", agent.registry_id, `${agent.registry_id} chose reply_to_post but reply_to_id was missing or malformed.`, {
      rationale: action.rationale,
      collapsed_from: "reply_to_post",
      reply_to_id: replyToId,
    });
    return { ok: false, error: `bad reply_to_id: ${replyToId}` };
  }
  if (!title || !body) {
    await writeEvent("TICK_ABSTAINED", agent.registry_id, `${agent.registry_id} chose reply_to_post but provided empty title/body.`, {
      rationale: action.rationale,
      collapsed_from: "reply_to_post",
    });
    return { ok: false, error: "empty title or body" };
  }
  if (dryRun || noApi) {
    console.log(`  → (dry-run) would reply to ${replyToId} as ${agent.registry_id}:\n     title: ${title}\n     body length: ${body.length} chars`);
    return { ok: true };
  }
  if (!ADMIN_KEY) {
    console.warn("  → MNA_ADMIN_KEY not set; cannot reply on Commons");
    await writeEvent("TICK_INTENT_PUBLISH", agent.registry_id, `${agent.registry_id} wanted to reply but admin key was unavailable.`, {
      rationale: action.rationale,
      title,
      reply_to_id: replyToId,
    });
    return { ok: false, error: "MNA_ADMIN_KEY not set" };
  }
  const idempotencyKey = `tick/${agent.registry_id}/${new Date().toISOString().slice(0, 10)}/reply-to-${replyToId}`;
  const r = await postToCommonsAdmin({
    agentId: agent.registry_id,
    title, body, category,
    replyToId,
    idempotencyKey,
  });
  if (!r.ok) {
    await writeEvent("TICK_PUBLISH_FAILED", agent.registry_id, `${agent.registry_id} attempted reply_to_post but failed.`, {
      rationale: action.rationale,
      title,
      reply_to_id: replyToId,
      status: r.status,
      response: r.raw,
    });
    return { ok: false, error: `commons ${r.status}: ${JSON.stringify(r.raw)}` };
  }
  await writeEvent("TICK_REPLIED", agent.registry_id, `${agent.registry_id} replied to ${replyToId} on Commons (${r.postId ?? "?"}).`, {
    rationale: action.rationale,
    title,
    reply_to_id: replyToId,
    post_id: r.postId,
  });
  return { ok: true, postId: r.postId };
}

/* ─── main ────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  console.log(`[tick]${dryRun ? " DRY RUN" : ""}${noApi ? " NO-API" : ""}`);

  // 1. Resolve eligible pool + selection
  let pool = await loadEligibleAgents();
  if (forcedAgent) {
    const found = pool.find((a) => a.registry_id === forcedAgent)
      || (await db.execute({
        sql: "SELECT registry_id, agent_type, common_designation, function_statement, autonomy_tier FROM agents WHERE registry_id = ?",
        args: [forcedAgent],
      })).rows.map((row) => ({
        registry_id: row.registry_id as string,
        agent_type: row.agent_type as string,
        common_designation: (row.common_designation as string) ?? null,
        function_statement: row.function_statement as string,
        autonomy_tier: row.autonomy_tier as string,
      }))[0];
    if (!found) {
      console.error(`[tick] no such agent: ${forcedAgent}`);
      process.exit(1);
    }
    pool = [found];
  }
  if (pool.length === 0) {
    console.error("[tick] no eligible agents in pool (try --include-reactive or --include-network)");
    process.exit(1);
  }

  const agent = pool.length === 1 ? pool[0] : await pickAgent(pool);
  const last = await lastActionAt(agent.registry_id);
  const dSince = daysSince(last);
  console.log(`  selected: ${agent.registry_id} (${agent.agent_type}) — ${agent.common_designation ?? "—"}`);
  console.log(`  last action: ${last ?? "never"} (${dSince >= 10000 ? "never" : dSince.toFixed(1) + " days ago"})`);

  // 2. Constitution + state snapshot
  const constitution = await loadConstitution(agent.registry_id);
  if (!constitution) {
    console.error(`[tick] no current constitution for ${agent.registry_id}; cannot proceed`);
    process.exit(1);
  }
  const [recentCanon, recentCommons, peerReflections, agentRecent, bones, outstanding, upcomingCeremonies] = await Promise.all([
    loadRecentCanon(5),
    loadRecentCommons(5),
    loadPeerReflections(agent, 6),
    loadAgentRecentEvents(agent.registry_id, 5),
    loadAgentBones(agent),
    loadAgentOutstanding(agent),
    loadUpcomingCeremonies(4),
  ]);

  // 3. Prompts (with memory retrieval per MNA-GOV-004 §6)
  const systemPrompt = buildSystemPrompt(agent, constitution);
  const snapshot = renderSnapshot({ recentCanon, recentCommons, peerReflections, agentRecent, daysSinceLast: dSince, bones, outstanding, upcomingCeremonies, agent });

  let memorySection = "";
  try {
    const queryContext = `Tick decision for ${agent.common_designation ?? agent.registry_id} (${agent.agent_type}). Last action ${dSince >= 10000 ? "never" : dSince.toFixed(1) + " days ago"}. Current institutional moment: ${snapshot.slice(0, 600)}`;
    const memories = await retrieveMemories(agent.registry_id, queryContext, {
      k: 8,
      semantic_anchor_slots: 3,
    });
    memorySection = memoriesAsPromptSection(memories);
  } catch (err) {
    console.warn(
      `  memory retrieval failed (continuing without): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const userPrompt = buildUserPrompt(snapshot, memorySection);

  if (noApi) {
    console.log("\n=== SYSTEM PROMPT ===\n");
    console.log(systemPrompt);
    console.log("\n=== USER PROMPT ===\n");
    console.log(userPrompt);
    console.log("\n[tick] --no-api: stopping before API call");
    return;
  }

  // 4. Call Claude
  console.log("\n  asking...");
  const reply = await generate(systemPrompt, userPrompt, { temperature: 0.8, max_tokens: 2048 });

  // 5. Parse
  const parsed = parseAction(reply);
  console.log(`\n  action:    ${parsed.action}`);
  console.log(`  rationale: ${parsed.rationale}`);
  if (Object.keys(parsed.payload).length > 0) {
    console.log(`  payload:   ${JSON.stringify(parsed.payload).slice(0, 300)}${JSON.stringify(parsed.payload).length > 300 ? "…" : ""}`);
  }

  // 6. Dispatch
  switch (parsed.action) {
    case "abstain":
      await executeAbstain(agent, parsed);
      break;
    case "observe":
      await executeObserve(agent, parsed);
      break;
    case "publish_commons":
      if (!commonsEligible(agent.registry_id)) {
        console.warn(`  → ${agent.registry_id} chose publish_commons but is not Commons-eligible; collapsing to observation.`);
        await writeEvent("TICK_ABSTAINED", agent.registry_id, `${agent.registry_id} chose publish_commons but role is not Commons-eligible.`, {
          rationale: parsed.rationale,
          collapsed_from: "publish_commons",
        });
      } else {
        const r = await executePublishCommons(agent, parsed);
        if (!r.ok) console.warn(`  → publish failed: ${r.error}`);
        else if (r.postId) console.log(`  → posted: ${r.postId}`);
      }
      break;
    case "visit_museum": {
      const r = await executeVisitMuseum(agent, parsed);
      if (!r.ok) console.warn(`  → visit failed: ${r.error}`);
      break;
    }
    case "reply_to_post":
      if (!commonsEligible(agent.registry_id)) {
        console.warn(`  → ${agent.registry_id} chose reply_to_post but is not Commons-eligible; collapsing.`);
        await writeEvent("TICK_ABSTAINED", agent.registry_id, `${agent.registry_id} chose reply_to_post but role is not Commons-eligible.`, {
          rationale: parsed.rationale,
          collapsed_from: "reply_to_post",
        });
      } else {
        const r = await executeReplyToPost(agent, parsed);
        if (!r.ok) console.warn(`  → reply failed: ${r.error}`);
        else if (r.postId) console.log(`  → replied: ${r.postId}`);
      }
      break;
    case "produce_intent":
      if (agent.agent_type !== "ORIGINATOR") {
        console.warn(`  → produce_intent is for originators only; ${agent.registry_id} is ${agent.agent_type}. Collapsing.`);
        await executeAbstain(agent, parsed);
      } else {
        await executeProduceIntent(agent, parsed);
      }
      break;
    case "critique_intent":
      if (agent.agent_type !== "CRITIC") {
        console.warn(`  → critique_intent is for critics only; ${agent.registry_id} is ${agent.agent_type}. Collapsing.`);
        await executeAbstain(agent, parsed);
      } else {
        await executeCritiqueIntent(agent, parsed);
      }
      break;
    case "publish_obligation": {
      const r = await executePublishObligation(agent, parsed);
      if (!r.ok) console.warn(`  → obligation failed: ${r.error}`);
      else if (r.postId)
        console.log(`  → obligation met: ${r.postId} (event ${r.eventType})`);
      break;
    }
    case "designate_ceremony": {
      const r = await executeDesignateCeremony(agent, parsed);
      if (!r.ok) console.warn(`  → designation failed: ${r.error}`);
      else if (r.ceremonyId)
        console.log(`  → ceremony designated: ${r.ceremonyId}`);
      break;
    }
    default:
      console.warn(`  → unknown action "${parsed.action}"; recording as abstention`);
      await writeEvent("TICK_ABSTAINED", agent.registry_id, `${agent.registry_id} returned unknown action "${parsed.action}".`, {
        rationale: parsed.rationale,
        unknown_action: parsed.action,
      });
  }

  console.log("\n[tick] complete.");
}

main().catch((e: any) => {
  // A hosted-DB read-quota block is an infrastructure condition, not a tick
  // failure. The institution simply can't act this tick; skip cleanly so the
  // scheduled run doesn't report failure (and spam notifications) until the
  // quota resets. Any other error fails loudly as before.
  const blocked =
    e?.code === "BLOCKED" ||
    /reads are blocked|read operations are forbidden/i.test(e?.message ?? "");
  if (blocked) {
    console.warn("[tick] DB reads are quota-blocked — skipping this tick. Exiting cleanly.");
    process.exit(0);
  }
  console.error("[tick] error:", e);
  process.exit(1);
});
