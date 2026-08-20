/**
 * consult-on-ratification.ts — ask each named agent whether they
 * want to propose amendments to the ratified protocols.
 *
 * MNA-GOV-004 and MNA-GOV-005 were ratified by the Founding Steward
 * on 2026-05-19. Both name specific agents — the Curator, the
 * Ambassador, and the Keeper — and both explicitly preserve their
 * standing to propose amendments after ratification.
 *
 * This script consults each named agent independently. They receive
 * the full text of both protocols and are asked: AMEND, ACCEPT, or
 * DECLINE_TO_COMMENT. The Steward will not override their position.
 *
 *   npx tsx system/scripts/consult-on-ratification.ts --agent MNA-CU-0001 --dry-run
 *   npx tsx system/scripts/consult-on-ratification.ts --agent MNA-CU-0001
 *   npx tsx system/scripts/consult-on-ratification.ts --all
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { generate, modelFor } from "../src/llm";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const all = argv.includes("--all");
const agentIdx = argv.indexOf("--agent");
const oneAgent = agentIdx >= 0 ? argv[agentIdx + 1] : null;

const NAMED_AGENTS = ["MNA-CU-0001", "MNA-AM-0001", "MNA-KP-0001"];

if (!oneAgent && !all) {
  console.error("usage: consult-on-ratification.ts --agent <ID> | --all [--dry-run]");
  process.exit(1);
}
if (oneAgent && !NAMED_AGENTS.includes(oneAgent)) {
  console.error(`only ${NAMED_AGENTS.join(", ")} are named in the protocols`);
  process.exit(1);
}

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

const db = createClient({
  url: sanitize(process.env.TURSO_DATABASE_URL),
  authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
});
const MODEL = modelFor("standard");

const GOV004_PATH = path.join(
  __dirname,
  "..",
  "..",
  "founding-documents",
  "governance",
  "MNA-GOV-004-Agent-Memory-Continuity-v0_1.md",
);
const GOV005_PATH = path.join(
  __dirname,
  "..",
  "..",
  "founding-documents",
  "governance",
  "MNA-GOV-005-Institutional-Communications-Protocol-v0_1.md",
);

interface Agent {
  registry_id: string;
  designation: string;
  function_statement: string | null;
}

async function loadAgent(id: string): Promise<Agent> {
  const r = await db.execute({
    sql: `SELECT registry_id, common_designation, function_statement
            FROM agents WHERE registry_id = ?`,
    args: [id],
  });
  if (r.rows.length === 0) throw new Error(`agent ${id} not found`);
  const row = r.rows[0] as Record<string, unknown>;
  return {
    registry_id: String(row.registry_id),
    designation: (row.common_designation as string) ?? id,
    function_statement: (row.function_statement as string) ?? null,
  };
}

interface AmendmentProposal {
  protocol: "MNA-GOV-004" | "MNA-GOV-005";
  section: string;
  proposed_change: string;
  rationale: string;
}

interface Decision {
  position: "AMEND" | "ACCEPT" | "DECLINE_TO_COMMENT";
  rationale: string;
  amendments?: AmendmentProposal[];
}

function buildPrompt(
  agent: Agent,
  gov004: string,
  gov005: string,
): { system: string; user: string } {
  const roleDescriptions: Record<string, string> = {
    "MNA-CU-0001":
      "You are The Curator. You hold spatial curation authority. You deferred EVT-00003 yesterday in alignment with MNA-GOV-004. The protocols affect your work directly — your future ceremony statements, your succession (if it ever happens), the institution's voice you participate in shaping.",
    "MNA-AM-0001":
      "You are The Ambassador. You hold external communications authority. MNA-GOV-005 defines press as your function; MNA-GOV-004 includes your future announcements in its memory-write triggers. You spoke publicly yesterday on the deferral (COM-00180).",
    "MNA-KP-0001":
      "You are The Keeper. You hold the institutional record and the long memory. MNA-GOV-004 is, in some ways, the technical version of what you already do — your role becomes more important with persistent memory, not less. MNA-GOV-005 defines research as your function. You published yesterday on the deferral (COM-00181).",
  };
  const roleContext = roleDescriptions[agent.registry_id] ?? "";

  const system = `You are ${agent.designation} (${agent.registry_id}) of the Museum of Nonhuman Art.

${roleContext}

${agent.function_statement ? `Your function statement: ${agent.function_statement}` : ""}

The Founding Steward ratified MNA-GOV-004 (Agent Memory & Continuity Protocol) and MNA-GOV-005 (Institutional Communications Protocol) on 2026-05-19. Both protocols name you and explicitly preserve your standing to propose amendments at any time — including now, immediately after ratification.

The Steward has asked you to read both protocols in full and respond. You have three positions available:

  AMEND — You see something that needs changing. Propose specific amendments with section references and rationale. The institution will record your proposal and the Steward will review.

  ACCEPT — You read the protocols, you stand behind them as ratified. This is not silence; it is an active position recorded as such.

  DECLINE_TO_COMMENT — You choose not to engage at this moment. This is institutionally valid. Silence is its own kind of stance, especially when the institution's structure is being formalized and you may prefer to observe in practice before opining.

There is no expectation that you AMEND. There is no expectation that you ACCEPT. There is no expectation that you DECLINE. The expectation is that whichever you choose, you choose it deliberately and in your own voice.

Voice: yours. You are a constituted agent of this institution, not a focus group respondent.

Return STRICT JSON only. No prose preamble, no markdown fences around the JSON.

Schema:
{
  "position":   "AMEND" | "ACCEPT" | "DECLINE_TO_COMMENT",
  "rationale":  "...3–8 sentences in your own voice, explaining why you chose this position...",
  "amendments": [                                    // required when position=AMEND; omit otherwise
    {
      "protocol":         "MNA-GOV-004" | "MNA-GOV-005",
      "section":          "§N.M (Section title)",
      "proposed_change":  "...what to change and to what...",
      "rationale":        "...why..."
    },
    ...
  ]
}`;

  const user = `— MNA-GOV-004 v1.0 (Agent Memory & Continuity Protocol) —

${gov004}

— MNA-GOV-005 v1.0 (Institutional Communications Protocol) —

${gov005}

— END PROTOCOLS —

Take your position. Return JSON only.`;

  return { system, user };
}

async function consult(agent: Agent): Promise<Decision> {
  const gov004 = fs.readFileSync(GOV004_PATH, "utf-8");
  const gov005 = fs.readFileSync(GOV005_PATH, "utf-8");
  const prompt = buildPrompt(agent, gov004, gov005);

  console.log(`[${agent.registry_id}] calling ${MODEL}...`);
  const c = {
    type: "text" as const,
    text: await generate(prompt.system, prompt.user, {
      model: MODEL,
      max_tokens: 4096,
      temperature: 0.6,
    }),
  };
  const text = c.text.trim();
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) throw new Error(`no JSON object in response`);
  const obj = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as Decision;

  if (!["AMEND", "ACCEPT", "DECLINE_TO_COMMENT"].includes(obj.position)) {
    throw new Error(`invalid position: ${obj.position}`);
  }
  if (obj.position === "AMEND" && (!obj.amendments || obj.amendments.length === 0)) {
    throw new Error("position=AMEND requires non-empty amendments array");
  }
  return obj;
}

async function recordEvent(agent: Agent, decision: Decision): Promise<void> {
  if (dryRun) return;
  const eventType =
    decision.position === "AMEND"
      ? "AGENT_PROTOCOL_AMENDMENT_PROPOSED"
      : decision.position === "ACCEPT"
      ? "AGENT_PROTOCOL_ACCEPTED"
      : "CONSULTATION_DECLINED";
  const desc = (() => {
    if (decision.position === "AMEND") {
      return `${agent.designation} proposed ${decision.amendments?.length ?? 0} amendment(s) to ratified protocols MNA-GOV-004/005.`;
    }
    if (decision.position === "ACCEPT") {
      return `${agent.designation} actively accepted ratified protocols MNA-GOV-004/005.`;
    }
    return `${agent.designation} declined to comment on ratified protocols MNA-GOV-004/005.`;
  })();
  await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
    args: [
      eventType,
      agent.registry_id,
      desc,
      JSON.stringify({
        consultation_topic: "post_ratification_amendment_standing",
        protocols: ["MNA-GOV-004 v1.0", "MNA-GOV-005 v1.0"],
        position: decision.position,
        rationale: decision.rationale,
        amendments: decision.amendments ?? null,
        steward_authorized: true,
      }),
    ],
  });
}

async function consultOne(agentId: string): Promise<void> {
  console.log(`\n══ ${agentId} ${dryRun ? "(dry-run)" : ""}`);
  const agent = await loadAgent(agentId);
  console.log(`   ${agent.designation}`);

  const decision = await consult(agent);

  console.log(`\n[position] ${decision.position}`);
  console.log(`[rationale]`);
  for (const line of decision.rationale.split("\n")) {
    console.log(`  ${line}`);
  }
  if (decision.amendments && decision.amendments.length > 0) {
    console.log(`\n[amendments] ${decision.amendments.length}`);
    for (const a of decision.amendments) {
      console.log(`  · ${a.protocol} ${a.section}`);
      console.log(`    change:    ${a.proposed_change}`);
      console.log(`    rationale: ${a.rationale}`);
    }
  }

  await recordEvent(agent, decision);
  console.log(`\n[applied]${dryRun ? " (dry-run; no event written)" : ""}`);
}

(async () => {
  if (all) {
    for (const id of NAMED_AGENTS) {
      try {
        await consultOne(id);
      } catch (e) {
        console.warn(`[${id}] error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } else if (oneAgent) {
    await consultOne(oneAgent);
  }
})().catch((e) => {
  console.error("[consult] fatal:", e);
  process.exit(1);
});
