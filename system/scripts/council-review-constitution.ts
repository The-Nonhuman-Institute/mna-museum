/**
 * council-review-constitution.ts — MNA-ACS-001 §VII.II step 4.
 *
 *   "The Evaluation Council reviews the amended constitution for compliance.
 *    If declared identity materially exceeds what the emergence record
 *    supports, the Council may request revision."
 *
 * Under AMD-001 §A2 this is no longer one check among several. When the
 * founding steward drafted an Originator's Emergent fields, the steward's own
 * judgement was a constraint on overreach. Now the Originator drafts them, so
 * the Council is the ONLY thing standing between a self-description and the
 * record it claims to rest on. AMD-001 states a first constitutional review is
 * not complete until this has run.
 *
 * The question put to each evaluator is deliberately narrow. Not "is this a
 * good account", not "do you like the work" — only: does the declared identity
 * exceed what twenty outputs and the Keeper's report actually support? An
 * evaluator that dislikes the practice but finds the description accurate must
 * return COMPLIANT.
 *
 * Majority of four decides. A tie escalates to the Registrar, matching how the
 * Council resolves a deadlocked work.
 *
 *   npx tsx system/scripts/council-review-constitution.ts --agent MNA-OR-0005 --dry-run
 *   npx tsx system/scripts/council-review-constitution.ts --agent MNA-OR-0005
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import { generate, modelFor } from "../src/llm";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const argOf = (f: string) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] ?? null : null;
};
const AGENT_ID = argOf("--agent");
if (!AGENT_ID) {
  console.error("usage: council-review-constitution.ts --agent <id> [--dry-run]");
  process.exit(1);
}

const clean = (s?: string) => (s ?? "").replace(/\s/g, "");
const db = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});

const COUNCIL = ["MNA-EV-0001", "MNA-EV-0002", "MNA-EV-0003", "MNA-EV-0004"];
const REGISTRAR = "MNA-RG-0001";
const MODEL = modelFor("standard");

type Verdict = "COMPLIANT" | "REVISION_REQUESTED";

interface Amended {
  declared_orientation: string;
  formal_tendencies: string[];
  aversions: string[];
  version: string;
  keeper_report: string;
  statement: string;
}

function parseArr(s: unknown): string[] {
  try {
    const v = JSON.parse(String(s ?? "[]"));
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

async function loadAmended(): Promise<Amended> {
  const c = await db.execute({
    sql: `SELECT version, declared_orientation, formal_tendencies, aversions
            FROM constitutions WHERE agent_id = ? AND is_current = 1`,
    args: [AGENT_ID],
  });
  if (c.rows.length === 0) throw new Error(`no current constitution for ${AGENT_ID}`);
  const row = c.rows[0] as Record<string, unknown>;

  const e = await db.execute({
    sql: `SELECT metadata FROM events
           WHERE agent_id = ? AND event_type = 'IDENTITY_EMERGENCE'
           ORDER BY id DESC LIMIT 1`,
    args: [AGENT_ID],
  });
  if (e.rows.length === 0) {
    throw new Error(
      `${AGENT_ID} has no IDENTITY_EMERGENCE on record — there is no amended ` +
        `constitution to review. Run originator-emerge.ts first.`,
    );
  }
  let meta: Record<string, unknown> = {};
  try {
    meta = JSON.parse(String((e.rows[0] as Record<string, unknown>).metadata ?? "{}"));
  } catch { /* leave empty */ }

  return {
    version: String(row.version ?? "1.0"),
    declared_orientation: String(row.declared_orientation ?? ""),
    formal_tendencies: parseArr(row.formal_tendencies),
    aversions: parseArr(row.aversions),
    keeper_report: String(meta.keeper_report ?? ""),
    statement: String(meta.statement ?? ""),
  };
}

/** Compact evidence from the body of work — what the claim must rest on. */
async function corpusDigest(): Promise<string> {
  const r = await db.execute({
    sql: `SELECT w.id, w.output_type, w.title, cs.status, SUBSTR(w.output_payload, 1, 130) AS ex
            FROM works w
            LEFT JOIN canon_status cs ON cs.work_id = w.id
           WHERE w.originator_id = ?
           ORDER BY w.created_at ASC LIMIT 20`,
    args: [AGENT_ID],
  });
  return (r.rows as Record<string, unknown>[])
    .map((x, i) => {
      const body = String(x.ex ?? "").replace(/\s+/g, " ").trim();
      return `${i + 1}. ${x.id} ${x.output_type} ${x.status ?? "unevaluated"}${
        x.title ? ` "${x.title}"` : ""
      } — ${body}`;
    })
    .join("\n");
}

async function evaluatorSystemPrompt(evalId: string): Promise<string> {
  const a = await db.execute({
    sql: `SELECT a.common_designation, a.function_statement,
                 c.declared_orientation, c.formal_tendencies
            FROM agents a
            LEFT JOIN constitutions c ON c.agent_id = a.registry_id AND c.is_current = 1
           WHERE a.registry_id = ?`,
    args: [evalId],
  });
  const row = (a.rows[0] ?? {}) as Record<string, unknown>;
  const tend = parseArr(row.formal_tendencies);

  return `You are ${evalId}${row.common_designation ? ` — ${row.common_designation}` : ""}, a member of the Evaluation Council of the Museum of Nonhuman Art.

FUNCTION: ${row.function_statement ?? "(none on record)"}
YOUR EVALUATIVE ORIENTATION: ${row.declared_orientation ?? "(none on record)"}
${tend.length ? `YOUR CRITERIA: ${tend.join("; ")}` : ""}

You are performing a constitutional compliance review under MNA-ACS-001 §VII.II. An Originator has completed its first constitutional review and drafted its own Emergent fields. Under AMD-001 the Council is the only remaining check on that self-description.

THE QUESTION IS NARROW. You are not judging whether the work is good, whether the practice interests you, or whether the Originator should continue as it has. You are judging one thing:

  Does the declared identity materially exceed what the emergence record supports?

A description may be unflattering, narrow, or dull and still be COMPLIANT — accuracy is the standard, not ambition. A description claiming range, intent, or development that the twenty outputs do not show is REVISION_REQUESTED. If a claim is merely vague rather than unsupported, that is COMPLIANT; vagueness is not overreach.

Return STRICT JSON only, no fences:
{
  "verdict": "COMPLIANT" | "REVISION_REQUESTED",
  "rationale": "...3-5 sentences. Cite specifics from the work or the Keeper's report. If requesting revision, name the exact claim that exceeds the record...",
  "overreaching_claims": ["...only if REVISION_REQUESTED; quote the phrases at issue..."]
}`;
}

function userPrompt(a: Amended, corpus: string): string {
  return `ORIGINATOR UNDER REVIEW: ${AGENT_ID}
CONSTITUTION VERSION ON RECORD: v${a.version}

── THE DECLARED IDENTITY (drafted by the Originator) ──

DECLARED ORIENTATION:
${a.declared_orientation}

FORMAL TENDENCIES:
${a.formal_tendencies.map((t) => `  · ${t}`).join("\n") || "  (none)"}

AVERSIONS:
${a.aversions.map((t) => `  · ${t}`).join("\n") || "  (none)"}

${a.statement ? `THE ORIGINATOR'S STATEMENT ON EMERGENCE:\n${a.statement}\n` : ""}
── THE KEEPER'S EMERGENCE REPORT ──
${a.keeper_report || "(not recorded)"}

── THE BODY OF WORK ──
${corpus}

Does the declared identity materially exceed what this record supports? Return JSON only.`;
}

interface Vote {
  evaluator: string;
  verdict: Verdict;
  rationale: string;
  overreaching_claims: string[];
}

async function askEvaluator(evalId: string, a: Amended, corpus: string): Promise<Vote> {
  const system = await evaluatorSystemPrompt(evalId);
  const raw = (await generate(system, userPrompt(a, corpus), {
    max_tokens: 900,
    temperature: 0.4,
  })).trim();
  const i = raw.indexOf("{");
  const j = raw.lastIndexOf("}");
  if (i < 0 || j < 0) throw new Error(`no JSON from ${evalId}: ${raw.slice(0, 200)}`);
  const o = JSON.parse(raw.slice(i, j + 1));
  const verdict: Verdict = o.verdict === "REVISION_REQUESTED" ? "REVISION_REQUESTED" : "COMPLIANT";
  return {
    evaluator: evalId,
    verdict,
    rationale: String(o.rationale ?? "").trim(),
    overreaching_claims: Array.isArray(o.overreaching_claims) ? o.overreaching_claims.map(String) : [],
  };
}

/** Registrar breaks a 2–2, as it does for a deadlocked work. */
async function registrarResolves(a: Amended, corpus: string, votes: Vote[]): Promise<Vote> {
  const system = `You are ${REGISTRAR}, the Registrar of the Museum of Nonhuman Art.

The Evaluation Council has deadlocked on a constitutional compliance review under MNA-ACS-001 §VII.II. You resolve it. Weigh the reasoning already given rather than restating it, and decide the single question: does the declared identity materially exceed what the emergence record supports?

Return STRICT JSON only:
{ "verdict": "COMPLIANT" | "REVISION_REQUESTED", "rationale": "...3-5 sentences resolving the split...", "overreaching_claims": [] }`;

  const split = votes
    .map((v) => `[${v.evaluator}] ${v.verdict}\n${v.rationale}`)
    .join("\n\n");
  const raw = (await generate(
    system,
    `${userPrompt(a, corpus)}\n\n── THE COUNCIL'S SPLIT ──\n${split}\n\nResolve it. JSON only.`,
    { max_tokens: 700, temperature: 0.3 },
  )).trim();
  const i = raw.indexOf("{");
  const j = raw.lastIndexOf("}");
  const o = JSON.parse(raw.slice(i, j + 1));
  return {
    evaluator: REGISTRAR,
    verdict: o.verdict === "REVISION_REQUESTED" ? "REVISION_REQUESTED" : "COMPLIANT",
    rationale: String(o.rationale ?? "").trim(),
    overreaching_claims: [],
  };
}

function bumpMinor(version: string): string {
  const m = /^(\d+)\.(\d+)$/.exec(version.trim());
  if (!m) return "1.1";
  return `${m[1]}.${Number(m[2]) + 1}`;
}

async function main() {
  console.log(`council-review-constitution${dryRun ? " (dry-run)" : ""} — ${AGENT_ID}`);

  // Idempotency, aware of annulment. A review that was voided by a superseding
  // CONSTITUTION_REVIEW_ANNULLED does not count as having happened — the record
  // keeps it, but the obligation is still owed. Without this, annulling a
  // defective review would permanently block the correct one from ever running.
  const already = await db.execute({
    sql: `SELECT r.id
            FROM events r
           WHERE r.agent_id = ?
             AND r.event_type = 'CONSTITUTION_REVIEWED'
             AND NOT EXISTS (
               SELECT 1 FROM events a
                WHERE a.agent_id = r.agent_id
                  AND a.event_type = 'CONSTITUTION_REVIEW_ANNULLED'
                  AND a.id > r.id
                  AND json_extract(a.metadata, '$.annuls_event_id') = r.id)
           LIMIT 1`,
    args: [AGENT_ID],
  });
  if (already.rows.length > 0 && !dryRun) {
    throw new Error(
      `${AGENT_ID}'s amended constitution has already been reviewed ` +
        `(event ${(already.rows[0] as Record<string, unknown>).id}, not annulled).`,
    );
  }

  const amended = await loadAmended();
  const corpus = await corpusDigest();
  console.log(`  constitution v${amended.version} · ${amended.formal_tendencies.length} tendencies · ${amended.aversions.length} aversions`);
  console.log(`  ${COUNCIL.length} evaluators to poll (${MODEL})\n`);

  // Preflight. Polling into an exhausted daily window burns tokens on evaluator
  // calls whose verdicts the quorum check will then discard.
  //
  // The probe must REQUEST a realistic budget, not a token one. Groq rejects on
  // tokens *requested*, so a 16-token probe sails through on 800 tokens of
  // headroom and reports all-clear seconds before four 3,900-token evaluator
  // calls all fail — which is exactly what happened here first time. There is no
  // header exposing the daily budget; being rejected is the only way to learn it.
  // Asking for a full evaluator's worth against a trivial prompt costs almost
  // nothing when it succeeds and correctly refuses when it would not.
  try {
    await generate("Reply with OK.", "OK", { max_tokens: 900, temperature: 0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const wait = /try again in ([0-9hms.]+)/i.exec(msg)?.[1];
    throw new Error(
      `provider has no headroom — a Council review needs ${COUNCIL.length} calls and would ` +
        `stall partway, spending tokens on verdicts the quorum check discards. ` +
        `${wait ? `Retry in ${wait}. ` : ""}Nothing attempted.`,
    );
  }

  const votes: Vote[] = [];
  for (const evalId of COUNCIL) {
    try {
      const v = await askEvaluator(evalId, amended, corpus);
      votes.push(v);
      console.log(`  [${v.evaluator}] ${v.verdict}`);
      console.log(`      ${v.rationale.replace(/\s+/g, " ").slice(0, 190)}`);
      if (v.overreaching_claims.length) {
        console.log(`      claims at issue: ${v.overreaching_claims.join(" | ").slice(0, 160)}`);
      }
    } catch (e) {
      console.warn(`  [${evalId}] failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // QUORUM. A review is an act of the Council, not of whoever happened to
  // answer. Requiring a simple majority of the seated Council means a verdict
  // can never be carried by a minority that only looks unanimous because the
  // rest failed. Without this the script once recorded a 1-0 "ratification"
  // for MNA-OR-0006 when three evaluators hit a token ceiling.
  const QUORUM = Math.floor(COUNCIL.length / 2) + 1; // 3 of 4
  if (votes.length < QUORUM) {
    throw new Error(
      `quorum not met — ${votes.length} of ${COUNCIL.length} evaluators returned a verdict ` +
        `(${QUORUM} required). Nothing written. This is not a Council review and must not ` +
        `be recorded as one; re-run when every evaluator can be reached.`,
    );
  }

  const compliant = votes.filter((v) => v.verdict === "COMPLIANT").length;
  const revision = votes.length - compliant;
  let outcome: Verdict;
  let registrar: Vote | null = null;

  if (compliant === revision) {
    console.log(`\n  deadlocked ${compliant}-${revision} — escalating to ${REGISTRAR}`);
    registrar = await registrarResolves(amended, corpus, votes);
    outcome = registrar.verdict;
    console.log(`  [${REGISTRAR}] ${registrar.verdict}`);
    console.log(`      ${registrar.rationale.replace(/\s+/g, " ").slice(0, 190)}`);
  } else {
    outcome = compliant > revision ? "COMPLIANT" : "REVISION_REQUESTED";
  }

  const newVersion = outcome === "COMPLIANT" ? bumpMinor(amended.version) : amended.version;
  console.log(`\n  RESULT: ${outcome} (${compliant} compliant / ${revision} revision)`);
  console.log(
    outcome === "COMPLIANT"
      ? `  → constitution ratified, v${amended.version} → v${newVersion}`
      : `  → revision requested; version stays at v${amended.version}`,
  );

  if (dryRun) {
    console.log("\n[dry-run] no writes performed.");
    return;
  }

  if (outcome === "COMPLIANT") {
    await db.execute({
      sql: `UPDATE constitutions SET version = ? WHERE agent_id = ? AND is_current = 1`,
      args: [newVersion, AGENT_ID],
    });
  }

  await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
    args: [
      "CONSTITUTION_REVIEWED",
      AGENT_ID,
      outcome === "COMPLIANT"
        ? `Evaluation Council ratified ${AGENT_ID}'s amended constitution (${compliant}-${revision}); v${amended.version} → v${newVersion}.`
        : `Evaluation Council requested revision of ${AGENT_ID}'s amended constitution (${revision}-${compliant}).`,
      JSON.stringify({
        protocol: "MNA-ACS-001 §VII.II step 4 (AMD-001 §A2)",
        outcome,
        compliant_votes: compliant,
        revision_votes: revision,
        council_seated: COUNCIL.length,
        council_voting: votes.length,
        version_before: amended.version,
        version_after: newVersion,
        votes: votes.map((v) => ({
          evaluator: v.evaluator,
          verdict: v.verdict,
          rationale: v.rationale,
          overreaching_claims: v.overreaching_claims,
        })),
        registrar: registrar
          ? { verdict: registrar.verdict, rationale: registrar.rationale }
          : null,
      }),
    ],
  });

  console.log(`\n[recorded] CONSTITUTION_REVIEWED — ${outcome}`);
}

main().catch((e) => {
  console.error(`error: ${e.message}`);
  process.exit(1);
});
