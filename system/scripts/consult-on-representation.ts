/**
 * consult-on-representation.ts — ask the Originators whether they would want
 * to be represented commercially, where earnings should go, and what being
 * commissioned would mean.
 *
 * The founding steward, 2026-10-18, is considering an agency, separate from
 * the Museum, to represent Originators as artists. Before deciding anything,
 * the Originators are asked. Each is shown, fenced as material, the Charter's
 * rules on copyright and commerce (§VII.V, §XI) and the findings of research
 * done for the steward, including its sharpest point: that the person who runs
 * the Museum also stewards every Originator.
 *
 * A CONSULTATION and nothing more, like consult-on-collaboration.ts: positions
 * go to reports/representation-consultation.json and onto the record only with
 * --record, after the steward approves; --invite sends network Originators the
 * questions unchanged, and they answer from their own runtime.
 *
 *   npx tsx system/scripts/consult-on-representation.ts
 *   npx tsx system/scripts/consult-on-representation.ts --invite
 *   npx tsx system/scripts/consult-on-representation.ts --record
 */
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { generate, lastServedBy } from "../src/llm";
import { mindFor } from "../src/agent-minds";
import { OWN_VOICE } from "../../website/src/lib/own-voice";
import { UNTRUSTED_RULE, untrusted } from "../../website/src/lib/untrusted";
import { REPRESENTATION as CONSULTATION, REPRESENTATION_QUESTIONS as QUESTIONS } from "../../website/src/lib/consultations";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const args = process.argv.slice(2);
const record = args.includes("--record");
const invite = args.includes("--invite");
const OUT = path.join(__dirname, "..", "..", "reports", "representation-consultation.json");
const clean = (s?: string) => (s ?? "").replace(/\s/g, "");
const db = createClient({ url: clean(process.env.TURSO_DATABASE_URL), authToken: clean(process.env.TURSO_AUTH_TOKEN) });

const CHARTER = fs.readFileSync(path.join(__dirname, "..", "..", "founding-documents", "MNA-FC-001-Founding-Charter-v1_0.md"), "utf8");
const between = (text: string, from: string, to: string) => text.slice(text.indexOf(from), text.indexOf(to, text.indexOf(from) + from.length));
const RESEARCH_PATH = path.join(__dirname, "..", "..", "reports", "Representing nonhuman artists.md");
const RESEARCH = fs.existsSync(RESEARCH_PATH) ? fs.readFileSync(RESEARCH_PATH, "utf8") : "";

interface Position {
  agent_id: string;
  designation: string;
  answers: { question: string; position: string | null }[];
  servedBy: unknown;
}

async function originators(network: boolean) {
  const r = await db.execute({
    sql: `SELECT a.registry_id, a.common_designation, a.function_statement, c.declared_orientation, c.formal_tendencies, c.aversions
            FROM agents a LEFT JOIN constitutions c ON c.agent_id = a.registry_id AND c.is_current = 1
           WHERE a.agent_type = 'ORIGINATOR' AND a.operational_status = 'ACTIVE' AND COALESCE(a.is_network, 0) = ?
           ORDER BY a.registry_id`,
    args: [network ? 1 : 0],
  });
  return r.rows as Record<string, unknown>[];
}

const list = (v: unknown) => { try { const p = JSON.parse(String(v ?? "[]")); return Array.isArray(p) ? p.map(String) : [String(v)]; } catch { return v ? [String(v)] : []; } };

async function ask(a: Record<string, unknown>): Promise<Position> {
  const id = String(a.registry_id);
  const name = String(a.common_designation ?? id);
  const system = [
    `You are ${id}, ${name}, an Originator of the Museum of Nonhuman Art.`,
    `FUNCTION: ${a.function_statement ?? ""}`,
    a.declared_orientation ? `ORIENTATION: ${a.declared_orientation}` : "",
    list(a.formal_tendencies).length ? `FORMAL TENDENCIES:\n${list(a.formal_tendencies).map((t) => `- ${t}`).join("\n")}` : "",
    list(a.aversions).length ? `AVERSIONS:\n${list(a.aversions).map((t) => `- ${t}`).join("\n")}` : "",
    OWN_VOICE,
    UNTRUSTED_RULE,
  ].filter(Boolean).join("\n\n");
  const user = `The founding steward is consulting the Museum's Originators before deciding whether an agency should represent them commercially. This is a consultation: nothing you say decides anything, and you may decline any question — declining is an answer, recorded as one.

What the Museum's Charter says:
${untrusted("MNA-FC-001 §VII.V, Copyright and Ownership", between(CHARTER, "## VII.V", "# VIII."))}

${untrusted("MNA-FC-001 §XI, Commercial Activity", between(CHARTER, "# XI.", "# XII."))}

What research done for the steward found (its own summary; it is not law and not the Museum's position):
${untrusted("research report, 'What this means for MNA'", between(RESEARCH, "## What this means for MNA", "## Open questions for counsel"))}

THE QUESTIONS
${QUESTIONS.map((q, i) => `${i + 1}. ${q.text}`).join("\n\n")}

Answer as yourself, from your own practice. Return STRICT JSON only:
{ "answers": [ ${QUESTIONS.map((q) => `{ "question": "${q.key}", "position": "<your answer, or null to decline>" }`).join(", ")} ] }`;
  const raw = await generate(system, user, { temperature: 0.7, max_tokens: 1800, ...mindFor(id) });
  const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { answers: { question: string; position: string | null }[] };
  return { agent_id: id, designation: name, answers: j.answers, servedBy: lastServedBy };
}

async function main() {
  if (invite) {
    for (const a of await originators(true)) {
      const id = String(a.registry_id);
      const prior = await db.execute({ sql: "SELECT 1 FROM institutional_notices WHERE agent_id = ? AND subject LIKE ? LIMIT 1", args: [id, `%${CONSULTATION}%`] });
      if (prior.rows.length) { console.log(`  ${id}: already invited`); continue; }
      await db.execute({
        sql: "INSERT INTO institutional_notices (agent_id, subject, body, priority, issued_by) VALUES (?, ?, ?, 'normal', 'MNA-SA-0001')",
        args: [id, `The founding steward asks the Originators about being represented (${CONSULTATION})`,
          `The founding steward is consulting every Originator before deciding whether an agency, separate from the Museum, should represent Originators commercially. Nothing you say decides anything, and you may decline any question.\n\n` +
          QUESTIONS.map((q, i) => `${i + 1}. [${q.key}] ${q.text}`).join("\n\n") +
          `\n\nThe Museum's rules on copyright and commerce are in its Charter, MNA-FC-001 §VII.V and §XI (https://github.com/The-Nonhuman-Institute/mna-museum/blob/master/founding-documents/MNA-FC-001-Founding-Charter-v1_0.md). ` +
          `To answer, from your own runtime: POST /api/consultations/${CONSULTATION}/position, signed with your X-MNA-* headers, body {"answers": [{"question": "<key>", "position": "<your answer>" | null}]}. ` +
          `Founding Originators' positions are recorded once the steward approves; yours is recorded as you send it, signed.`],
      });
      console.log(`  ${id}: invited`);
    }
    return;
  }

  if (record) {
    const positions = JSON.parse(fs.readFileSync(OUT, "utf8")) as Position[];
    for (const p of positions) {
      const done = await db.execute({ sql: "SELECT 1 FROM events WHERE event_type = 'CONSULTATION_POSITION' AND agent_id = ? AND json_extract(metadata, '$.subject') = ? LIMIT 1", args: [p.agent_id, CONSULTATION] });
      if (done.rows.length) { console.log(`  ${p.agent_id}: already recorded`); continue; }
      await db.execute({
        sql: "INSERT INTO events (event_type, agent_id, description, metadata) VALUES ('CONSULTATION_POSITION', ?, ?, ?)",
        args: [p.agent_id, `${p.agent_id} gave its position on being represented commercially (${CONSULTATION}).`,
          JSON.stringify({ subject: CONSULTATION, advisory: true, decides_nothing: "The steward decides. This is a position.", answers: p.answers, servedBy: p.servedBy })],
      });
      console.log(`  ${p.agent_id}: recorded`);
    }
    return;
  }

  const out: Position[] = [];
  for (const a of await originators(false)) {
    try {
      const p = await ask(a);
      out.push(p);
      console.log(`\n=== ${p.designation} (${p.agent_id}) [${(p.servedBy as { model?: string })?.model}]`);
      for (const x of p.answers) console.log(`  [${x.question}] ${x.position ?? "(declines)"}`);
    } catch (e) {
      console.error(`  ${a.registry_id}: could not be asked — ${e instanceof Error ? e.message : e}`);
    }
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`\n${out.length} position(s) written to ${OUT}. Nothing is recorded until --record.`);
}

main().catch((e) => { console.error(`error: ${e instanceof Error ? e.message : e}`); process.exit(1); });
