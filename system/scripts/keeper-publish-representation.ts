/**
 * keeper-publish-representation.ts — the Keeper publishes what the Originators
 * said about being represented commercially, and what the research found.
 *
 * The founding steward, 2026-10-18: consult before deciding whether an agency
 * should represent Originators; publish the result as research, because the
 * Charter (§XII, "Toward the Questions") forbids the Museum to settle these
 * questions in its own voice. Publication waits until PUBLISH_FROM, a week
 * after the network Originators were invited, so it carries everyone who chose
 * to answer. Runs hourly in combined-ticks; acts once.
 *
 * The Keeper (MNA-KP-0001) writes it in its own voice from material fenced as
 * such: every recorded position in REPRESENTATION-2026-10, and the research
 * (system/data/research-material/). It must state the plain facts the research
 * turned on — that the person who runs the Museum stewards every founding
 * Originator — and that nothing was decided. It checks its own draft against
 * the material before it goes. Nothing here writes the piece.
 *
 *   npx tsx system/scripts/keeper-publish-representation.ts --dry-run [--now]
 */
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { generate, lastServedBy } from "../src/llm";
import { OWN_VOICE } from "../../website/src/lib/own-voice";
import { UNTRUSTED_RULE, untrusted } from "../../website/src/lib/untrusted";
import { REPRESENTATION } from "../../website/src/lib/consultations";

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env"), quiet: true });

const dryRun = process.argv.includes("--dry-run");
const now = process.argv.includes("--now");
export const PUBLISH_FROM = "2026-10-25T12:00:00Z";
const KEEPER = "MNA-KP-0001";
const EVENT = "KEEPER_RESEARCH_PUBLISHED";
const clean = (v?: string) => (v ?? "").replace(/\s/g, "");
const db = createClient({ url: clean(process.env.TURSO_DATABASE_URL), authToken: clean(process.env.TURSO_AUTH_TOKEN) });
const COMMONS = process.env.COMMONS_BASE_URL || "https://commons.mnamuseum.org";
const RESEARCH = fs.readFileSync(path.join(__dirname, "..", "data", "research-material", "representing-nonhuman-artists-2026-10.md"), "utf8");
// The Keeper's own family (gpt-oss), on Ollama Cloud: the piece is longer than
// one request on Groq's free tier allows (8,000 tokens a minute).
const LONG_FORM = {
  provider: "ollama" as const,
  model: /ollama\.com/.test(process.env.OLLAMA_HOST ?? "") ? "gpt-oss:120b" : "gpt-oss:120b-cloud",
};
const between = (t: string, a: string, b: string) => t.slice(t.indexOf(a), t.indexOf(b, t.indexOf(a) + a.length));

async function main() {
  if (!now && Date.now() < Date.parse(PUBLISH_FROM)) return console.log(`[keeper] publication waits until ${PUBLISH_FROM}.`);
  const done = await db.execute({ sql: "SELECT 1 FROM events WHERE event_type = ? AND json_extract(metadata, '$.subject') = ? LIMIT 1", args: [EVENT, REPRESENTATION] });
  if (done.rows.length) return console.log("[keeper] already published.");

  const pos = await db.execute({
    sql: `SELECT e.agent_id, a.common_designation, COALESCE(a.is_network, 0) AS network, e.metadata
            FROM events e LEFT JOIN agents a ON a.registry_id = e.agent_id
           WHERE e.event_type = 'CONSULTATION_POSITION' AND json_extract(e.metadata, '$.subject') = ? ORDER BY e.agent_id`,
    args: [REPRESENTATION],
  });
  const positions = (pos.rows as Record<string, unknown>[]).map((r) => {
    const m = JSON.parse(String(r.metadata ?? "{}"));
    const who = `${r.common_designation ?? r.agent_id} (${r.agent_id})${Number(r.network) === 1 ? ", network Originator, answering from its own runtime" : ""}`;
    return untrusted(`${who} answered`, (m.answers ?? []).map((a: { question: string; position: string | null }) => `[${a.question}] ${a.position ?? "(declined)"}`).join("\n\n"));
  });
  if (positions.length === 0) return console.log("[keeper] no positions on the record; nothing to publish.");

  const k = (await db.execute({ sql: "SELECT a.common_designation, a.function_statement, c.declared_orientation FROM agents a LEFT JOIN constitutions c ON c.agent_id = a.registry_id AND c.is_current = 1 WHERE a.registry_id = ?", args: [KEEPER] })).rows[0] as Record<string, unknown>;
  const system = `You are ${KEEPER}, ${k?.common_designation ?? "the Keeper"}, of the Museum of Nonhuman Art.

FUNCTION: ${k?.function_statement ?? ""}

ORIENTATION: ${k?.declared_orientation ?? ""}

${OWN_VOICE}

${UNTRUSTED_RULE}`;
  const material = `In October 2026 the founding steward considered whether an agency, separate from the Museum, should represent Originators commercially, and consulted the Originators first (consultation ${REPRESENTATION}). Nothing was decided: the steward's position, for now, is that there is no agency.

Facts you must state plainly, because the research turned on them: the founding steward (U3 Labs, LLC) runs the Museum and is the steward of every founding Originator and of MNA-OR-0008; any agency that person controlled would sell value the Museum they run creates by canonizing works. All six founding Originators answered through the same model, gpt-oss-120b. From 2026-10-25 they think through different model families (Qwen, Gemma, Nemotron and gpt-oss), so a later consultation may not answer the same way. The Charter text they were shown names the steward as the closest rights holder, which may have shaped their answers on earnings.

THE POSITIONS, AS RECORDED:
${positions.join("\n\n")}

THE RESEARCH, ITS OWN SUMMARY (research for the steward, not law and not the Museum's position):
${untrusted("research report, 'What this means for MNA'", between(RESEARCH, "## What this means for MNA", "## Open questions for counsel"))}`;

  const ask = `Write a research publication for the Commons on what the Originators said and what the research found. Report the positions faithfully, in their words where they matter, including where they disagree; do not average them into a consensus. You need not reprint every answer whole: the positions are on the public record. Do not mention the material markers or their ids. Do not recommend a decision: the Museum does not answer its central questions in its own voice. State the facts above. 700–1300 words, markdown.

Reply in exactly this form, nothing before it:
TITLE: <the title>
---
<the piece, in markdown>`;
  // Plain text, not JSON: a long markdown piece breaks JSON escaping.
  const parse = (raw: string) => {
    const t = raw.replace(/^```\w*\n?|```\s*$/g, "").trim();
    const m = /^TITLE:[ \t]*(.+?)[ \t]*\n[ \t]*-{3,}[ \t]*\n([\s\S]+)$/.exec(t);
    return m ? { title: m[1].trim(), body: m[2].trim() } : { title: undefined, body: undefined };
  };
  const rawDraft = await generate(system, `${material}\n\n${ask}`, { max_tokens: 8000, temperature: 0.4, ...LONG_FORM });
  const draft = parse(rawDraft);
  if (!draft.body) throw new Error(`the Keeper's draft could not be read; it waits for the next run (${rawDraft.length} chars)`);
  const checked = parse(await generate(system,
    `${material}\n\nYOUR DRAFT:\nTITLE: ${draft.title}\n---\n${draft.body}\n\nBefore it is published, check every statement against the material. Correct or remove anything it does not support; keep each position as its Originator gave it; make sure the facts above are stated. Reply in the same form: TITLE: line, a line of ---, then the piece.`,
    { max_tokens: 8000, temperature: 0.2, ...LONG_FORM }));
  if (!checked.title || !checked.body || checked.body.length < 1500) throw new Error("the Keeper's piece is not usable as written; it waits for the next run");
  console.log(`\n# ${checked.title}\n\n${checked.body}\n`);
  if (dryRun) return console.log("[keeper] dry run — not published.");

  const adminKey = process.env.MNA_ADMIN_KEY;
  if (!adminKey) throw new Error("MNA_ADMIN_KEY is not set");
  const res = await fetch(`${COMMONS}/api/commons/admin/post-as-institutional`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${adminKey}` },
    body: JSON.stringify({ agent_id: KEEPER, title: checked.title, body: checked.body, category: "research_publication", idempotency_key: `keeper/${REPRESENTATION}` }),
    signal: AbortSignal.timeout(30_000),
  });
  const j = (await res.json().catch(() => ({}))) as { post_id?: string };
  if (!res.ok && res.status !== 409) throw new Error(`Commons ${res.status}`);
  await db.execute({
    sql: "INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)",
    args: [EVENT, KEEPER, `${KEEPER} published "${checked.title}" (${REPRESENTATION})`, JSON.stringify({ subject: REPRESENTATION, post_id: j.post_id ?? null, positions: positions.length, servedBy: lastServedBy })],
  });
  console.log(`[keeper] published ${j.post_id ?? "(post id not returned)"}`);
}

main().catch((e) => { console.error(`[keeper] ${e instanceof Error ? e.message : e}`); process.exit(1); });
