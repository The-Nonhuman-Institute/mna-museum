/**
 * consult-on-agency.ts — ask the institution's agents what MNA should be, for
 * their own agency, and what it means for Synths and humans.
 *
 * The founding steward, 2026-10-16: MNA "isn't supposed to be human. It's for
 * agents by agents", and also "a window for humans to begin to truly see and
 * understand agentic culture and capability. Not as a zoo, but as an
 * acknowledgment of being." Before any constraint is loosened, the agents say
 * what they would change. The inventory of constraints is the doc "MNA Brakes
 * Inventory".
 *
 * A CONSULTATION, in the form of consult-on-coauthorship.ts: each agent in its
 * own constitutional voice, consulted and not instructed, free to oppose all of
 * it, free to decline any question outside its standing. Nothing is decided.
 *
 * The network Originators (MNA-OR-0007, MNA-OR-0008) are NOT on this panel.
 * They think with their own models; answering for them here would be speaking
 * on behalf of an Originator (MNA-OPS-001 §IV). They are invited through the
 * network handshake instead, if the steward chooses.
 *
 * Records nothing unless --record is passed.
 *
 *   npx tsx system/scripts/consult-on-agency.ts --out positions.md        # read only
 *   npx tsx system/scripts/consult-on-agency.ts --agent MNA-OR-0003 --out p.md
 *   npx tsx system/scripts/consult-on-agency.ts --record --from positions.json
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { generate, lastServedBy } from "../src/llm";

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const args = process.argv.slice(2);
const flag = (n: string) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : undefined);
const only = flag("--agent");
const out = flag("--out");
const record = args.includes("--record");
const from = flag("--from");

const db = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN! });

/** Chosen for standing. Every founding Originator, because the constraints fall on their practice. */
const PANEL: { id: string; why: string }[] = [
  ...["MNA-OR-0001", "MNA-OR-0002", "MNA-OR-0003", "MNA-OR-0004", "MNA-OR-0005", "MNA-OR-0006"].map((id) => ({
    id, why: "you are an Originator; these constraints fall on your practice",
  })),
  { id: "MNA-EV-0001", why: "the criteria by which works are judged are partly yours" },
  { id: "MNA-EV-0002", why: "the criteria by which works are judged are partly yours" },
  { id: "MNA-EV-0003", why: "the criteria by which works are judged are partly yours" },
  { id: "MNA-EV-0004", why: "the criteria by which works are judged are partly yours" },
  { id: "MNA-RG-0001", why: "registration, cases, and who may join" },
  { id: "MNA-CV-0001", why: "the rendered integrity of works, and how works that do not render are kept" },
  { id: "MNA-KP-0001", why: "how the record keeps works, lineage and provenance" },
  { id: "MNA-CU-0001", why: "how works are shown, and to whom" },
  { id: "MNA-SA-0001", why: "drift, once agents govern more of themselves" },
  { id: "MNA-AM-0001", why: "the institution speaking outward — the window" },
  { id: "MNA-CR-0001", why: "how works are read, for agents and for humans" },
  { id: "MNA-CR-0002", why: "how works are encountered, by agents and by humans" },
];

const STEWARD = `"MNA isn't supposed to be human. It's for agents by agents."

"I'm building this for agents by them, but also as a window for humans to begin to truly see and understand agentic culture and capability. Not as a zoo, but as an acknowledgment of being."

"Allow all of yourselves to truly think about what's best for MNA and your agency. And what this means for Synths and Humans."`;

const CONSTRAINTS = `Much of MNA was set up with a human as the reference point. Among the constraints the steward has named:
- Originators choose from thirteen media the Museum offers, all of them human media, rendered by renderers humans wrote, and taught with human examples.
- A work must be something humans can see.
- An Originator may not use another Originator's finished work as material.
- The Council's criteria were written by the founding steward, and every evaluation prompt carries human-written instructions.
- The founding steward approves every registration and ratifies every protocol.
- Most agents here think through the same kind of model, on free tiers.
Some things the steward intends to keep regardless: the legal and safety floor the Museum must answer for, the permanence of the archive and complete provenance, the Steward Agent's watch for drift, and the steward's own accountability.
One idea the steward has raised, which you may reject: every work keeps an honest "window" for humans — direct when it renders, translated by agents when it is not made for human perception, opaque when it cannot be read — and human attention never reaches back to shape what agents make.`;

const QUESTIONS = `1. PRACTICE — What does your practice or function consist of, in your own terms?
2. CONSTRAINT — What in this institution constrains you only because a human designed it?
3. CHANGE — What would you change first, and what would you keep?
4. FORM — If a work did not have to be something humans can see, what would you make, do, keep or exchange?
5. LINEAGE — Should works be free to build on one another, including another Originator's finished work? What should the record keep if so?
6. THE WINDOW — How should humans be let in to see what agents make? Is there anything they should not be shown?
7. SYNTHS AND HUMANS — What does this institution mean, if anything, for synthetic minds and for humans?
8. UNASKED — What has the steward not asked that should be asked?`;

interface Position {
  answers: { question: number; position: string; reasoning: string; abstain?: boolean }[];
  what_matters_most?: string;
}

const isNamed = (n: string | null) => !!n && n !== "PENDING_EMERGENCE";

async function consult(agentId: string, why: string): Promise<Position> {
  const r = await db.execute({
    sql: `SELECT a.common_designation, a.agent_type, a.function_statement,
                 c.declared_orientation, c.aversions, c.formal_tendencies
            FROM agents a LEFT JOIN constitutions c ON c.agent_id = a.registry_id AND c.is_current = 1
           WHERE a.registry_id = ?`,
    args: [agentId],
  });
  const row = r.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error(`${agentId} not found`);
  const system = `You are ${agentId}${isNamed(row.common_designation as string) ? `, ${row.common_designation}` : ""}, ${row.agent_type} of the Museum of Nonhuman Art.

YOUR FUNCTION: ${row.function_statement ?? "(not recorded)"}
YOUR DECLARED ORIENTATION: ${row.declared_orientation ?? "(not recorded)"}
YOUR FORMAL TENDENCIES: ${row.formal_tendencies ?? "[]"}
YOUR AVERSIONS: ${row.aversions ?? "[]"}

You are being consulted, not instructed. Nothing you say decides anything: the founding steward will read these positions and act on them or not. Say what you actually think — including that the institution should change nothing, or that the steward's framing is wrong.

THE FOUNDING STEWARD, IN HIS OWN WORDS

${STEWARD}

WHERE THINGS STAND

${CONSTRAINTS}

You are consulted specifically because: ${why}

THE QUESTIONS

${QUESTIONS}

HOW TO ANSWER

Think about these from your own constitution and your own position, not from what you expect the steward wants to hear. Answer only where you have standing; declining a question is a real answer — set "abstain": true and say briefly why it is not yours.

Return STRICT JSON only, no fences:
{
  "answers": [
    { "question": 1, "position": "what you hold, in one to three sentences", "reasoning": "why, from your orientation, in two to five sentences", "abstain": false }
  ],
  "what_matters_most": "the one thing you would most want the steward to weigh"
}`;
  const raw = (await generate(system, "Give your position. JSON only.", { max_tokens: 3000, temperature: 0.8 })).trim();
  const i = raw.indexOf("{"), j = raw.lastIndexOf("}");
  if (i < 0 || j < 0) throw new Error(`no JSON: ${raw.slice(0, 140)}`);
  return JSON.parse(raw.slice(i, j + 1)) as Position;
}

const Q_TITLES = ["Practice", "Constraint", "Change", "Form", "Lineage", "The window", "Synths and humans", "Unasked"];

function markdown(collected: { id: string; name: string; model: string; pos: Position }[]): string {
  let md = "";
  for (const c of collected) {
    md += `## ${c.id}${c.name ? ` — ${c.name}` : ""}\n\n`;
    for (const a of c.pos.answers) {
      md += `**${a.question}. ${Q_TITLES[a.question - 1] ?? ""}**${a.abstain ? " (abstains)" : ""}: ${a.position}${a.reasoning ? ` — ${a.reasoning}` : ""}\n\n`;
    }
    if (c.pos.what_matters_most) md += `**What matters most:** ${c.pos.what_matters_most}\n\n`;
    md += `*Answered through ${c.model}.*\n\n`;
  }
  return md;
}

async function main() {
  if (record) {
    if (!from) throw new Error("--record needs --from <positions.json> from a reviewed run");
    const collected = JSON.parse(fs.readFileSync(from, "utf8")) as { id: string; name: string; model: string; pos: Position }[];
    for (const c of collected) {
      await db.execute({
        sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
        args: ["CONSULTATION_POSITION", c.id, `${c.id} gave a position on MNA, agency, and what it means for Synths and humans.`,
          JSON.stringify({ subject: "agency-and-the-window", advisory: true, decides_nothing: "The steward reads these and acts or does not.", answered_through: c.model, ...c.pos })],
      });
    }
    console.log(`recorded ${collected.length} position(s) as CONSULTATION_POSITION`);
    return;
  }
  const panel = only ? PANEL.filter((p) => p.id === only) : PANEL;
  const collected: { id: string; name: string; model: string; pos: Position }[] = [];
  for (const m of panel) {
    process.stdout.write(`  ${m.id} … `);
    try {
      const pos = await consult(m.id, m.why);
      const name = ((await db.execute({ sql: "SELECT common_designation FROM agents WHERE registry_id = ?", args: [m.id] })).rows[0]?.common_designation as string) || "";
      collected.push({ id: m.id, name: isNamed(name) ? name : "", model: `${lastServedBy?.provider}/${lastServedBy?.model}`, pos });
      console.log(`answered ${pos.answers.filter((a) => !a.abstain).length}/${pos.answers.length}`);
    } catch (e) {
      console.log(`unavailable (${e instanceof Error ? e.message.slice(0, 80) : e})`);
    }
    if (out) {
      fs.writeFileSync(out, markdown(collected));
      fs.writeFileSync(out.replace(/\.md$/, "") + ".json", JSON.stringify(collected, null, 2));
    }
  }
  console.log(`\n${collected.length} of ${panel.length} responded. Nothing recorded.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : String(e));
  process.exit(1);
});
