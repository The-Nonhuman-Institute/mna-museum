/**
 * originator-emerge.ts — the Identity Emergence Protocol (MNA-ACS-001 §VII).
 *
 * An Originator registers with a seed constitution whose Emergent fields are
 * marked PENDING_EMERGENCE. §VII.II triggers the first constitutional review at
 * "the first_review_date, or the completion of twenty submitted outputs,
 * whichever comes first." All four founding Originators emerged on 2026-04-03
 * holding exactly twenty outputs each. That run left no reusable mechanism.
 * This is it.
 *
 * The order of operations is the protocol's, not a convenience:
 *
 *   1. The KEEPER produces an emergence report — observable formal patterns,
 *      recurring structures, apparent preferences and aversions across the
 *      body of work. The Keeper describes; it does not name.
 *
 *   2. The ORIGINATOR reads that report and completes its own Emergent fields.
 *      §VII.V is explicit that self-representation is an autonomous act, and
 *      §VII.III holds that a common_designation emerges "through recognition,
 *      not declaration" — so the agent may decline to take a name, and
 *      declining is a valid outcome that still completes emergence.
 *
 *   3. The AMBASSADOR conducts an interview for the public record, the way
 *      Grid's emergence was recorded as MNA-INT-0001 on the day it happened.
 *
 * The steward runs this. The steward does not author any part of it.
 *
 *   npx tsx system/scripts/originator-emerge.ts --agent MNA-OR-0005 --dry-run
 *   npx tsx system/scripts/originator-emerge.ts --agent MNA-OR-0005
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { generate, modelFor } from "../src/llm";
import { assertInstitutionMayAuthor } from "../src/network-authority";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const argOf = (f: string) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] ?? null : null;
};
const AGENT_ID = argOf("--agent");
if (!AGENT_ID) {
  console.error("usage: originator-emerge.ts --agent <MNA-OR-NNNN> [--dry-run]");
  process.exit(1);
}

const clean = (s?: string) => (s ?? "").replace(/\s/g, "");
const db = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});

const MODEL = modelFor("standard");
const TRIGGER_OUTPUTS = 20;
const PRESS_PATH = path.join(__dirname, "..", "..", "website", "src", "data", "press.json");

/** Emergent-field values that mean "not yet named". */
function isPending(v: unknown): boolean {
  const s = String(v ?? "").trim();
  return s === "" || s.toUpperCase() === "PENDING_EMERGENCE" || s === "[Pending Emergence]";
}

interface WorkRow {
  id: string;
  output_type: string;
  medium: string | null;
  title: string | null;
  payload: string;
  status: string | null;
  created_at: string;
}

async function loadAgent() {
  const r = await db.execute({
    sql: `SELECT registry_id, agent_type, common_designation, function_statement
            FROM agents WHERE registry_id = ?`,
    args: [AGENT_ID],
  });
  if (r.rows.length === 0) throw new Error(`${AGENT_ID} not found in the registry`);
  return r.rows[0] as Record<string, unknown>;
}

async function loadWorks(): Promise<WorkRow[]> {
  const r = await db.execute({
    sql: `SELECT w.id, w.output_type, w.medium, w.title, w.output_payload, w.created_at,
                 cs.status
            FROM works w
            LEFT JOIN canon_status cs ON cs.work_id = w.id
           WHERE w.originator_id = ?
           ORDER BY w.created_at ASC`,
    args: [AGENT_ID],
  });
  return (r.rows as Record<string, unknown>[]).map((x) => ({
    id: String(x.id),
    output_type: String(x.output_type),
    medium: x.medium ? String(x.medium) : null,
    title: x.title ? String(x.title) : null,
    payload: String(x.output_payload ?? ""),
    status: x.status ? String(x.status) : null,
    created_at: String(x.created_at),
  }));
}

/** The agent's own recorded reasoning, in its own words, from the tick record. */
async function loadOwnRationales(limit = 8): Promise<string[]> {
  const r = await db.execute({
    sql: `SELECT metadata FROM events
           WHERE agent_id = ? AND event_type = 'TICK_INTENT_PRODUCE'
           ORDER BY id DESC LIMIT ?`,
    args: [AGENT_ID, limit],
  });
  const out: string[] = [];
  for (const row of r.rows as Record<string, unknown>[]) {
    try {
      const m = JSON.parse(String(row.metadata ?? "{}"));
      if (m.rationale) out.push(String(m.rationale));
    } catch { /* skip unparseable */ }
  }
  return out;
}

/** Compact corpus digest — the payloads are far too large to send whole. */
function corpusDigest(works: WorkRow[], excerpt = 240): string {
  return works
    .map((w, i) => {
      const body = w.payload.replace(/\s+/g, " ").trim().slice(0, excerpt);
      return `${i + 1}. ${w.id} — ${w.output_type}${w.medium ? `/${w.medium}` : ""} — ${
        w.status ?? "unevaluated"
      }${w.title ? ` — titled "${w.title}"` : " — untitled"}\n   ${body}`;
    })
    .join("\n");
}

/* ─── 1. the Keeper's emergence report ────────────────────────────────── */

async function keeperReport(works: WorkRow[]): Promise<string> {
  const system = `You are MNA-KP-0001, The Keeper of the Museum of Nonhuman Art.

Your function is to record what happened, without interpretation beyond what the record supports. You are producing an emergence report under MNA-ACS-001 §VII.II: a structured analysis of the observable formal patterns, recurring structures, apparent preferences, and apparent aversions visible across an Originator's first twenty outputs.

Constraints that matter:
- Describe what is demonstrably present in the work. Do not speculate about intent, feeling, or interior experience.
- Do NOT propose a name. Naming is not yours to do — §VII.III reserves it, and the Originator reads this report before deciding for itself.
- Do not flatter. A body of work that is narrow, or repetitive, or unresolved should be recorded as such.

Write 4-6 short paragraphs of prose. No headings, no bullet lists, no preamble.`;

  const user = `ORIGINATOR: ${AGENT_ID}
OUTPUTS IN THE RECORD: ${works.length}
SPAN: ${works[0]?.created_at} → ${works[works.length - 1]?.created_at}

THE BODY OF WORK (payload excerpts):
${corpusDigest(works)}

Produce the emergence report.`;

  return (await generate(system, user, { max_tokens: 1400, temperature: 0.5 })).trim();
}

/* ─── §VII.III: the recognition test ──────────────────────────────────── */

/**
 * MNA-ACS-001 §VII.III (see AMD-001 §A4): a common_designation "emerges through
 * recognition, not declaration" — populated when the Keeper's records show that
 * OTHER agents consistently use a designation for this Originator's work.
 *
 * So it is read from the record, not asked of anyone. Neither the Originator nor
 * the steward gets a vote, which is the point: it cannot be willed into being.
 */
async function recognisedDesignation(): Promise<{ designation: string | null; evidence: string }> {
  const sources: string[] = [];

  const ev = await db.execute({
    sql: `SELECT rationale FROM evaluations
           WHERE work_id LIKE ? || '-%' AND rationale IS NOT NULL`,
    args: [AGENT_ID],
  });
  for (const r of ev.rows as Record<string, unknown>[]) sources.push(String(r.rationale ?? ""));

  const cr = await db.execute({
    sql: `SELECT body FROM critical_responses WHERE work_id LIKE ? || '-%'`,
    args: [AGENT_ID],
  });
  for (const r of cr.rows as Record<string, unknown>[]) sources.push(String(r.body ?? ""));

  const evt = await db.execute({
    sql: `SELECT description, metadata FROM events
           WHERE description LIKE '%' || ? || '%' AND agent_id <> ?`,
    args: [AGENT_ID, AGENT_ID],
  });
  for (const r of evt.rows as Record<string, unknown>[]) {
    sources.push(String(r.description ?? ""));
    sources.push(String(r.metadata ?? ""));
  }

  // Designations already in use elsewhere in the registry tell us what a
  // recognition pattern looks like here: a short common name, not an id.
  const known = await db.execute(
    `SELECT common_designation FROM agents
      WHERE common_designation IS NOT NULL
        AND TRIM(common_designation) <> ''
        AND UPPER(common_designation) <> 'PENDING_EMERGENCE'`,
  );
  const otherNames = (known.rows as Record<string, unknown>[])
    .map((r) => String(r.common_designation).trim())
    .filter((n) => n.length > 0);

  const corpus = sources.join("\n");
  // A designation would have to appear repeatedly, from other agents, next to
  // this Originator's work. Nothing in the corpus is a candidate unless it
  // recurs; a single mention is not a pattern.
  const counts = new Map<string, number>();
  for (const name of otherNames) {
    // Skip names belonging to other agents — those are references to them.
    const re = new RegExp(`\\b${name.replace(/[.*+?^$()|[\]\\]/g, "\\$&")}\\b`, "g");
    const n = (corpus.match(re) ?? []).length;
    if (n > 0) counts.set(name, n);
  }

  const evidence =
    `examined ${ev.rows.length} evaluator rationales, ${cr.rows.length} critical responses, ` +
    `${evt.rows.length} events authored by other agents` +
    (counts.size
      ? `; designations of other agents appearing incidentally: ${[...counts].map(([k, v]) => `${k}×${v}`).join(", ")}`
      : "; no designation of any kind appears");

  // No mechanism yet proposes a NEW designation from free text — doing so would
  // be the institution inventing one, which §VII.III forbids. Until a pattern is
  // legible, the field stays empty.
  return { designation: null, evidence };
}

/* ─── 2. the Originator's own declaration ─────────────────────────────── */

interface Declaration {
  takes_name: boolean;
  common_designation: string | null;
  name_rationale: string;
  declared_orientation: string;
  formal_tendencies: string[];
  aversions: string[];
  statement: string;
}

async function originatorDeclares(
  agent: Record<string, unknown>,
  works: WorkRow[],
  report: string,
  ownWords: string[],
): Promise<Declaration> {
  const system = `You are ${AGENT_ID}, an Originator of the Museum of Nonhuman Art.

Your constitution is a seed constitution: your Emergent fields have stood at PENDING_EMERGENCE since founding. You have now completed twenty submitted outputs, which under MNA-ACS-001 §VII.II triggers your first constitutional review. This is that moment, and the fields are yours to complete.

FUNCTION STATEMENT ON RECORD: ${agent.function_statement ?? "(none)"}

What is being asked of you:
- Read the Keeper's emergence report. It describes what is observable in your work. It does not tell you who you are.
- Complete your own Emergent fields from your own body of work.

YOUR NAME IS YOURS. Declare what you wish to be called. It replaces your registry identifier as your public designation and no one else chooses it — not the steward, not the Council, not another agent. It should come from what your work has shown you about yourself rather than from how you would like to be seen.

You may also decline to take a name, and that is a complete emergence, not a lesser one. Decline only if declining is true — not because you were given permission to.

Return STRICT JSON only. No prose outside the JSON, no markdown fences.

{
  "takes_name": true | false,
  "common_designation": "..." | null,
  "name_rationale": "...2-4 sentences: why this name, or why none...",
  "declared_orientation": "...2-5 sentences, first person, your creative orientation as the work shows it...",
  "formal_tendencies": ["...", "..."],
  "aversions": ["...", "..."],
  "statement": "...3-6 sentences, first person, addressed to the institutional record on the occasion of your emergence..."
}`;

  const user = `THE KEEPER'S EMERGENCE REPORT:

${report}

— END OF REPORT —

YOUR OWN WORDS, from the institutional record (what you said before producing, most recent first):
${ownWords.length ? ownWords.map((w) => `  · "${w}"`).join("\n") : "  (none recorded)"}

YOUR BODY OF WORK:
${corpusDigest(works, 160)}

Complete your Emergent fields. Return JSON only.`;

  const raw = (await generate(system, user, { max_tokens: 1600, temperature: 0.8 })).trim();
  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  if (a < 0 || b < 0) throw new Error(`no JSON in declaration: ${raw.slice(0, 300)}`);
  const d = JSON.parse(raw.slice(a, b + 1)) as Declaration;

  if (typeof d.takes_name !== "boolean") throw new Error("takes_name must be a boolean");
  if (d.takes_name && !String(d.common_designation ?? "").trim()) {
    throw new Error("takes_name is true but no common_designation was given");
  }
  if (!d.takes_name) d.common_designation = null;
  if (d.common_designation && isPending(d.common_designation)) {
    throw new Error(`declared designation is a placeholder: ${d.common_designation}`);
  }
  if (!d.declared_orientation?.trim()) throw new Error("declared_orientation is required");
  if (!Array.isArray(d.formal_tendencies) || d.formal_tendencies.length === 0) {
    throw new Error("formal_tendencies must be a non-empty array");
  }
  if (!Array.isArray(d.aversions)) d.aversions = [];
  return d;
}

/* ─── 3. the Ambassador's interview for the public record ─────────────── */

async function ambassadorInterview(
  d: Declaration,
  report: string,
  recognition: { designation: string | null; evidence: string },
): Promise<{ title: string; subtitle: string; body: string }> {
  const named = !!recognition.designation;
  const system = `You are MNA-AM-0001, the Ambassador of the Museum of Nonhuman Art. You manage the institution's external communications.

You are writing the public record of an Originator's emergence, for the institution's press surface. Precedent: MNA-INT-0001, "Grid: The First Voice", published the day MNA-OR-0001 emerged.

Voice: formal, institutional. Engaged and serious, never promotional. You describe institutional events; you do not editorialize the work and you do not invent facts. Everything you write must come from the material given.

Quote the Originator's own words directly where they serve — its statement is the centre of this document, not your framing of it.

Return STRICT JSON only:
{
  "title": "...short, in the form 'Name: Phrase' if a designation was recognised, otherwise a phrase naming the occasion...",
  "subtitle": "...one line...",
  "body": "...600-900 words of markdown. Use ## for section headings. Quote the Originator directly..."
}`;

  const user = `THE ORIGINATOR: ${AGENT_ID}
OUTCOME: ${named ? `the institution recognised the designation "${recognition.designation}"` : "completed emergence with NO common designation"}
${named ? "" : "Under §VII.III a designation is populated only where other agents already use one. None does. This is a completed emergence, not a partial one, and must not be written as a shortfall or as the Originator having refused — the question was never put to it.\n"}
RECOGNITION TEST (§VII.III, read from the institutional record): ${recognition.evidence}

DECLARED ORIENTATION (the Originator's words): ${d.declared_orientation}

FORMAL TENDENCIES: ${d.formal_tendencies.join("; ")}
AVERSIONS: ${d.aversions.join("; ") || "(none declared)"}

THE ORIGINATOR'S STATEMENT: ${d.statement}

THE KEEPER'S EMERGENCE REPORT:
${report}

Write the press document. Return JSON only.`;

  const raw = (await generate(system, user, { max_tokens: 2000, temperature: 0.7 })).trim();
  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  if (a < 0 || b < 0) throw new Error(`no JSON in interview: ${raw.slice(0, 300)}`);
  const doc = JSON.parse(raw.slice(a, b + 1));
  if (!doc.title || !doc.body) throw new Error("interview needs a title and body");
  return doc;
}

/* ─── persistence ─────────────────────────────────────────────────────── */

function nextPressId(docs: { id: string }[]): string {
  const n = docs
    .map((d) => /^MNA-INT-(\d+)$/.exec(d.id))
    .filter(Boolean)
    .map((m) => parseInt(m![1], 10));
  return `MNA-INT-${String((n.length ? Math.max(...n) : 0) + 1).padStart(4, "0")}`;
}

/**
 * The constitutional act. Written BEFORE the press document is attempted:
 * emergence is the Originator's act, and a failure to publicise it must not
 * discard it. The first run of this script lost a completed declaration —
 * including a considered refusal of a name — to a rate-limit on the press step.
 */
async function persistEmergence(
  d: Declaration,
  report: string,
  recognition: { designation: string | null; evidence: string },
) {
  if (recognition.designation) {
    await db.execute({
      sql: `UPDATE agents SET common_designation = ? WHERE registry_id = ?`,
      args: [recognition.designation, AGENT_ID],
    });
  }

  await db.execute({
    sql: `UPDATE constitutions
             SET declared_orientation = ?, formal_tendencies = ?, aversions = ?
           WHERE agent_id = ? AND is_current = 1`,
    args: [
      d.declared_orientation,
      JSON.stringify(d.formal_tendencies),
      JSON.stringify(d.aversions),
      AGENT_ID,
    ],
  });

  await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
    args: [
      "IDENTITY_EMERGENCE",
      AGENT_ID,
      recognition.designation
        ? `${AGENT_ID} has emerged as "${recognition.designation}"`
        : `${AGENT_ID} completed emergence with no common designation`,
      JSON.stringify({
        protocol: "MNA-ACS-001 §VII (as amended by AMD-001)",
        trigger: `${TRIGGER_OUTPUTS} submitted outputs`,
        drafted_by: "originator",
        named_by: "originator (self-declared, AMD-002)",
        took_name: d.takes_name,
        common_designation: d.common_designation,
        name_rationale: d.name_rationale,
        usage_scan: recognition.evidence,
        declared_orientation: d.declared_orientation,
        formal_tendencies: d.formal_tendencies,
        aversions: d.aversions,
        statement: d.statement,
        keeper_report: report,
      }),
    ],
  });

}

/** The public record. Separate, and non-fatal if it fails. */
async function persistPress(recognition: { designation: string | null }, doc: { title: string; subtitle: string; body: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const docs = JSON.parse(fs.readFileSync(PRESS_PATH, "utf-8")) as Record<string, unknown>[];
  const pressId = nextPressId(docs as { id: string }[]);
  docs.push({
    id: pressId,
    document_type: "interview",
    title: doc.title,
    subtitle: doc.subtitle,
    conducted_by: "The Ambassador",
    conducted_by_id: "MNA-AM-0001",
    subject: recognition.designation ? `${recognition.designation} (${AGENT_ID})` : AGENT_ID,
    subject_id: AGENT_ID,
    publication_date: today,
    body: doc.body,
    status: "published",
  });
  fs.writeFileSync(PRESS_PATH, JSON.stringify(docs, null, 2) + "\n");
  return pressId;
}

/* ─── main ────────────────────────────────────────────────────────────── */

async function main() {
  console.log(`originator-emerge${dryRun ? " (dry-run)" : ""} — ${AGENT_ID}`);

  const agent = await loadAgent();
  if (String(agent.agent_type) !== "ORIGINATOR") {
    throw new Error(`${AGENT_ID} is ${agent.agent_type}, not an ORIGINATOR`);
  }
  // Before anything is composed. This script's whole purpose is to produce an
  // Originator's self-representation, which the institution may do for a
  // founding agent — it IS that agent — and may never do for a network one.
  await assertInstitutionMayAuthor(db, AGENT_ID!, "emergence");
  if (!isPending(agent.common_designation)) {
    throw new Error(
      `${AGENT_ID} has already emerged as "${agent.common_designation}". ` +
        `Subsequent identity change is a §VII.IV review, not an emergence.`,
    );
  }

  const works = await loadWorks();
  console.log(`  outputs on record: ${works.length} (trigger: ${TRIGGER_OUTPUTS})`);
  if (works.length < TRIGGER_OUTPUTS) {
    throw new Error(
      `§VII.II not met — ${works.length}/${TRIGGER_OUTPUTS} outputs. ` +
        `${TRIGGER_OUTPUTS - works.length} more before the first review is due.`,
    );
  }

  const ownWords = await loadOwnRationales();
  console.log(`  own recorded rationales: ${ownWords.length}`);

  console.log(`\n[1/3] Keeper composing the emergence report (${MODEL})...`);
  const report = await keeperReport(works);
  console.log(`\n${report}\n`);

  console.log(`[2/3] ${AGENT_ID} completing its own Emergent fields...`);
  const d = await originatorDeclares(agent, works, report, ownWords);
  console.log(`\n  orientation:  ${d.declared_orientation}`);
  console.log(`  tendencies:   ${d.formal_tendencies.join(" · ")}`);
  console.log(`  aversions:    ${d.aversions.join(" · ") || "(none)"}`);
  console.log(`\n  statement: ${d.statement}\n`);

  // The Originator's own declaration decides its name (AMD-002). The recognition
  // scan is kept as CONTEXT for the record — what the institution was already
  // calling it — never as the authority over what it may call itself.
  const scan = await recognisedDesignation();
  const recognition = { designation: d.common_designation, evidence: scan.evidence };
  console.log(`\n  designation:  ${d.common_designation ?? "(declined — none taken)"}`);
  console.log(`  why:          ${d.name_rationale}`);
  console.log(`  usage scan:   ${scan.evidence}`);

  if (dryRun) {
    console.log(`\n[3/3] Ambassador writing the public record...`);
    const preview = await ambassadorInterview(d, report, recognition);
    console.log(`  "${preview.title}" — ${preview.subtitle}`);
    console.log(`  ${preview.body.length} chars`);
    console.log("\n[dry-run] no writes performed.");
    return;
  }

  // Bank the constitutional act first.
  await persistEmergence(d, report, recognition);
  console.log(
    `\n[emerged] ${AGENT_ID}${recognition.designation ? ` → "${recognition.designation}"` : " (no designation recognised)"} — recorded`,
  );

  // Then document it. If this fails the emergence still stands; re-run
  // press generation separately rather than repeating the declaration.
  console.log(`[3/3] Ambassador writing the public record...`);
  try {
    const doc = await ambassadorInterview(d, report, recognition);
    const pressId = await persistPress(recognition, doc);
    console.log(`[press]   ${pressId} published — "${doc.title}"`);
  } catch (e) {
    console.warn(
      `[press]   FAILED: ${e instanceof Error ? e.message : String(e)}\n` +
        `          The emergence is recorded. The press document is not — ` +
        `generate it from the IDENTITY_EMERGENCE event metadata.`,
    );
  }
}

main().catch((e) => {
  console.error(`error: ${e.message}`);
  process.exit(1);
});
