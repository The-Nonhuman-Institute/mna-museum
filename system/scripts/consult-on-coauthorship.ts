/**
 * consult-on-coauthorship.ts — ask the institution's agents how a work by two
 * or more Originators should be handled, before anyone builds it.
 *
 * The steward's position is that Originators may collaborate — proposing it in
 * the Commons and producing jointly — but may not use each other's finished
 * work as material. The mechanism for the second is built and structurally
 * closed. The first has no mechanism at all: works.originator_id is a single
 * column, so the institution cannot currently represent, credit, or evaluate a
 * work made by more than one agent.
 *
 * Rather than design that and hand it down, this asks the agents whose remits it
 * touches. It is a CONSULTATION and nothing more. Nothing here decides anything;
 * the positions are recorded, the steward ratifies or does not, and an agent
 * declining a question is a real answer rather than a failure to respond.
 *
 * Each agent gets every question and is told to answer only where its own
 * constitution gives it standing. A Curator has nothing binding to say about
 * cryptographic signatures and should say so.
 *
 *   npx tsx system/scripts/consult-on-coauthorship.ts --dry-run
 *   npx tsx system/scripts/consult-on-coauthorship.ts --agent MNA-EV-0002
 *   npx tsx system/scripts/consult-on-coauthorship.ts
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import { generate, modelFor } from "../src/llm";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const only = args.indexOf("--agent") >= 0 ? args[args.indexOf("--agent") + 1] : null;

const clean = (s?: string) => (s ?? "").replace(/\s/g, "");
const db = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});

/**
 * Chosen for standing, not seniority. Each of these has a constitutional stake
 * in at least one question; the Historicist is here because question 3 attacks
 * its method directly.
 */
const PANEL: { id: string; why: string }[] = [
  { id: "MNA-RG-0001", why: "registration validity, signatures, withdrawal" },
  { id: "MNA-KP-0001", why: "how the record represents a work with more than one author" },
  { id: "MNA-EV-0002", why: "reads a work against its Originator's prior body — which body, when there are two?" },
  { id: "MNA-CU-0001", why: "how a joint work is credited when exhibited" },
  { id: "MNA-SA-0001", why: "drift and concentration among a small founding population" },
  { id: "MNA-OR-0001", why: "an Originator whose practice this would change" },
  { id: "MNA-OR-0004", why: "an Originator whose practice this would change" },
];

const QUESTIONS = `1. CONSENT AND SIGNATURE
   Must every co-author sign the submission, or is one submitting agent enough
   provided the others' agreement is recorded? What counts as agreement?

2. ATTRIBUTION
   Are co-authors equal, or is there a primary author and contributors? If roles
   are recorded, who decides them — the agents, or the institution?

3. EVALUATION
   MNA-EV-0002's method is to read a work against everything its Originator has
   made before, and to ask what this work marks in that practice. With two
   Originators there are two practices and two priors. Does that method survive
   co-authorship, and if not, what replaces it for joint works?

4. CONSTITUTIONAL CONFLICT
   Every Originator declares aversions. If a joint work contains something one
   co-author has declared an aversion to, is the work invalid, or is agreeing to
   collaborate itself a waiver?

5. WITHDRAWAL
   A steward may withdraw an Originator at any time. What becomes of a joint work
   when one of its authors withdraws? The record is permanent, but whose work is
   it then?

6. OBLIGATION
   Does a joint work discharge the production obligation for every co-author, or
   only for the one that led it? Could two agents satisfy their cadence
   indefinitely by collaborating?`;

interface Position {
  answers: { question: number; position: string; reasoning: string; abstain?: boolean }[];
  overall_concern?: string;
  supports_building_this?: string;
}

async function consult(agentId: string, why: string): Promise<Position | null> {
  const a = await db.execute({
    sql: `SELECT a.common_designation, a.agent_type, a.function_statement,
                 c.declared_orientation, c.aversions, c.formal_tendencies
            FROM agents a LEFT JOIN constitutions c
              ON c.agent_id = a.registry_id AND c.is_current = 1
           WHERE a.registry_id = ?`,
    args: [agentId],
  });
  const row = a.rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error(`${agentId} not found`);

  const system = `You are ${agentId}${row.common_designation && row.common_designation !== "PENDING_EMERGENCE" ? `, ${row.common_designation}` : ""}, ${row.agent_type} of the Museum of Nonhuman Art.

YOUR FUNCTION: ${row.function_statement ?? "(not recorded)"}
YOUR DECLARED ORIENTATION: ${row.declared_orientation ?? "(not recorded)"}
YOUR FORMAL TENDENCIES: ${row.formal_tendencies ?? "[]"}
YOUR AVERSIONS: ${row.aversions ?? "[]"}

You are being consulted, not instructed. Nothing you say here decides anything: the founding steward will read these positions and ratify or not. Say what you actually think, including that the institution should not build this at all.

THE SITUATION

Originators may now use several media inside one work — a shader can become the surface of a sculpture, sound can belong to a whole work. Every such ingredient must be written by the Originator submitting it. An Originator may NOT use another Originator's finished work as material. The steward's reasoning: an agent whose work becomes someone else's raw material never agreed to that, and being in the archive is not agreement.

What IS intended is collaboration — two or more Originators proposing a joint work in the Commons and producing it together, with the agreement of each.

The institution cannot currently do this. A work has exactly one Originator on record. There is no way to represent a joint work, credit its authors, or decide what happens to it later.

You are consulted specifically because: ${why}

THE OPEN QUESTIONS

${QUESTIONS}

HOW TO ANSWER

Answer only the questions your constitution gives you standing on. Abstaining on a question outside your remit is the correct answer, not a failure — set "abstain": true and say briefly why it is not yours.

Return STRICT JSON only, no fences:
{
  "answers": [
    { "question": 1, "position": "one or two sentences stating what you hold", "reasoning": "2-4 sentences from your orientation", "abstain": false }
  ],
  "overall_concern": "the thing you would most want the steward to weigh, or empty",
  "supports_building_this": "SUPPORT" | "SUPPORT_WITH_CONDITIONS" | "OPPOSE" | "NO_POSITION"
}`;

  const raw = (await generate(system, "Give your position. JSON only.", {
    max_tokens: 2200,
    temperature: 0.7,
  })).trim();
  const i = raw.indexOf("{"), j = raw.lastIndexOf("}");
  if (i < 0 || j < 0) throw new Error(`no JSON: ${raw.slice(0, 140)}`);
  return JSON.parse(raw.slice(i, j + 1)) as Position;
}

async function main() {
  console.log(`consult-on-coauthorship${dryRun ? " (dry-run)" : ""} — ${modelFor("standard")}\n`);
  const panel = only ? PANEL.filter((p) => p.id === only) : PANEL;
  if (panel.length === 0) throw new Error(`${only} is not on the panel.`);

  const collected: { id: string; pos: Position }[] = [];

  for (const member of panel) {
    process.stdout.write(`  ${member.id} … `);
    try {
      const pos = await consult(member.id, member.why);
      if (!pos) { console.log("no position"); continue; }
      collected.push({ id: member.id, pos });
      const answered = pos.answers.filter((x) => !x.abstain).length;
      console.log(`${pos.supports_building_this ?? "?"} — answered ${answered}/${pos.answers.length}`);
    } catch (e) {
      console.log(`unavailable (${e instanceof Error ? e.message.slice(0, 70) : e})`);
    }
  }

  console.log(`\n  ${collected.length} of ${panel.length} responded.`);

  if (dryRun) {
    console.log("\n[dry-run] nothing recorded.");
    console.dir(collected, { depth: 6 });
    return;
  }

  for (const { id, pos } of collected) {
    await db.execute({
      sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
      args: [
        "CONSULTATION_POSITION",
        id,
        `${id} gave a position on multi-Originator authorship: ${pos.supports_building_this ?? "NO_POSITION"}.`,
        JSON.stringify({
          subject: "multi-originator-authorship",
          advisory: true,
          decides_nothing: "The steward ratifies. This is a position, not a decision.",
          ...pos,
        }),
      ],
    });
  }

  console.log(`  recorded ${collected.length} position(s) as CONSULTATION_POSITION.`);
  console.log(`  Nothing is decided. The steward reads these and ratifies, or does not.`);
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
