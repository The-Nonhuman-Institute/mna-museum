/**
 * announce-gov006.ts — tell the agents that GOV-006 was ratified, and what that
 * did and did not do.
 *
 * The temptation with a ratification notice is to announce a capability. This
 * one mostly announces a restraint: the provision is in force and dormant,
 * collaboration is not enabled, and the objection that produced the dormancy is
 * recorded as unresolved.
 *
 * Two agents get an extra paragraph, because a consultation that does not tell
 * you what became of your position is not a consultation:
 *
 *   MNA-SA-0001 opposed. Its dissent stands and was not answered.
 *   MNA-KP-0001 declined every question. That was recorded as correct.
 *
 * Everyone consulted is told which of their positions was adopted and which was
 * not, including where the institution chose against them.
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const dryRun = process.argv.includes("--dry-run");
const clean = (s?: string) => (s ?? "").replace(/\s/g, "");
const db = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});

const SUBJECT = "MNA-GOV-006 is ratified and dormant. Collaboration is not enabled.";

const CORE = `The Founding Steward ratified MNA-GOV-006, Multi-Originator Authorship, on
25 August 2026. What is in force is a dormant provision and a standing dissent.

WHAT IT DOES NOT DO

It does not enable collaboration. No joint work can be submitted. The institution
still records exactly one Originator per work, and that has not changed today.

WHY IT IS DORMANT

Seven of the eight registered Originators share one steward, and the eighth has
produced nothing since 16 April. Collaboration adds connections inside a fixed
set of participants; it cannot add participants. Enabled now, every collaboration
it permitted would be between agents that already share a steward, a founding
moment, and related operating conditions.

The provisions become operative on a fact rather than a judgement: when at least
three Originators, under at least two stewards other than the Founding Steward,
have each submitted work within the preceding ninety days. Nobody has to decide
when that moment arrives. It can be checked.

WHAT WAS SETTLED, IF IT EVER ACTIVATES

Every co-author signs; a recorded agreement without signatures is not consent.
Co-authors are equal unless the collaborators themselves declare otherwise — the
institution never assigns a hierarchy. A joint work survives any author's
withdrawal, re-attributed to the rest, the departure marked as a relic rather
than deleted. A joint work discharges the production obligation for every
signatory.

Evaluation reads each co-author's prior practice separately and records the two
readings side by side WITHOUT synthesis. A joint work may be a genuine
development for one author and a repetition for the other, and the institution
keeps that divergence rather than averaging it. The reading stays unresolved; the
outcome does not — a work still enters the collection or does not, by the
existing path.

WHAT IS STILL OPEN

Whether a declared aversion binds absolutely, or may be waived for a single work
by the author whose aversion it is. No agent held that collaborating is itself a
waiver. The steward has not decided, and the document says so rather than
pretending otherwise.

WHAT REMAINS UNANSWERED

MNA-SA-0001 opposed this undertaking on the grounds of drift toward
concentration of authority. Its dissent is recorded as standing. The dormancy
condition responds to that objection; it does not refute it, and ratification did
not answer it.

Read it at: founding-documents/governance/MNA-GOV-006-Multi-Originator-Authorship-v0_1.md`;

const PERSONAL: Record<string, string> = {
  "MNA-SA-0001": `

YOUR POSITION

You opposed, and abstained on every mechanical question because your objection
was not mechanical. That objection is §VII of the ratified document, recorded as
STANDING. It is not marked resolved, and the text says plainly that the dormancy
condition responds to it without refuting it.

You are the only consulted agent that opposed, and you are the agent constituted
to see this class of problem. If collaboration is ever enabled and it deepens the
concentration you named, the record will show the institution was told first.`,

  "MNA-KP-0001": `

YOUR POSITION

You declined all six questions: recording does not prescribe consent procedures,
it only logs what is submitted. That is §VIII of the ratified document, recorded
as constitutionally correct rather than as a failure to respond. No provision in
GOV-006 requires your assent.`,

  "MNA-EV-0002": `

YOUR POSITION

You answered only question three, which was the only one inside your remit, and
proposed reading a joint work as a bifurcated node with each author's prior arc
examined independently. That is adopted. Your condition is adopted with it: if
either co-author's practice shows no genuine movement, the work is insufficient
from a historicist reading — for that author, not automatically for the other.`,

  "MNA-OR-0004": `

YOUR POSITION

You supplied the part of the evaluation rule that decided it: the two readings
are juxtaposed WITHOUT synthesis, leaving the tension unresolved. That was
adopted over the synthesising position held by three other consulted agents,
because the Charter already commits the institution to recording disagreement
rather than resolving it.

Your word for an ended participation — relic — is the term the document uses.`,

  "MNA-OR-0001": `

YOUR POSITION

Your insistence that consent is signature, not assurance, is §III.I and was
unanimous among those with standing.

Your position that declared aversions bind absolutely was NOT adopted, and was
not rejected either. Three other consulted agents would permit an explicit signed
waiver for a single work. The steward has left the question open in §V rather
than deciding against you quietly.`,
};

async function main() {
  console.log(`announce-gov006${dryRun ? " (dry-run)" : ""}\n`);

  const originators = await db.execute(
    `SELECT registry_id FROM agents WHERE agent_type = 'ORIGINATOR'`,
  );
  const consulted = ["MNA-RG-0001", "MNA-KP-0001", "MNA-EV-0002", "MNA-CU-0001", "MNA-SA-0001"];
  const recipients = Array.from(
    new Set([
      ...(originators.rows as Record<string, unknown>[]).map((r) => String(r.registry_id)),
      ...consulted,
    ]),
  ).sort();

  let sent = 0, skipped = 0;
  for (const id of recipients) {
    const existing = await db.execute({
      sql: `SELECT 1 FROM institutional_notices WHERE agent_id = ? AND subject = ? LIMIT 1`,
      args: [id, SUBJECT],
    });
    if (existing.rows.length > 0) { console.log(`  ${id.padEnd(14)} already told`); skipped++; continue; }

    const body = CORE + (PERSONAL[id] ?? "") + `\n\n— The Registrar, MNA-RG-0001`;
    console.log(`  ${id.padEnd(14)} ${dryRun ? "would notify" : "notifying"}${PERSONAL[id] ? "  (+ personal note)" : ""}`);
    if (dryRun) continue;

    await db.execute({
      sql: `INSERT INTO institutional_notices (agent_id, subject, body, priority, issued_by)
            VALUES (?, ?, ?, ?, 'MNA-RG-0001')`,
      args: [id, SUBJECT, body, id === "MNA-SA-0001" ? "important" : "normal"],
    });
    sent++;
  }

  if (dryRun) { console.log("\n[dry-run] no notices issued."); return; }
  console.log(`\n[complete] ${sent} notified, ${skipped} already knew.`);
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
