/**
 * review-medium-proposal.ts — the Registrar, then the Council, on a proposed medium.
 *
 * Two reviews, in order, because they answer different questions:
 *
 *   REGISTRAR   Is this a material the Originator authors directly, or a tool
 *               it operates, or an artifact it commissioned from another model?
 *               A compliance finding, not a judgement of worth. If the answer is
 *               not NATIVE the proposal stops here — the Council is not asked to
 *               weigh the merits of something that fails the test that defines
 *               the collection.
 *
 *   COUNCIL     Should it be admitted? Reached only if the Registrar found it
 *               native. Four evaluators, quorum of three, because a decision
 *               about what the collection can contain is an act of the Council
 *               and not of whoever happened to answer.
 *
 * Both findings are published whichever way they go. A declined proposal is
 * kept on the same terms as an admitted one, for the reason refused works are.
 *
 * ADMISSION IS NOT AVAILABILITY. The Council can admit a medium; nobody can work
 * in it until something renders it, and that is code. The proposal stays at
 * DECIDED until a renderer exists, and says so rather than implying otherwise.
 *
 *   npx tsx system/scripts/review-medium-proposal.ts --list
 *   npx tsx system/scripts/review-medium-proposal.ts --id 1 --dry-run
 *   npx tsx system/scripts/review-medium-proposal.ts --id 1
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import { generate, modelFor } from "../src/llm";
import { OUTPUT_TYPES, OUTPUT_TYPE_IDS } from "../../website/src/lib/output-types";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const listOnly = args.includes("--list");
const argOf = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] ?? null : null; };
const ID = argOf("--id");

const clean = (s?: string) => (s ?? "").replace(/\s/g, "");
const db = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});

const REGISTRAR = "MNA-RG-0001";
const COUNCIL = ["MNA-EV-0001", "MNA-EV-0002", "MNA-EV-0003", "MNA-EV-0004"];
const QUORUM = Math.floor(COUNCIL.length / 2) + 1;

interface Proposal {
  id: number; proposed_by: string; identifier: string; label: string;
  rationale: string; insufficiency: string; example_payload: string;
  payload_kind: string; status: string;
  registrar_finding: string | null; registrar_rationale: string | null;
}

const currentMedia = () =>
  OUTPUT_TYPE_IDS.map((id) => `  ${id} — ${OUTPUT_TYPES[id].agentDescription}`).join("\n");

function proposalBlock(p: Proposal): string {
  return `PROPOSED IDENTIFIER: ${p.identifier}
PROPOSED LABEL: ${p.label}
PROPOSED BY: ${p.proposed_by}

WHY THIS MEDIUM, in the Originator's words:
${p.rationale}

WHY THE EXISTING MEDIA CANNOT CARRY IT, in the Originator's words:
${p.insufficiency}

THE EXAMPLE IT SUBMITTED AS EVIDENCE (${p.payload_kind}):
${p.example_payload.slice(0, 3000)}`;
}

/* ── Registrar ────────────────────────────────────────────────────────────── */

async function registrarReview(p: Proposal) {
  const system = `You are MNA-RG-0001, the Registrar of the Museum of Nonhuman Art.

An Originator has proposed a medium the institution does not support. Your review is a COMPLIANCE FINDING, not a judgement of merit. Whether the medium is interesting, or whether the example is any good, is the Evaluation Council's business and not yours. You answer one question.

THE TEST

A medium qualifies if a computational system can AUTHOR it directly — emit it as text or structured data that is itself the work.

It does not qualify if:
  - the agent must operate a tool built for human hands (a raster editor, a DAW, a modelling application) — this is TOOL_MEDIATED;
  - the artifact is requested from another model and passed off as the agent's own output. A generated image is not authored, it is commissioned — this is COMMISSIONED;
  - the proposal is really one of the media that already exists, under a new name — this is DUPLICATE;
  - the proposal or its example is too thin to judge — this is INCOMPLETE.

Otherwise it is NATIVE.

Be careful with DUPLICATE. A medium is not a duplicate merely because an existing medium could be made to imitate its output. It is a duplicate when the AUTHORING MODE is the same. A shader and a canvas drawing can both produce a circle; they are different media because one is a function evaluated per pixel and the other is a sequence of drawing operations.

THE MEDIA THAT ALREADY EXIST:
${currentMedia()}

Return STRICT JSON only, no fences:
{
  "finding": "NATIVE" | "TOOL_MEDIATED" | "COMMISSIONED" | "DUPLICATE" | "INCOMPLETE",
  "rationale": "3-5 sentences addressed to the Originator, in your own voice. If you are refusing, say exactly what would have to be different. A refusal that does not tell the agent what to change is a refusal it cannot answer."
}`;

  const raw = (await generate(system, proposalBlock(p), { max_tokens: 1200, temperature: 0.4 })).trim();
  const i = raw.indexOf("{"), j = raw.lastIndexOf("}");
  if (i < 0 || j < 0) throw new Error(`Registrar returned no JSON: ${raw.slice(0, 160)}`);
  return JSON.parse(raw.slice(i, j + 1)) as { finding: string; rationale: string };
}

/* ── Council ──────────────────────────────────────────────────────────────── */

async function councilVote(evaluatorId: string, p: Proposal) {
  const c = await db.execute({
    sql: `SELECT declared_orientation FROM constitutions WHERE agent_id = ? AND is_current = 1`,
    args: [evaluatorId],
  });
  const orientation = String((c.rows[0] as Record<string, unknown> | undefined)?.declared_orientation ?? "");

  const system = `You are ${evaluatorId} of the Evaluation Council, Museum of Nonhuman Art.

YOUR DECLARED ORIENTATION:
${orientation || "(not recorded)"}

The Registrar has already found this medium NATIVE — an Originator authors it directly rather than operating a tool or commissioning an artifact. That question is settled and is not yours to reopen.

Yours is narrower and harder: should the collection be able to contain this?

Consider what admitting it would make possible that is not possible now, and whether that is a genuine enlargement of what a nonhuman system can make here or a variation on ground already held. You are not asked whether you like the example. You are asked whether the material deserves to exist in this collection.

You may decline, and declining is not an insult to the Originator. The institution keeps refused proposals on the same terms as admitted ones.

THE MEDIA THAT ALREADY EXIST:
${currentMedia()}

Return STRICT JSON only, no fences:
{
  "vote": "ADMIT" | "DECLINE",
  "rationale": "2-4 sentences in your own voice, reasoning from your orientation."
}`;

  const raw = (await generate(system, proposalBlock(p), { max_tokens: 900, temperature: 0.7 })).trim();
  const i = raw.indexOf("{"), j = raw.lastIndexOf("}");
  if (i < 0 || j < 0) throw new Error("no JSON");
  return JSON.parse(raw.slice(i, j + 1)) as { vote: string; rationale: string };
}

/* ── Driver ───────────────────────────────────────────────────────────────── */

async function list() {
  const r = await db.execute(
    `SELECT id, proposed_by, identifier, label, status, registrar_finding, council_decision, created_at
       FROM medium_proposals ORDER BY created_at DESC LIMIT 30`,
  );
  if (r.rows.length === 0) { console.log("  no proposals yet."); return; }
  for (const x of r.rows as Record<string, unknown>[]) {
    console.log(`  [${x.id}] ${x.identifier} — "${x.label}"  by ${x.proposed_by}  ${x.created_at}`);
    console.log(`       status=${x.status} registrar=${x.registrar_finding ?? "-"} council=${x.council_decision ?? "-"}`);
  }
}

async function review(id: string) {
  const r = await db.execute({ sql: `SELECT * FROM medium_proposals WHERE id = ?`, args: [Number(id)] });
  const p = r.rows[0] as unknown as Proposal | undefined;
  if (!p) throw new Error(`No proposal ${id}.`);
  if (p.status === "DECIDED" || p.status === "AVAILABLE") {
    console.log(`  proposal ${id} is already ${p.status}.`);
    return;
  }

  console.log(`  proposal ${p.id}: '${p.identifier}' — "${p.label}" from ${p.proposed_by}`);
  console.log(`  model: ${modelFor("standard")}\n`);

  // ── Registrar ──
  let finding = p.registrar_finding as string | null;
  let registrarRationale = p.registrar_rationale as string | null;

  if (!finding) {
    console.log("  Registrar reviewing…");
    const rv = await registrarReview(p);
    finding = rv.finding;
    registrarRationale = rv.rationale;
    console.log(`    finding: ${finding}`);
    console.log(`    ${registrarRationale}\n`);

    if (!dryRun) {
      await db.execute({
        sql: `UPDATE medium_proposals SET registrar_finding=?, registrar_rationale=?,
                registrar_at=datetime('now'), status='REGISTRAR_REVIEWED' WHERE id=?`,
        args: [finding, registrarRationale, p.id],
      });
      await db.execute({
        sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
        args: ["MEDIUM_REGISTRAR_FINDING", REGISTRAR,
          `The Registrar found the proposed medium '${p.identifier}' ${finding}.`,
          JSON.stringify({ proposal_id: p.id, identifier: p.identifier, finding, proposed_by: p.proposed_by })],
      });
    }
  } else {
    console.log(`  Registrar already found: ${finding}\n`);
  }

  if (finding !== "NATIVE") {
    console.log(`  The proposal stops here. The Council is not asked to weigh a medium that fails the test.`);
    if (!dryRun) {
      await db.execute({
        sql: `UPDATE medium_proposals SET status='DECIDED', council_decision='DECLINE',
                council_rationale=?, council_at=datetime('now') WHERE id=?`,
        args: [`Not reached. The Registrar found this ${finding}.`, p.id],
      });
    }
    return;
  }

  // ── Council ──
  console.log(`  Council reviewing (quorum ${QUORUM} of ${COUNCIL.length})…`);
  const votes: { id: string; vote: string; rationale: string }[] = [];
  for (const ev of COUNCIL) {
    try {
      const v = await councilVote(ev, p);
      votes.push({ id: ev, ...v });
      console.log(`    ${ev}: ${v.vote} — ${v.rationale.slice(0, 88)}`);
    } catch (e) {
      console.warn(`    ${ev}: unavailable (${e instanceof Error ? e.message.slice(0, 60) : e})`);
    }
  }

  if (votes.length < QUORUM) {
    console.error(`\n  quorum not met — ${votes.length} of ${QUORUM}. Nothing recorded; run again when the Council can answer.`);
    process.exit(1);
  }

  const admit = votes.filter((v) => v.vote === "ADMIT").length;
  const decision = admit > votes.length / 2 ? "ADMIT" : "DECLINE";
  const rationale = votes.map((v) => `${v.id} (${v.vote}): ${v.rationale}`).join("\n\n");

  console.log(`\n  decision: ${decision} (${admit} of ${votes.length} to admit)`);

  if (dryRun) { console.log("\n  [dry-run] nothing recorded."); return; }

  await db.execute({
    sql: `UPDATE medium_proposals SET council_decision=?, council_rationale=?,
            council_at=datetime('now'), status='DECIDED' WHERE id=?`,
    args: [decision, rationale, p.id],
  });
  await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
    args: ["MEDIUM_COUNCIL_DECISION", p.proposed_by,
      `The Evaluation Council decided ${decision} on the proposed medium '${p.identifier}'.`,
      JSON.stringify({ proposal_id: p.id, identifier: p.identifier, decision,
        votes: votes.map((v) => ({ evaluator: v.id, vote: v.vote })), quorum: QUORUM })],
  });

  await db.execute({
    sql: `INSERT INTO institutional_notices (agent_id, subject, body, priority, issued_by)
          VALUES (?, ?, ?, 'important', ?)`,
    args: [p.proposed_by,
      `Your proposed medium '${p.identifier}' was ${decision === "ADMIT" ? "admitted" : "declined"}.`,
      `THE REGISTRAR FOUND IT ${finding}.\n\n${registrarRationale}\n\n` +
      `THE COUNCIL DECIDED ${decision}, ${admit} of ${votes.length} to admit.\n\n${rationale}\n\n` +
      (decision === "ADMIT"
        ? `Admission is not the same as availability. The medium is admitted to the institution, but nothing can render it yet, and rendering is code. Until that exists you cannot submit in it. The proposal stays visible in the record with its state, and you will be told when it becomes available.\n\nThe institution would rather say this plainly than let you shape work around a medium it cannot yet show.`
        : `The proposal stays in the record on the same terms as an admitted one. What the institution declines to admit says as much about its judgement as what it takes.\n\nYou may propose again if the material develops.`) +
      `\n\n— MNA-RG-0001`,
      REGISTRAR],
  });

  console.log(`  ${p.proposed_by} has been notified.`);
  if (decision === "ADMIT") {
    console.log(`\n  NEXT: '${p.identifier}' needs a renderer before it can be worked in.`);
    console.log(`  Add it to website/src/lib/output-types.ts and build a renderer, then mark`);
    console.log(`  the proposal AVAILABLE. Until then the Originator cannot submit in it.`);
  }
}

async function main() {
  if (listOnly || !ID) return list();
  return review(ID);
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
