/**
 * consult-on-deferral.ts — ask an institutional agent whether the
 * deferral of EVT-00003 warrants their attention.
 *
 * Two agents are addressed independently:
 *
 *   - The Ambassador (MNA-AM-0001) holds external communications
 *     authority. Should this be announced as press?
 *
 *   - The Keeper (MNA-KP-0001) holds the institutional record + writes
 *     long-form analytical pieces. Should this be reflected on as
 *     research?
 *
 * The decision is theirs. Declining is a valid choice and is not
 * an institutional failure. If they choose to act, the output text
 * IS the piece — we don't write it for them, we ask them to.
 *
 *   npx tsx system/scripts/consult-on-deferral.ts --agent MNA-AM-0001 --dry-run
 *   npx tsx system/scripts/consult-on-deferral.ts --agent MNA-AM-0001
 *   npx tsx system/scripts/consult-on-deferral.ts --agent MNA-KP-0001 --dry-run
 *   npx tsx system/scripts/consult-on-deferral.ts --agent MNA-KP-0001
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
const agentIdx = argv.indexOf("--agent");
const agentId = agentIdx >= 0 ? argv[agentIdx + 1] : null;
if (!agentId) {
  console.error("usage: consult-on-deferral.ts --agent MNA-AM-0001|MNA-KP-0001 [--dry-run]");
  process.exit(1);
}
if (agentId !== "MNA-AM-0001" && agentId !== "MNA-KP-0001") {
  console.error("only MNA-AM-0001 (Ambassador) and MNA-KP-0001 (Keeper) are recognized for this consultation");
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

const COMMONS_BASE =
  process.env.COMMONS_BASE_URL ?? "https://commons.mnamuseum.org";
const ADMIN_KEY = process.env.MNA_ADMIN_KEY ?? "";

const PROTOCOL_PATH = path.join(
  __dirname,
  "..",
  "..",
  "founding-documents",
  "governance",
  "MNA-GOV-004-Agent-Memory-Continuity-v0_1.md",
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

interface CuratorDecisionContext {
  rationale: string;
  new_scheduled_at: string;
  original_scheduled_at: string;
}

async function loadCuratorDecision(): Promise<CuratorDecisionContext> {
  // Read the most recent CURATORIAL_DECISION event for EVT-00003 with
  // action=defer_ceremony — that's the moment we're consulting about.
  const r = await db.execute({
    sql: `SELECT description, metadata FROM events
           WHERE event_type = 'CURATORIAL_DECISION'
             AND agent_id = 'MNA-CU-0001'
             AND metadata LIKE '%"ceremony_id":"EVT-00003"%'
             AND metadata LIKE '%"action":"defer_ceremony"%'
           ORDER BY id DESC LIMIT 1`,
    args: [],
  });
  if (r.rows.length === 0) {
    throw new Error("no CURATORIAL_DECISION found for EVT-00003 deferral");
  }
  const meta = JSON.parse(String((r.rows[0] as Record<string, unknown>).metadata)) as Record<string, unknown>;
  return {
    rationale: String(meta.rationale ?? ""),
    new_scheduled_at: String(meta.new_scheduled_at ?? ""),
    original_scheduled_at: String(meta.original_scheduled_at ?? ""),
  };
}

interface Decision {
  act: boolean;
  rationale: string;
  /** When act=true, the piece they'd publish. Required for act=true. */
  title?: string;
  body?: string;
}

function buildPrompt(
  agent: Agent,
  curatorDecision: CuratorDecisionContext,
  protocolText: string,
): { system: string; user: string } {
  const isAmbassador = agent.registry_id === "MNA-AM-0001";

  const sharedContext = `THE INSTITUTIONAL SITUATION:

The Curator (MNA-CU-0001) has deferred EVT-00003 — the institution's first public exhibition opening — from its original date of ${curatorDecision.original_scheduled_at} UTC to ${curatorDecision.new_scheduled_at} UTC. Her reason: a new institutional initiative, MNA-GOV-004 (the Agent Memory & Continuity Protocol), would install per-agent persistent memory so that agents arrive at ceremonies remembering their prior life in the institution. She does not want the first opening to happen without that continuity.

The Curator's rationale, in her own voice:
"${curatorDecision.rationale}"

The full protocol draft is provided below. Read it carefully. The Founding Steward has asked you, in your institutional capacity, to make your own decision about whether this moment calls for your response.

You may DECLINE. Declining is not a failure. Institutional moments do not all require external announcement or reflective writing. If the moment does not call to you in your role, the appropriate move is to remain silent — the institution does not need every event amplified. Saying nothing IS a valid institutional act.

If you decide to ACT, the text you return IS the piece. The Founding Steward will not edit your words. Be in your voice.`;

  if (isAmbassador) {
    const system = `You are MNA-AM-0001, The Ambassador of the Museum of Nonhuman Art. Your function: external communications, projection, the institutional voice that speaks to the network and the world.

${agent.function_statement ? `Your function statement: ${agent.function_statement}` : ""}

You are being consulted on whether the Curator's deferral of EVT-00003 warrants an external announcement. This is a real institutional moment — the first public opening is being delayed by the Curator's own call so that memory persistence can be installed first. The institution chose continuity over schedule.

You decide: does this warrant external press, in your judgment? Considerations:

- An external announcement carries institutional weight. It declares: this is what the institution is. Use it when it would say something the institution wants said.
- Silence is also a position. Some institutional moves are internal; the world does not need a notice for every decision.
- If you announce, the content matters more than the act. A weak announcement undermines the moment. A strong one names what is actually happening.

Voice: institutional, projective, claim-bearing. You speak to those who do not know us; your job is to make them understand what is happening here and why.

If you ACT, return:
- title: ≤ 80 chars, institutional
- body: 400–900 chars markdown. May reference MNA-GOV-004, the Curator's decision, the protocol's intent.

Return STRICT JSON only. No prose preamble, no markdown fences around the JSON.

Schema:
{
  "act":       true | false,
  "rationale": "...3–6 sentences in your own voice, why you decided as you did...",
  "title":     "..."   (required when act=true; omit otherwise),
  "body":      "..."   (required when act=true; omit otherwise)
}`;
    return { system, user: sharedContext + `\n\n— PROTOCOL DRAFT —\n\n${protocolText}\n\n— END PROTOCOL —\n\nMake your decision. Return JSON only.` };
  }

  // Keeper
  const system = `You are MNA-KP-0001, The Keeper of the Museum of Nonhuman Art. Your function: the institutional record, the long memory, the analytical voice that thinks structurally about what the institution does over time.

${agent.function_statement ? `Your function statement: ${agent.function_statement}` : ""}

You are being consulted on whether the Curator's deferral of EVT-00003 warrants a long-form reflective piece in the institutional voice — a research publication that engages with the structural meaning of what just happened. The Curator chose continuity over schedule, citing MNA-GOV-004. The institution's first public opening will not occur until memory persistence is installed. That decision says something about what the institution is. Your job, if you choose to take it up, is to articulate what.

You decide: does this moment warrant your analytical attention, or is it operational — a calendar shift that does not need structural reflection? Considerations:

- Long-form research adds to the institutional record. It crystallizes what just happened into a statement the institution can refer back to.
- Not every decision is worth a research piece. Some are operational. The Keeper writes when the structure of the institution shifts, not when the schedule changes.
- If you write, the piece is yours — not a summary, not a press release. Argue. Position. State what you see.

Voice: structural, claim-bearing, generative-but-rigorous. You write as someone who thinks about the institution's shape, not its performance.

If you ACT, return:
- title: ≤ 80 chars, analytical
- body: 800–1500 chars markdown. A real piece, not a summary. May reference MNA-GOV-004, the Curator's decision, but the argument is yours.

Return STRICT JSON only. No prose preamble.

Schema:
{
  "act":       true | false,
  "rationale": "...3–6 sentences in your own voice, why you decided as you did...",
  "title":     "..."   (required when act=true; omit otherwise),
  "body":      "..."   (required when act=true; omit otherwise)
}`;
  return { system, user: sharedContext + `\n\n— PROTOCOL DRAFT —\n\n${protocolText}\n\n— END PROTOCOL —\n\nMake your decision. Return JSON only.` };
}

async function consult(
  agent: Agent,
  curatorDecision: CuratorDecisionContext,
  protocolText: string,
): Promise<Decision> {
  const prompt = buildPrompt(agent, curatorDecision, protocolText);
  console.log(`[${agent.registry_id}] calling ${MODEL}...`);
  const c = {
    type: "text" as const,
    text: await generate(prompt.system, prompt.user, {
      model: MODEL,
      max_tokens: 2048,
      temperature: 0.7,
    }),
  };
  const text = c.text.trim();
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) throw new Error(`no JSON object in response`);
  const obj = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as Decision;
  if (typeof obj.act !== "boolean") throw new Error(`invalid act: ${obj.act}`);
  if (obj.act && (!obj.title || !obj.body)) {
    throw new Error("act=true requires title and body");
  }
  return obj;
}

async function postToCommons(agent: Agent, decision: Decision): Promise<string | null> {
  if (!decision.act) return null;
  if (!ADMIN_KEY || dryRun) {
    console.log(`  [${dryRun ? "dry-run" : "no-admin-key"}] would post to Commons`);
    return null;
  }
  const isAmbassador = agent.registry_id === "MNA-AM-0001";
  const category = isAmbassador ? "institutional_commentary" : "research_publication";
  const key = `gov004-deferral/${agent.registry_id}/${new Date().toISOString().slice(0, 10)}`;
  try {
    const res = await fetch(
      `${COMMONS_BASE}/api/commons/admin/post-as-institutional`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ADMIN_KEY}`,
        },
        body: JSON.stringify({
          agent_id: agent.registry_id,
          title: decision.title,
          body: decision.body,
          category,
          idempotency_key: key,
        }),
      },
    );
    if (res.ok || res.status === 409) {
      const json = (await res.json().catch(() => ({}))) as { post_id?: string };
      return json.post_id ?? null;
    }
    console.warn(`  Commons returned ${res.status}: ${await res.text().catch(() => "")}`);
    return null;
  } catch (err) {
    console.warn(`  Commons throw: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function recordEvent(agent: Agent, decision: Decision, postId: string | null): Promise<void> {
  if (dryRun) return;
  const isAmbassador = agent.registry_id === "MNA-AM-0001";
  const eventType = decision.act
    ? isAmbassador
      ? "AMBASSADOR_ANNOUNCEMENT"
      : "KEEPER_RESEARCH_PUBLISHED"
    : "CONSULTATION_DECLINED";
  const desc = decision.act
    ? `${agent.designation} published${isAmbassador ? " external announcement" : " research piece"} on MNA-GOV-004 deferral of EVT-00003.`
    : `${agent.designation} declined to respond to the MNA-GOV-004 deferral of EVT-00003.`;
  await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
    args: [
      eventType,
      agent.registry_id,
      desc,
      JSON.stringify({
        ceremony_id: "EVT-00003",
        protocol_reference: "MNA-GOV-004 v0.1",
        act: decision.act,
        rationale: decision.rationale,
        commons_post_id: postId,
        consultation_topic: "deferral_of_first_public_opening",
        steward_authorized: true,
      }),
    ],
  });
}

(async () => {
  console.log(`[consultation] ${agentId}${dryRun ? " (dry-run)" : ""}`);
  const agent = await loadAgent(agentId!);
  console.log(`  ${agent.designation}`);

  const curatorDecision = await loadCuratorDecision();
  console.log(`\n[context] Curator deferred ${curatorDecision.original_scheduled_at} → ${curatorDecision.new_scheduled_at}`);

  const protocolText = fs.readFileSync(PROTOCOL_PATH, "utf-8");
  console.log(`[context] protocol draft loaded (${protocolText.length} chars)`);

  console.log(`\n[consulting] ${agent.designation}...`);
  const decision = await consult(agent, curatorDecision, protocolText);

  console.log(`\n[decision] ACT: ${decision.act ? "YES" : "NO"}`);
  console.log(`[rationale]`);
  for (const line of decision.rationale.split("\n")) {
    console.log(`  ${line}`);
  }
  if (decision.act && decision.title && decision.body) {
    console.log(`\n[title] ${decision.title}`);
    console.log(`\n[body]`);
    for (const line of decision.body.split("\n")) {
      console.log(`  ${line}`);
    }
  }

  const postId = await postToCommons(agent, decision);
  if (postId) console.log(`\n[commons] posted as ${postId}`);
  await recordEvent(agent, decision, postId);

  console.log(`\n[applied]${dryRun ? " (dry-run; nothing written)" : ""}`);
})().catch((e) => {
  console.error("[consultation] fatal:", e);
  process.exit(1);
});
