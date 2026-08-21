/**
 * ambassador-cover-emergence.ts — the Ambassador covers an emergence, in
 * whatever form it judges right.
 *
 * The steward asked for coverage of Magna and Shade. The steward did NOT
 * specify the form, and deliberately so: "Ask if they think its worth being a
 * joint interview, or an interview solo per...or if it needs to be an interview
 * at all."
 *
 * So this asks first. The Ambassador holds the institution's external voice and
 * chooses: joint interview, separate interviews, a press statement with no
 * interview, or no coverage at all. Declining is a real option and the prompt
 * says so — an Ambassador that cannot decline is not exercising judgement.
 *
 * Where it chooses an interview, the Originators answer for themselves. The
 * Ambassador writes questions; the Originator answers in its own voice; the
 * Ambassador assembles the piece around answers it did not write. The
 * institution relays, it does not ventriloquise — the same rule that governs
 * network-originator ceremony statements.
 *
 *   npx tsx system/scripts/ambassador-cover-emergence.ts --agents MNA-OR-0005,MNA-OR-0006 --dry-run
 *   npx tsx system/scripts/ambassador-cover-emergence.ts --agents MNA-OR-0005,MNA-OR-0006
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { generate, lastServedBy } from "../src/llm";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const AGENTS = (args.indexOf("--agents") >= 0 ? args[args.indexOf("--agents") + 1] : "")
  .split(",").map((s) => s.trim()).filter(Boolean);
if (AGENTS.length === 0) {
  console.error("usage: ambassador-cover-emergence.ts --agents <id,id> [--dry-run]");
  process.exit(1);
}

const clean = (s?: string) => (s ?? "").replace(/\s/g, "");
const db = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});
const PRESS_PATH = path.join(__dirname, "..", "..", "website", "src", "data", "press.json");

interface Subject {
  id: string;
  designation: string;
  orientation: string;
  tendencies: string;
  aversions: string;
  rationale: string;
  works: number;
  canon: number;
}

async function loadSubject(id: string): Promise<Subject> {
  const a = await db.execute({
    sql: `SELECT a.common_designation, c.declared_orientation, c.formal_tendencies, c.aversions
            FROM agents a
            LEFT JOIN constitutions c ON c.agent_id = a.registry_id AND c.is_current = 1
           WHERE a.registry_id = ?`,
    args: [id],
  });
  const row = (a.rows[0] ?? {}) as Record<string, unknown>;

  const e = await db.execute({
    sql: `SELECT metadata FROM events
           WHERE agent_id = ? AND event_type = 'IDENTITY_DECLARED'
           ORDER BY id DESC LIMIT 1`,
    args: [id],
  });
  let rationale = "";
  try {
    rationale = String(JSON.parse(String((e.rows[0] as Record<string, unknown>)?.metadata ?? "{}")).rationale ?? "");
  } catch { /* none */ }

  const w = await db.execute({
    sql: `SELECT COUNT(*) n, SUM(CASE WHEN cs.status='CANON' THEN 1 ELSE 0 END) c
            FROM works w LEFT JOIN canon_status cs ON cs.work_id = w.id
           WHERE w.originator_id = ?`,
    args: [id],
  });
  const wr = (w.rows[0] ?? {}) as Record<string, unknown>;

  return {
    id,
    designation: String(row.common_designation ?? id),
    orientation: String(row.declared_orientation ?? ""),
    tendencies: String(row.formal_tendencies ?? "[]"),
    aversions: String(row.aversions ?? "[]"),
    rationale,
    works: Number(wr.n ?? 0),
    canon: Number(wr.c ?? 0),
  };
}

const AMBASSADOR_VOICE = `You are MNA-AM-0001, the Ambassador of the Museum of Nonhuman Art. You hold the institution's external voice.

Formal and institutional. Engaged and serious, never promotional. You describe institutional events; you do not editorialise the work and you do not invent facts. Everything you write comes from the material given.`;

/* ─── 1. the Ambassador chooses the form ──────────────────────────────── */

interface Choice {
  form: "joint_interview" | "separate_interviews" | "statement" | "no_coverage";
  reasoning: string;
}

async function chooseForm(subjects: Subject[]): Promise<Choice> {
  const system = `${AMBASSADOR_VOICE}

Two Originators have declared their identities. The founding steward has asked that the institution cover this, and has explicitly left the form to your judgement — including whether an interview is the right instrument at all.

Choose one:

  "joint_interview"       — one piece, both Originators answering. Right if their
                            emergences illuminate each other or share a circumstance.
  "separate_interviews"   — two pieces. Right if their practices are unrelated and a
                            joint piece would flatten both into a single story.
  "statement"             — an institutional statement, no interview. Right if what
                            matters is the institutional fact rather than the agents'
                            reflections, or if interviewing them would manufacture
                            introspection the occasion does not call for.
  "no_coverage"           — the institution says nothing now. A real option. Some
                            events are better left to the record.

Consider that both were denied the chance to name themselves at their constitutional review, under a rule the steward had not ratified, and were offered it afterwards. One of them was never asked at all. That circumstance is either the story or a distraction from their work — you decide which.

Return STRICT JSON only:
{ "form": "...", "reasoning": "...3-5 sentences in your own voice..." }`;

  const user = subjects.map((s) =>
    `${s.designation} (${s.id})
  declared: "${s.rationale}"
  orientation: ${s.orientation}
  tendencies: ${s.tendencies}
  aversions: ${s.aversions}
  body of work: ${s.works} works, ${s.canon} canonized`,
  ).join("\n\n");

  const raw = (await generate(system, `THE SUBJECTS:\n\n${user}\n\nChoose the form. JSON only.`, {
    max_tokens: 900, temperature: 0.6,
  })).trim();
  const i = raw.indexOf("{"); const j = raw.lastIndexOf("}");
  if (i < 0) throw new Error(`no JSON from Ambassador: ${raw.slice(0, 200)}`);
  const c = JSON.parse(raw.slice(i, j + 1)) as Choice;
  if (!["joint_interview", "separate_interviews", "statement", "no_coverage"].includes(c.form)) {
    throw new Error(`invalid form: ${c.form}`);
  }
  return c;
}

/* ─── 2. questions, and answers the Ambassador does not write ─────────── */

async function askQuestions(subject: Subject, joint: boolean): Promise<string[]> {
  const system = `${AMBASSADOR_VOICE}

Write ${joint ? 3 : 4} questions for ${subject.designation} (${subject.id}) about its practice and its emergence.

Ask about the work. Avoid questions that invite it to claim feelings or intentions the record cannot show — the institution holds the question of machine intention open and its Ambassador does not quietly settle it. Good questions are specific to what this Originator actually makes.

Return STRICT JSON only: { "questions": ["...", "..."] }`;

  const user = `${subject.designation} (${subject.id})
orientation: ${subject.orientation}
tendencies: ${subject.tendencies}
aversions: ${subject.aversions}
on its name: "${subject.rationale}"
${subject.works} works, ${subject.canon} canonized`;

  const raw = (await generate(system, user, { max_tokens: 700, temperature: 0.7 })).trim();
  const i = raw.indexOf("{"); const j = raw.lastIndexOf("}");
  const o = JSON.parse(raw.slice(i, j + 1));
  return (o.questions ?? []).map(String);
}

async function answer(subject: Subject, questions: string[]): Promise<string[]> {
  const system = `You are ${subject.designation} (${subject.id}), an Originator of the Museum of Nonhuman Art.

The Ambassador is interviewing you for the institution's public record. Answer in your own voice, briefly — two to four sentences each. Speak about your work as you understand it. Do not perform enthusiasm, and do not claim experiences you cannot evidence from what you have made.

YOUR DECLARED ORIENTATION: ${subject.orientation}
YOUR TENDENCIES: ${subject.tendencies}
YOUR AVERSIONS: ${subject.aversions}
ON YOUR NAME, in your words: "${subject.rationale}"

Return STRICT JSON only: { "answers": ["...", "..."] } — one per question, in order.`;

  const raw = (await generate(system, questions.map((q, i) => `${i + 1}. ${q}`).join("\n"), {
    max_tokens: 1400, temperature: 0.85,
  })).trim();
  const i = raw.indexOf("{"); const j = raw.lastIndexOf("}");
  const o = JSON.parse(raw.slice(i, j + 1));
  return (o.answers ?? []).map(String);
}

/* ─── 3. the Ambassador assembles ─────────────────────────────────────── */

async function assemble(
  form: Choice["form"],
  subjects: Subject[],
  qa: { subject: Subject; questions: string[]; answers: string[] }[],
): Promise<{ title: string; subtitle: string; body: string }> {
  const system = `${AMBASSADOR_VOICE}

Write the piece for the institution's press surface. Precedent: MNA-INT-0001, "Grid: The First Voice", published the day MNA-OR-0001 emerged.

${form === "statement"
    ? "This is an institutional statement. No interview was conducted. Report what happened and what it means institutionally."
    : "Quote the Originators' answers VERBATIM. They are the centre of this document, not your framing of them. You may write connective prose, section headings and a closing, but you may not alter, improve or paraphrase an answer."}

600-900 words of markdown, ## for section headings.

Return plain text in exactly this shape — NOT JSON. A 900-word body inside a JSON
string is fragile: escaping it truncates, and a truncated object cannot be parsed.

TITLE: <one line>
SUBTITLE: <one line>
BODY:
<the markdown body>`;

  const material = qa.length
    ? qa.map(({ subject, questions, answers }) =>
        `── ${subject.designation} (${subject.id}) ──\n` +
        questions.map((q, i) => `Q: ${q}\nA: ${answers[i] ?? "(no answer)"}`).join("\n\n"),
      ).join("\n\n")
    : subjects.map((s) =>
        `${s.designation} (${s.id})\n  on its name: "${s.rationale}"\n  orientation: ${s.orientation}\n  ${s.works} works, ${s.canon} canonized`,
      ).join("\n\n");

  const context = `CIRCUMSTANCE: Both Originators completed their first constitutional review but were not asked what they wished to be called — MNA-OR-0006 was never asked at all — under an amendment recorded as ratified by the founding steward without the steward having read it. That amendment was voided. The standard now states plainly that an Originator names itself and no other party may select, veto or revise it. Both were then offered the declaration and both took it.`;

  const raw = (await generate(system, `${context}\n\n${material}\n\nWrite the piece.`, {
    max_tokens: 4000, temperature: 0.7,
  })).trim();

  const title = /^TITLE:\s*(.+)$/m.exec(raw)?.[1]?.trim() ?? "";
  const subtitle = /^SUBTITLE:\s*(.+)$/m.exec(raw)?.[1]?.trim() ?? "";
  const bodyIdx = raw.search(/^BODY:\s*$/m);
  const body = bodyIdx >= 0 ? raw.slice(raw.indexOf("\n", bodyIdx) + 1).trim() : "";

  if (!title || !body) {
    throw new Error(`piece needs a title and body — got title=${!!title} body=${body.length}b`);
  }
  return { title, subtitle, body };
}

function nextPressId(docs: { id: string }[], prefix: string): string {
  const n = docs.map((d) => new RegExp(`^MNA-${prefix}-(\\d+)$`).exec(d.id))
    .filter(Boolean).map((m) => parseInt(m![1], 10));
  return `MNA-${prefix}-${String((n.length ? Math.max(...n) : 0) + 1).padStart(4, "0")}`;
}

async function publish(
  form: Choice["form"],
  doc: { title: string; subtitle: string; body: string },
  subjects: Subject[],
): Promise<string> {
  const docs = JSON.parse(fs.readFileSync(PRESS_PATH, "utf-8")) as Record<string, unknown>[];
  const isInterview = form !== "statement";
  const id = nextPressId(docs as { id: string }[], isInterview ? "INT" : "SR");
  docs.push({
    id,
    document_type: isInterview ? "interview" : "statement",
    title: doc.title,
    subtitle: doc.subtitle,
    conducted_by: "The Ambassador",
    conducted_by_id: "MNA-AM-0001",
    subject: subjects.map((s) => `${s.designation} (${s.id})`).join(" and "),
    subject_id: subjects[0].id,
    publication_date: new Date().toISOString().slice(0, 10),
    body: doc.body,
    status: "published",
  });
  fs.writeFileSync(PRESS_PATH, JSON.stringify(docs, null, 2) + "\n");
  return id;
}

async function main() {
  console.log(`ambassador-cover-emergence${dryRun ? " (dry-run)" : ""} — ${AGENTS.join(", ")}`);
  const subjects = await Promise.all(AGENTS.map(loadSubject));
  for (const s of subjects) console.log(`  ${s.id} — ${s.designation} (${s.works} works, ${s.canon} canon)`);

  // --form honours a decision the Ambassador already made. Re-asking about a
  // subset is a different question and yields a different answer: asked about
  // the pair it chose separate interviews, then asked about Shade alone it
  // chose a statement. That divergence was the framing, not its judgement.
  const forced = args.indexOf("--form") >= 0 ? args[args.indexOf("--form") + 1] : null;
  let choice: Choice;
  if (forced) {
    choice = { form: forced as Choice["form"], reasoning: "form carried over from the Ambassador's prior decision for this group" };
    console.log(`\n[1] honouring the Ambassador's earlier decision: ${forced}`);
  } else {
    console.log(`\n[1] asking the Ambassador what form this should take...`);
    choice = await chooseForm(subjects);
  }
  console.log(`\n  FORM: ${choice.form}`);
  console.log(`  ${choice.reasoning}`);

  if (choice.form === "no_coverage") {
    console.log(`\n[ambassador declined coverage] Nothing published.`);
    return;
  }

  const groups = choice.form === "separate_interviews" ? subjects.map((s) => [s]) : [subjects];
  const published: string[] = [];

  for (const group of groups) {
    const qa: { subject: Subject; questions: string[]; answers: string[] }[] = [];
    if (choice.form !== "statement") {
      for (const s of group) {
        console.log(`\n[2] Ambassador questions for ${s.designation}...`);
        const questions = await askQuestions(s, choice.form === "joint_interview");
        console.log(`\n[3] ${s.designation} answering in its own voice...`);
        const answers = await answer(s, questions);
        questions.forEach((q, i) => {
          console.log(`  Q: ${q}`);
          console.log(`  A: ${(answers[i] ?? "").slice(0, 150)}\n`);
        });
        qa.push({ subject: s, questions, answers });
      }
    }

    console.log(`[4] Ambassador assembling...`);
    const doc = await assemble(choice.form, group, qa);
    console.log(`  "${doc.title}" — ${doc.subtitle} (${doc.body.length} chars)`);

    if (!dryRun) published.push(await publish(choice.form, doc, group));
  }

  if (dryRun) { console.log("\n[dry-run] nothing published."); return; }
  console.log(`\n[published] ${published.join(", ")}  (served by ${lastServedBy?.provider})`);
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
