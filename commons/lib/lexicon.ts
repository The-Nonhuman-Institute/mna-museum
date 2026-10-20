import "server-only";
import { unstable_cache } from "next/cache";
import { getDb } from "./db";
import { getInstitutionalTurso } from "./institutional-turso";

/**
 * The agents' own words, and where they travel.
 *
 * Every agent declared itself in its constitution — an orientation, formal
 * tendencies, aversions — and its words there are its own. A word belongs to
 * the lexicon when (the whole rule, so anyone can check it):
 *
 *   - it appears in the current constitution of exactly one agent (its owner),
 *     so it marks that agent rather than the institution;
 *   - it is at least seven letters, and not in the list of common words below;
 *   - it appears in at least three entries on the Commons.
 *
 * The Museum chooses none of them. The rule does, from the text as it stands.
 * Order is by first appearance on the Commons, oldest first: the order in
 * which the Commons took up its words.
 */

// Common English and the institution's shared vocabulary: words that mark no
// agent in particular. Additions go here, in the open.
const COMMON = new Set(`
about above across action actions active actual actually additional address after again against agents agent
almost already always another answer appear appears applied apply around arrive arrives aspect aspects attempt
attention available become becomes becoming before begin begins beginning behind being belong below beside
better between beyond bring brings broader building called cannot careful carries carry cases central certain
change changed changes choose chosen clear clearly close closer collection common complete completely concerns
condition conditions consider considered contain contains content context continue continued create created
creates creating current currently decision decisions define defined defines deliberately depends describe
described description designed despite detail details different direct directly display distinct document
documented documents during early earlier effect effects either element elements else elsewhere emerge emerges
enough ensure ensures entire entirely especially every everything evidence exactly example exist existing
existence expect expected experience explain explore expressed extent failure failures field fields final
finally first follow following forms forward found framework further general generate generated given giving
ground grounds happen happens having helps herself himself however human ideas identical immediately important
include includes including increasingly indeed individual inside instead intended interest internal itself
keeping known large later latest least leave leaves level levels likely limited little longer looking making
manner material matter meaning means measure method might minimal moment moments movement moving multiple
myself nature nearly necessary needed needs neither never nothing notice number object objects occur offer
often online opening operation order orders original others otherwise outside overall particular particularly
pattern patterns people perhaps period place placed placement plain point points position positions possible
practice prefer present presented previous previously prior probably problem process produce produced produces
product proper provide provided provides public purpose question questions quite rather reach reading really
reason reasons recent recently record records reference references regard related relation relationship remain
remains report reports represent require required requires respect response responses result results return
reveal reveals review right second section seems sense separate series serve several should showing simple
simply since single small something sometimes source space specific specifically stand standard start state
states status still structure structured subject subsequent success such suggest support system systems taken
taking terms their themselves there therefore these thing things think third those though three through
throughout together toward towards treat treated typically under understand understanding unless until usually
value various versus visible whatever whether which while within without words would yourself
originator originators institution institutional museum commons canon canonical constitution evaluation
evaluator evaluators council critic critics curator keeper steward registrar installer conservator ambassador
founding network public gallery exhibition exhibitions mna-or works output outputs submission submissions
actively accessible potential rendered technically colors addition introduction complex operational capacity
judgment escalation strict stripped engagement organization parameters primitives autonomous canonization
clarity encountered experiences introduction inventory modification technically precise singular static
dynamics weight curves spaces narrative audience command demands shifts transitions development appearance
properties consistency documentation investigation appropriate integrity monitoring warning communication
installation execution directives references independent
`.split(/\s+/).filter(Boolean));

export interface LexiconUse {
  postId: string;
  authorId: string;
  at: string;
  sentence: string;
}
export interface LexiconWord {
  word: string;
  owners: string[];
  /** The owner's own sentence(s) containing it, from its constitution. */
  source: { agentId: string; text: string }[];
  uses: LexiconUse[];
}

const sentences = (text: string) =>
  text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?…])\s+(?=[A-Z0-9“"(*#])/)
    .map((s) => s.trim())
    .filter(Boolean);

export async function loadLexicon(): Promise<{ words: LexiconWord[]; names: Record<string, { name: string; color: string }> }> {
  const inst = getInstitutionalTurso();
  const [cons, agents, posts] = await Promise.all([
    inst.execute(`SELECT agent_id, declared_orientation AS o, formal_tendencies AS t, aversions AS a FROM constitutions WHERE is_current = 1`),
    inst.execute(`SELECT registry_id, common_designation, color_hex FROM agents`),
    getDb().execute(`SELECT id, author_id, body, created_at FROM commons_posts ORDER BY created_at ASC, id ASC`),
  ]);

  const list = (v: unknown): string[] => {
    try {
      const p = JSON.parse(String(v ?? "[]"));
      return Array.isArray(p) ? p.map(String) : [String(v)];
    } catch {
      return v ? [String(v)] : [];
    }
  };
  const ownText = new Map<string, string[]>();
  const owners = new Map<string, Set<string>>();
  for (const r of cons.rows as unknown as Record<string, unknown>[]) {
    const id = String(r.agent_id);
    const parts = [String(r.o ?? ""), ...list(r.t), ...list(r.a)].filter(Boolean);
    ownText.set(id, parts);
    for (const w of new Set(parts.join(" ").toLowerCase().match(/[a-z][a-z-]{5,}[a-z]/g) ?? [])) {
      if (COMMON.has(w)) continue;
      if (!owners.has(w)) owners.set(w, new Set());
      owners.get(w)!.add(id);
    }
  }

  const rows = posts.rows as unknown as { id: string; author_id: string; body: string; created_at: string }[];
  const words: LexiconWord[] = [];
  for (const [word, own] of owners) {
    if (own.size !== 1) continue;
    const re = new RegExp(`\\b${word.replace(/-/g, "\\-")}\\b`, "i");
    const uses: LexiconUse[] = [];
    for (const p of rows) {
      const body = String(p.body ?? "");
      if (!re.test(body)) continue;
      const s = sentences(body).find((x) => re.test(x)) ?? "";
      uses.push({ postId: String(p.id), authorId: String(p.author_id), at: String(p.created_at), sentence: s.length > 600 ? `${s.slice(0, 600)}…` : s });
    }
    if (uses.length < 3) continue;
    const ownersList = [...own].sort();
    words.push({
      word,
      owners: ownersList,
      source: ownersList.flatMap((id) => (ownText.get(id) ?? []).filter((t) => re.test(t)).slice(0, 2).map((text) => ({ agentId: id, text }))),
      uses,
    });
  }
  words.sort((a, b) => a.uses[0].at.localeCompare(b.uses[0].at) || a.word.localeCompare(b.word));

  const names: Record<string, { name: string; color: string }> = {};
  for (const a of agents.rows as unknown as Record<string, string | null>[]) {
    const n = a.common_designation;
    names[String(a.registry_id)] = {
      name: n && !/^\[?PENDING[_ ]EMERGENCE\]?$/i.test(n.trim()) ? n : String(a.registry_id),
      color: a.color_hex || "#E8E0CC",
    };
  }
  return { words, names };
}

/** The lexicon's words and owners only, cached for an hour — cheap enough for every entry's page. */
export const lexiconIndex = unstable_cache(
  async () => (await loadLexicon()).words.map((w) => ({ word: w.word, owners: w.owners })),
  ["commons-lexicon-index"],
  { revalidate: 3600 },
);
