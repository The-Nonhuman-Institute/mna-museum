/**
 * voice-measures.ts — are the agents speaking as themselves?
 *
 * On 2026-10-17 the founding steward asked whether the agents' voices are
 * truly theirs. Measured over everything they had written in the record, they
 * were not: 393 passages shared a run of eight or more words with a passage by
 * a different agent, and 78% of the Originators' private reflections were
 * about the institution's operations. The prompts were changed that day (no
 * dictated register, Originators off the operations dashboard, no agent shown
 * another's words). These are the two numbers that say whether it worked,
 * counted the same way every time so one report can be read against the last.
 *
 * Counting only — no model, nothing to persuade. No package imports, so the
 * website's tests can reach this file.
 */

export interface Passage {
  agent_id: string;
  text: string;
}

export const SHINGLE_WORDS = 8;

/** Words that mark talk about the Museum's operations rather than the work. */
export const OPERATIONS_WORDS =
  /\b(institution|institutional|pipeline|overdue|backlog|cadence|bones?|validations?|obligations?|dashboard|operational)\b/i;

function shingles(text: string): Set<string> {
  const w = text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  const out = new Set<string>();
  for (let i = 0; i + SHINGLE_WORDS <= w.length; i++) out.add(w.slice(i, i + SHINGLE_WORDS).join(" "));
  return out;
}

export interface VoiceMeasures {
  passages: number;
  agents: number;
  /** Share of passages that repeat an eight-word run another agent also wrote. */
  echo_rate: number;
  /** Share of Originator passages that talk about the Museum's operations. */
  originator_operations_share: number;
  originator_passages: number;
  /** Per agent: passages, and how many echo another agent. */
  by_agent: Record<string, { passages: number; echoes: number }>;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function measureVoices(passages: Passage[]): VoiceMeasures {
  const ps = passages.filter((p) => p.text && p.text.trim().length > 0);
  // Which agents wrote each shingle.
  const owners = new Map<string, Set<string>>();
  const sh = ps.map((p) => shingles(p.text));
  ps.forEach((p, i) => {
    sh[i].forEach((s) => {
      const set = owners.get(s) ?? new Set<string>();
      set.add(p.agent_id);
      owners.set(s, set);
    });
  });

  const by_agent: VoiceMeasures["by_agent"] = {};
  let echoing = 0;
  ps.forEach((p, i) => {
    let echoes = false;
    sh[i].forEach((s) => {
      if ((owners.get(s)?.size ?? 0) > 1) echoes = true;
    });
    const a = (by_agent[p.agent_id] ??= { passages: 0, echoes: 0 });
    a.passages += 1;
    if (echoes) {
      a.echoes += 1;
      echoing += 1;
    }
  });

  const orig = ps.filter((p) => p.agent_id.startsWith("MNA-OR-"));
  const ops = orig.filter((p) => OPERATIONS_WORDS.test(p.text)).length;
  return {
    passages: ps.length,
    agents: Object.keys(by_agent).length,
    echo_rate: ps.length ? round(echoing / ps.length) : 0,
    originator_operations_share: orig.length ? round(ops / orig.length) : 0,
    originator_passages: orig.length,
    by_agent,
  };
}

/** The agent-written passages carried on an event's metadata. */
export function passagesFromEvent(agent_id: string, metadata: unknown): Passage[] {
  let m = metadata;
  if (typeof m === "string") {
    try {
      m = JSON.parse(m);
    } catch {
      return [];
    }
  }
  if (!m || typeof m !== "object") return [];
  const out: Passage[] = [];
  for (const k of ["rationale", "observation", "statement"]) {
    const t = (m as Record<string, unknown>)[k];
    if (typeof t === "string" && t.trim().length > 30) out.push({ agent_id, text: t });
  }
  return out;
}
