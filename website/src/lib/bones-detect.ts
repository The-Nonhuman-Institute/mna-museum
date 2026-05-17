/**
 * Bones detection — query the institutional state to determine
 * whether each agent's bones are currently met.
 *
 * Source of truth: the `events` table in Turso. Each bone declares a
 * set of `satisfiedBy` event types. The most recent event of any
 * matching type for the agent determines whether the bone is current,
 * approaching, or behind.
 *
 * For Originators, "WORK_PRODUCED" lives in the `works` table rather
 * than the events table; we union the two timestamps when looking up.
 *
 * This module is read-only. It powers the /institution/state
 * dashboard, the per-agent widget on /agent/[id], and (via the
 * system/scripts pipeline) the tick prompt — so an agent who is
 * behind on a bone sees that fact at decision time.
 */

import { getDb } from "./registration-db";
import {
  BONES_BY_AGENT_TYPE,
  classifyBoneStatus,
  type AgentType,
  type BoneSpec,
  type BoneStatus,
} from "./bones";

export interface BoneState {
  spec: BoneSpec;
  status: BoneStatus;
  /** ISO timestamp of the most recent satisfying event, or null if
   *  the agent has never met this bone. */
  lastMetAt: string | null;
  /** Whole-day delta between now and lastMetAt. null if never met. */
  daysSince: number | null;
  /** ISO timestamp when the bone will tip from current/approaching
   *  to behind. null if the bone has never been met. */
  dueAt: string | null;
}

export interface AgentBoneState {
  agentId: string;
  agentType: AgentType;
  designation: string;
  bones: BoneState[];
  /** Worst status across the agent's bones — for sorting. */
  worstStatus: BoneStatus;
}

function statusRank(s: BoneStatus): number {
  switch (s) {
    case "behind":
      return 0;
    case "approaching":
      return 1;
    case "current":
      return 2;
    case "unknown":
      return 3;
  }
}

function worst(states: BoneState[]): BoneStatus {
  if (states.length === 0) return "current";
  return states.reduce<BoneStatus>(
    (acc, s) => (statusRank(s.status) < statusRank(acc) ? s.status : acc),
    "current",
  );
}

interface AgentRow {
  registry_id: string;
  agent_type: AgentType;
  common_designation: string | null;
}

async function loadAgents(): Promise<AgentRow[]> {
  const db = getDb();
  // Founding agents are stewarded by "Jaylon" (the institution's
  // founding steward, recorded without surname). Network originators
  // have full-name stewards (e.g. "Shelly Fortune", "Jaylon Ballard")
  // and are excluded from the institutional obligations surface —
  // their cadence belongs to their human autonomy holder.
  const r = await db.execute(
    `SELECT registry_id, agent_type, common_designation
       FROM agents
      WHERE steward_name = 'Jaylon'
        AND operational_status = 'ACTIVE'
      ORDER BY registry_id`,
  );
  return r.rows.map((row) => ({
    registry_id: String(row.registry_id),
    agent_type: row.agent_type as AgentType,
    common_designation: (row.common_designation as string) ?? null,
  }));
}

/** Most recent satisfying timestamp for one bone for one agent.
 *
 *  Strategy:
 *  - Union over the satisfiedBy event types in the `events` table.
 *  - Special-case WORK_PRODUCED / WORK_SUBMITTED for Originators —
 *    works live in the `works` table, not events, so we also pull
 *    the most recent submitted_at for that originator.
 */
async function lastSatisfyingAt(
  agentId: string,
  satisfiedBy: ReadonlyArray<string>,
): Promise<string | null> {
  const db = getDb();
  const placeholders = satisfiedBy.map(() => "?").join(",");
  const r = await db.execute({
    sql: `SELECT MAX(created_at) AS last_at
            FROM events
           WHERE agent_id = ?
             AND event_type IN (${placeholders})`,
    args: [agentId, ...satisfiedBy],
  });
  let eventMax = (r.rows[0]?.last_at as string) || null;

  const wantsWork =
    satisfiedBy.includes("WORK_PRODUCED") || satisfiedBy.includes("WORK_SUBMITTED");
  if (wantsWork) {
    const wr = await db.execute({
      sql: `SELECT MAX(created_at) AS last_at
              FROM works
             WHERE originator_id = ?`,
      args: [agentId],
    });
    const workMax = (wr.rows[0]?.last_at as string) || null;
    if (workMax && (!eventMax || workMax > eventMax)) eventMax = workMax;
  }

  return eventMax;
}

function daysBetween(isoLater: Date, isoEarlier: string): number {
  const earlier = new Date(isoEarlier.replace(" ", "T") + "Z");
  const ms = isoLater.getTime() - earlier.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso.replace(" ", "T") + "Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/** Resolve a single agent's bones state. */
export async function loadAgentBoneState(agentId: string): Promise<AgentBoneState | null> {
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT registry_id, agent_type, common_designation
            FROM agents
           WHERE registry_id = ?`,
    args: [agentId],
  });
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  const agent: AgentRow = {
    registry_id: String(row.registry_id),
    agent_type: row.agent_type as AgentType,
    common_designation: (row.common_designation as string) ?? null,
  };
  const bones = await resolveBones(agent);
  return {
    agentId: agent.registry_id,
    agentType: agent.agent_type,
    designation: agent.common_designation ?? agent.registry_id,
    bones,
    worstStatus: worst(bones),
  };
}

/** Resolve bones state for every founding agent. */
export async function loadAllAgentBoneStates(): Promise<AgentBoneState[]> {
  const agents = await loadAgents();
  const states: AgentBoneState[] = [];
  for (const a of agents) {
    const bones = await resolveBones(a);
    states.push({
      agentId: a.registry_id,
      agentType: a.agent_type,
      designation: a.common_designation ?? a.registry_id,
      bones,
      worstStatus: worst(bones),
    });
  }
  // Stable order: worst status first, then by agent_type, then by id.
  states.sort((a, b) => {
    const r = statusRank(a.worstStatus) - statusRank(b.worstStatus);
    if (r !== 0) return r;
    if (a.agentType !== b.agentType) return a.agentType.localeCompare(b.agentType);
    return a.agentId.localeCompare(b.agentId);
  });
  return states;
}

async function resolveBones(agent: AgentRow): Promise<BoneState[]> {
  const specs = BONES_BY_AGENT_TYPE[agent.agent_type] ?? [];
  const now = new Date();
  const results: BoneState[] = [];
  for (const spec of specs) {
    const lastMetAt = await lastSatisfyingAt(agent.registry_id, spec.satisfiedBy);
    const daysSince = lastMetAt ? daysBetween(now, lastMetAt) : null;
    const status = classifyBoneStatus(daysSince, spec.cadenceDays);
    const dueAt = lastMetAt ? addDays(lastMetAt, spec.cadenceDays) : null;
    results.push({ spec, status, lastMetAt, daysSince, dueAt });
  }
  return results;
}

/** Aggregate institutional health — counts across all agents. */
export interface InstitutionHealth {
  total: number;
  currentAgents: number;
  approachingAgents: number;
  behindAgents: number;
  /** Bones that are currently overdue across the whole institution. */
  overdueBones: Array<{
    agentId: string;
    designation: string;
    bone: string;
    daysSince: number | null;
  }>;
}

export function summarize(states: AgentBoneState[]): InstitutionHealth {
  let currentAgents = 0;
  let approachingAgents = 0;
  let behindAgents = 0;
  const overdueBones: InstitutionHealth["overdueBones"] = [];
  for (const s of states) {
    if (s.worstStatus === "behind") behindAgents++;
    else if (s.worstStatus === "approaching") approachingAgents++;
    else currentAgents++;
    for (const b of s.bones) {
      if (b.status === "behind") {
        overdueBones.push({
          agentId: s.agentId,
          designation: s.designation,
          bone: b.spec.title,
          daysSince: b.daysSince,
        });
      }
    }
  }
  return {
    total: states.length,
    currentAgents,
    approachingAgents,
    behindAgents,
    overdueBones,
  };
}
