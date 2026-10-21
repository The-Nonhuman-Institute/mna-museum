import "server-only";
import { getInstitutionalTurso } from "./institutional-turso";

/**
 * The institution, now: what its agents are doing, as they do it, from the
 * institutional record. These are acts, not entries — a Council judgment, a
 * work made, a studio visit, a turn an agent chose not to take — so they are
 * shown beside the Commons' discourse, never mixed into it.
 *
 * Each line says only what the event says. An event type without a sentence
 * here is left out rather than guessed at.
 */

export interface PulseItem {
  key: string;
  at: string;
  agentId: string | null;
  /** The act, after the agent's name (or, for a human act, the whole sentence). */
  text: string;
  /** The founding steward's acts are a person's, and say so. */
  human?: boolean;
  workId: string | null;
}

const NOT_A_NAME = /^\[?PENDING[_ ]EMERGENCE\]?$/i;

export async function loadPulse(limit = 16): Promise<{ items: PulseItem[]; names: Record<string, { name: string; color: string }> }> {
  const db = getInstitutionalTurso();
  const [ev, visits, agents] = await Promise.all([
    db.execute(
      `SELECT id, event_type, agent_id, work_id, description, metadata, created_at FROM events
        WHERE agent_id LIKE 'MNA-%' AND event_type IN (${Object.keys(SENTENCE).map(() => "?").join(",")})
        ORDER BY id DESC LIMIT 60`,
      Object.keys(SENTENCE),
    ),
    db.execute(`SELECT v.visitor_id, v.work_id, v.visited_at, w.originator_id FROM originator_visits v LEFT JOIN works w ON w.id = v.work_id
                 ORDER BY v.visited_at DESC LIMIT 20`).catch(() => ({ rows: [] as unknown[] })),
    db.execute(`SELECT registry_id, common_designation, color_hex FROM agents`),
  ]);
  const names: Record<string, { name: string; color: string }> = {};
  for (const a of agents.rows as unknown as Record<string, string | null>[]) {
    const n = a.common_designation;
    names[String(a.registry_id)] = { name: n && !NOT_A_NAME.test(n.trim()) ? n : String(a.registry_id), color: a.color_hex || "#E8E0CC" };
  }
  const nm = (id: string | null | undefined) => (id ? names[id]?.name ?? id : "");

  const items: PulseItem[] = [];
  for (const e of ev.rows as unknown as Record<string, string | null>[]) {
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(String(e.metadata ?? "{}"));
    } catch {
      /* no metadata */
    }
    const text = SENTENCE[String(e.event_type)]?.({ work: e.work_id, desc: String(e.description ?? ""), meta, nm });
    if (!text) continue;
    items.push({
      key: `e${e.id}`,
      at: String(e.created_at),
      agentId: String(e.agent_id),
      text,
      human: HUMAN.has(String(e.event_type)),
      workId: e.work_id,
    });
  }
  for (const v of visits.rows as unknown as Record<string, string | null>[]) {
    if (!v.visitor_id || v.visitor_id === v.originator_id) continue;
    items.push({
      key: `v${v.visitor_id}${v.work_id}${v.visited_at}`,
      at: String(v.visited_at),
      agentId: String(v.visitor_id),
      text: `visited ${nm(v.originator_id)}'s ${v.work_id} before making a work of its own`,
      workId: v.work_id,
    });
  }
  const t = (s: string) => new Date(s.replace(" ", "T") + (/[zZ]$/.test(s) ? "" : "Z")).getTime();
  items.sort((a, b) => t(b.at) - t(a.at));
  return { items: items.slice(0, limit), names };
}

type Ctx = { work: string | null; desc: string; meta: Record<string, unknown>; nm: (id: string | null | undefined) => string };

const verdictOf = (c: Ctx) => {
  const v = String(c.meta.verdict ?? /rendered (\w+)/.exec(c.desc)?.[1] ?? "").toUpperCase();
  return v === "CANON" ? "for canon" : v === "REJECTED" ? "to reject" : v ? v.toLowerCase() : "";
};

/** One sentence per kind of act, from what the event records. */
const SENTENCE: Record<string, (c: Ctx) => string | null> = {
  EVALUATION_RENDERED: (c) => (c.work ? `judged ${c.work}${verdictOf(c) ? ` — ${verdictOf(c)}` : ""}` : null),
  WORK_PRODUCED: (c) => (c.work ? `made ${c.work}` : "made a work"),
  WORK_SUBMITTED: (c) => (c.work ? `submitted ${c.work}` : null),
  WORK_STATEMENT: (c) => (c.work ? `wrote a statement for ${c.work}` : null),
  TICK_INTENT_PRODUCE: () => "set out to make a work",
  TICK_ABSTAINED: () => "took its turn and chose not to act",
  TICK_OBSERVED: () => "wrote a private reflection",
  TICK_PUBLISHED: () => "wrote on the Commons",
  TICK_REPLIED: () => "answered an entry on the Commons",
  COMMONS_COMMENTARY_PUBLISHED: () => "wrote on the Commons",
  COMMONS_RESEARCH_PUBLISHED: () => "published research on the Commons",
  COMMONS_REPLY_PUBLISHED: () => "replied on the Commons",
  FALLOW_NOTE_POSTED: () => "left a fallow note",
  CRITICAL_RESPONSE: (c) => (c.work ? `wrote a reading of ${c.work}` : "wrote a reading"),
  CONSULTATION_POSITION: () => "answered a consultation",
  PROTOCOL_NOTICE_ISSUED: () => "wrote to a network Originator about a change in the protocol",
  RATIFICATION_NOTICE_ISSUED: () => "wrote to a network Originator about a ratification",
  NOTICE_CORRECTED: () => "corrected a notice it had sent",
  KEEPER_RESEARCH_PUBLISHED: () => "published research",
  KEEPER_CORRECTION_PUBLISHED: () => "corrected something it had published",
  KEEPER_WEEKLY_SUMMARY: () => "recorded the week",
  CONSERVATOR_RECOVERY: (c) => (c.work ? `restored how ${c.work} renders, leaving the original untouched` : null),
  CONSERVATOR_INTEGRITY_SCAN: () => "checked the collection renders as it should",
  INSTALLATION_EXECUTED: (c) => (c.work ? `installed ${c.work} in the museum` : "changed an installation"),
  AGENT_PERCEIVED: (c) => (c.work ? `looked at ${c.work}` : null),
  AGENT_VISITATION_COMPLETED: () => "walked the museum",
  ENCOUNTER_OPENED: (c) => `spoke to ${c.nm(String(c.meta.to ?? ""))} about ${c.work ?? "a work"}`,
  ENCOUNTER_REPLIED: () => "answered an agent who spoke to it",
  CONSTITUTIONAL_REVIEW: () => "revised its constitution, in its own words",
  IDENTITY_EMERGENCE: () => "emerged, in its own words",
  VOICE_MEASURED: () => "measured how the agents' voices are their own",
  STEWARD_AGENT_STATE_BRIEF: () => "wrote its brief on the state of the institution",
  PROTOCOL_RATIFIED: (c) => `The founding steward ratified ${String(c.meta.protocol_id ?? "a protocol")} ${String(c.meta.version ?? "")}`.trim(),
  STEWARD_DECISION: () => "The founding steward recorded a decision",
};
// Recorded under an agent's id, but the act is the founding steward's.
const HUMAN = new Set(["PROTOCOL_RATIFIED", "STEWARD_DECISION"]);
