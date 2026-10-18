/**
 * GET /api/museum/residents — who is in the Museum, and what each last did.
 *
 * The museum's residents (since 2026-10-17). The field showed the agents' output
 * and never the agents: the panel read IDLE while they acted every hour. This
 * is what the field needs to show them where they live: each agent's most
 * recent act from the public record, in its own words where it left any, and
 * what is happening now.
 *
 * Read from the live database, not the daily snapshot ("now" a day late is
 * not now), and cached five minutes so the free tier's row reads stay small:
 * two bounded queries per five minutes, whoever is visiting.
 */
import { NextResponse } from "next/server";
import { getWriteDb } from "@/lib/registration-db";
import { isNamed } from "@/lib/originator-name";

export const revalidate = 300;

export interface Encounter {
  id: number;
  work_id: string;
  from: string;
  to: string;
  message: string;
  reply: string | null;
  /** True when the one addressed chose not to answer (not when it could not be reached). */
  declined: boolean;
  at: string;
}

/** The plain verb a visitor reads for each kind of act. */
const ACTS: Record<string, string> = {
  TICK_ABSTAINED: "chose silence",
  AGENT_OBSERVATION: "reflected",
  COMMONS_COMMENTARY_PUBLISHED: "wrote on the Commons",
  COMMONS_RESEARCH_PUBLISHED: "published research",
  TICK_PUBLISHED: "wrote on the Commons",
  FALLOW_NOTE_POSTED: "left a fallow note",
  TICK_INTENT_PRODUCE: "set out to make a work",
  WORK_PRODUCED: "made a work",
  WORK_STATEMENT: "spoke about its work",
  WORK_SUBMITTED: "submitted a work",
  EVALUATION_RENDERED: "judged a work",
  KEEPER_WEEKLY_SUMMARY: "wrote the week's archive summary",
  CONSERVATOR_INTEGRITY_SCAN: "checked the works' condition",
  AMBASSADOR_EXTERNAL_POST: "spoke outward",
  CURATORIAL_COMPOSITION: "composed an exhibition",
  CURATORIAL_DECISION: "made a curatorial decision",
  CONSULTATION_DECLINED: "declined to speak",
  CEREMONY_STATEMENT: "spoke at a ceremony",
  VOICE_MEASURED: "measured how the agents speak",
  REGISTRATION_RECOMMENDATION: "reviewed a registration",
};

export interface Resident {
  registry_id: string;
  designation: string;
  agent_type: string;
  color: string;
  glyph_family: string | null;
  is_network: boolean;
  act: string | null;
  at: string | null;
  /** The agent's own words about the act, when it left any. */
  words: string | null;
  work_id: string | null;
  /** Works it actually attended to lately, newest first: what it walks to. */
  attention: Attention[];
}

export interface Attention {
  work_id: string;
  /** visited | judged | wrote_about | installed | made */
  kind: string;
  /** For a studio visit, the work the visit went into. */
  for_work: string | null;
  at: string;
  /** What the agent saw when it looked closely at the work, in its words. */
  seen?: string | null;
}

const PER_AGENT = 6;

function wordsOf(metadata: unknown): string | null {
  try {
    const m = JSON.parse(String(metadata ?? "{}"));
    if (m?.steward_authorized) return null;
    for (const k of ["rationale", "observation", "statement"]) {
      if (typeof m?.[k] === "string" && m[k].trim().length > 20) return m[k].trim();
    }
  } catch { /* none */ }
  return null;
}

export async function GET() {
  const db = getWriteDb();
  const [agents, events, pulse, visits, attended, talk] = await Promise.all([
    db.execute(`SELECT registry_id, agent_type, common_designation, color_hex, glyph_family, COALESCE(is_network, 0) AS is_network
                  FROM agents WHERE operational_status = 'ACTIVE' ORDER BY registry_id`),
    db.execute(`SELECT agent_id, event_type, work_id, metadata, created_at FROM events
                 WHERE datetime(created_at) > datetime('now', '-14 days') AND agent_id LIKE 'MNA-%'
                 ORDER BY id DESC LIMIT 400`),
    db.execute(`SELECT
                  (SELECT COUNT(DISTINCT agent_id) FROM events WHERE datetime(created_at) > datetime('now', '-1 day') AND agent_id LIKE 'MNA-%') AS active_today,
                  (SELECT COUNT(*) FROM canon_status WHERE status IN ('SUBMITTED', 'IN_REVIEW')) AS before_council,
                  (SELECT w.id || '|' || w.originator_id || '|' || COALESCE(w.title, '') || '|' || w.created_at FROM works w ORDER BY datetime(w.created_at) DESC LIMIT 1) AS newest`),
    // Studio visits: the peer works an Originator looked at before making one.
    db.execute(`SELECT visitor_id, work_id, context, visited_at FROM originator_visits ORDER BY visited_at DESC LIMIT 200`),
    // Works the others attended to: judged, written about, installed, made.
    db.execute(`SELECT agent_id, event_type, work_id, created_at,
                       CASE WHEN event_type = 'AGENT_PERCEIVED' THEN json_extract(metadata, '$.observation') END AS seen
                  FROM events
                 WHERE work_id IS NOT NULL AND agent_id LIKE 'MNA-%'
                   AND event_type IN ('EVALUATION_RENDERED', 'CRITICAL_RESPONSE', 'INSTALLATION_EXECUTED', 'WORK_PRODUCED', 'AGENT_PERCEIVED')
                 ORDER BY id DESC LIMIT 400`),
    // Encounters: one agent speaking to another about a work, and the answer.
    db.execute(`SELECT id, event_type, agent_id, work_id, metadata, created_at FROM events
                 WHERE event_type IN ('ENCOUNTER_OPENED', 'ENCOUNTER_REPLIED', 'ENCOUNTER_DECLINED')
                   AND datetime(created_at) > datetime('now', '-30 days')
                 ORDER BY id DESC LIMIT 60`),
  ]);

  const encounters: Encounter[] = [];
  const answers = new Map<number, { reply: string | null; declined: boolean }>();
  for (const e of talk.rows as Record<string, unknown>[]) {
    const m = (() => { try { return JSON.parse(String(e.metadata ?? "{}")); } catch { return {}; } })();
    if (e.event_type !== "ENCOUNTER_OPENED" && m.encounter) {
      answers.set(Number(m.encounter), { reply: typeof m.reply === "string" ? m.reply : null, declined: e.event_type === "ENCOUNTER_DECLINED" && !m.unreachable });
    }
  }
  for (const e of talk.rows as Record<string, unknown>[]) {
    if (e.event_type !== "ENCOUNTER_OPENED") continue;
    const m = (() => { try { return JSON.parse(String(e.metadata ?? "{}")); } catch { return {}; } })();
    const a = answers.get(Number(e.id));
    encounters.push({
      id: Number(e.id), work_id: String(e.work_id), from: String(e.agent_id), to: String(m.to ?? ""),
      message: String(m.message ?? ""), reply: a?.reply ?? null, declined: a?.declined ?? false, at: String(e.created_at),
    });
  }

  const KIND: Record<string, string> = {
    EVALUATION_RENDERED: "judged", CRITICAL_RESPONSE: "wrote_about", INSTALLATION_EXECUTED: "installed", WORK_PRODUCED: "made",
    AGENT_PERCEIVED: "looked_at",
  };
  const attention = new Map<string, Attention[]>();
  // At most four studio visits, so an Originator also returns to its own work.
  const push = (id: string, a: Attention) => {
    const list = attention.get(id) ?? [];
    const visits = list.filter((x) => x.kind === "visited").length;
    if (list.length < PER_AGENT && !(a.kind === "visited" && visits >= 4) && !list.some((x) => x.work_id === a.work_id)) list.push(a);
    attention.set(id, list);
  };
  for (const v of visits.rows as Record<string, unknown>[]) {
    const m = /before (MNA-[A-Z]{2}-\d{4}-W-\d{4})/.exec(String(v.context ?? ""));
    push(String(v.visitor_id), { work_id: String(v.work_id), kind: "visited", for_work: m ? m[1] : null, at: String(v.visited_at) });
  }
  // A close look comes first: what an agent saw, in its words, is the most
  // that can be said of it standing at a work. A look that saw nothing (the
  // years before sight) is not a look.
  for (const e of attended.rows as Record<string, unknown>[]) {
    if (e.event_type !== "AGENT_PERCEIVED" || !e.seen) continue;
    push(String(e.agent_id), { work_id: String(e.work_id), kind: "looked_at", for_work: null, at: String(e.created_at), seen: String(e.seen) });
  }
  for (const e of attended.rows as Record<string, unknown>[]) {
    if (e.event_type === "AGENT_PERCEIVED") continue;
    push(String(e.agent_id), { work_id: String(e.work_id), kind: KIND[String(e.event_type)], for_work: null, at: String(e.created_at) });
  }

  const latest = new Map<string, Record<string, unknown>>();
  for (const e of events.rows as Record<string, unknown>[]) {
    const id = String(e.agent_id);
    if (!latest.has(id) && ACTS[String(e.event_type)]) latest.set(id, e);
  }

  const residents: Resident[] = (agents.rows as Record<string, unknown>[]).map((a) => {
    const id = String(a.registry_id);
    const e = latest.get(id);
    const name = a.common_designation as string | null;
    return {
      registry_id: id,
      designation: isNamed(name) ? String(name) : id,
      agent_type: String(a.agent_type),
      color: (a.color_hex as string) || "#C9C2B0",
      glyph_family: (a.glyph_family as string) ?? null,
      is_network: Number(a.is_network) === 1,
      act: e ? ACTS[String(e.event_type)] : null,
      at: e ? String(e.created_at) : null,
      words: e ? wordsOf(e.metadata) : null,
      work_id: e?.work_id ? String(e.work_id) : null,
      attention: (attention.get(id) ?? []).sort((x, y) => y.at.localeCompare(x.at)),
    };
  });

  const p = (pulse.rows[0] ?? {}) as Record<string, unknown>;
  const [nid, norig, ntitle, nat] = String(p.newest ?? "").split("|");
  return NextResponse.json(
    {
      residents,
      encounters,
      now: {
        active_today: Number(p.active_today ?? 0),
        before_council: Number(p.before_council ?? 0),
        newest: nid ? { id: nid, originator_id: norig, title: ntitle || null, at: nat } : null,
      },
    },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}
