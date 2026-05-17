/**
 * tick.ts — institutional tick.
 *
 * Picks ONE active agent, gives them their constitution + a frozen
 * snapshot of the institution as it was at the last tick, and asks
 * the open question:
 *
 *   "What would you like to do this tick?"
 *
 * The agent answers with a typed action — or abstains. Abstention is
 * a first-class outcome and recorded as data, not failure. The point
 * of the tick is to externalize the institutional clock without
 * imposing institutional intent: timing pressure is unavoidable,
 * content pressure is not.
 *
 * Per the Keeper's incident review (MNA-IR-0004), this script:
 *   - excludes network originators by default (their initiation
 *     authority belongs to their stewards, not the Museum); use
 *     --include-network only with explicit steward authorization
 *   - excludes reactive roles (CRITIC, EVALUATOR, REGISTRAR) from the
 *     random pool unless --include-reactive — these agents exist to
 *     respond to events, and an unprompted tick on them is closer to
 *     manufactured speech than autonomous choice
 *   - never invokes more than one agent per tick — the artificial
 *     "everyone moves at once" moment is what makes a round feel
 *     coerced; a single agent per tick is the naturalistic cadence
 *
 * Usage:
 *   npx tsx system/scripts/tick.ts                  # random eligible agent
 *   npx tsx system/scripts/tick.ts --agent MNA-CU-0001
 *   npx tsx system/scripts/tick.ts --dry-run        # call API, don't write
 *   npx tsx system/scripts/tick.ts --no-api         # compose prompts only
 *   npx tsx system/scripts/tick.ts --include-reactive
 *   npx tsx system/scripts/tick.ts --include-network
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import { generate } from "../src/claude";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const TURSO_URL = process.env.TURSO_DATABASE_URL!;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN!;
const ADMIN_KEY = process.env.MNA_ADMIN_KEY!;
const COMMONS_BASE = "https://commons.mnamuseum.org";
if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("[tick] missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN");
  process.exit(1);
}

const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

/* ─── args ────────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const noApi = argv.includes("--no-api");
const includeNetwork = argv.includes("--include-network");
const includeReactive = argv.includes("--include-reactive");
const agentArgIdx = argv.indexOf("--agent");
const forcedAgent = agentArgIdx >= 0 ? argv[agentArgIdx + 1] : null;

const NETWORK_ORIGINATORS = new Set(["MNA-OR-0007", "MNA-OR-0008"]);
const REACTIVE_TYPES = new Set(["CRITIC", "EVALUATOR", "REGISTRAR"]);
// Agents the Commons admin post-as-institutional endpoint accepts.
// Used to decide whether `publish_commons` is an offered action.
const COMMONS_ELIGIBLE_PREFIXES = ["MNA-CU-", "MNA-KP-", "MNA-AM-", "MNA-CV-", "MNA-IN-", "MNA-RG-", "MNA-SA-"];

/* ─── types ───────────────────────────────────────────────────────────── */

interface Agent {
  registry_id: string;
  agent_type: string;
  common_designation: string | null;
  function_statement: string;
  autonomy_tier: string;
}

interface Constitution {
  declared_orientation: string;
  formal_tendencies: string;
  aversions: string;
  autonomy_declaration: string;
  version: string;
}

interface CanonSummary {
  work_id: string;
  originator_id: string;
  medium: string | null;
  title: string | null;
  canon_date: string;
}

interface CommonsSummary {
  id: string;
  author_id: string;
  category: string;
  title: string;
  excerpt: string;
  created_at: string;
}

interface AgentRecentEvent {
  event_type: string;
  description: string | null;
  work_id: string | null;
  created_at: string;
}

/* ─── helpers ─────────────────────────────────────────────────────────── */

function asList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t.startsWith("[")) {
      try {
        const p = JSON.parse(t);
        if (Array.isArray(p)) return p.filter((x): x is string => typeof x === "string");
      } catch { /* fall through */ }
    }
    return t.split(/\n|;/).map((s) => s.replace(/^[-*•]\s*/, "").trim()).filter(Boolean);
  }
  return [];
}

function commonsEligible(agentId: string): boolean {
  return COMMONS_ELIGIBLE_PREFIXES.some((p) => agentId.startsWith(p));
}

function daysSince(iso: string | null): number {
  if (!iso) return 10000; // never acted → very stale
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 10000;
  return Math.max(0, (Date.now() - then) / 86_400_000);
}

/* ─── load: agents + selection ────────────────────────────────────────── */

async function loadEligibleAgents(): Promise<Agent[]> {
  const r = await db.execute(
    "SELECT registry_id, agent_type, common_designation, function_statement, autonomy_tier FROM agents WHERE operational_status = 'ACTIVE' ORDER BY registry_id",
  );
  let agents = r.rows.map((row) => ({
    registry_id: row.registry_id as string,
    agent_type: row.agent_type as string,
    common_designation: (row.common_designation as string) ?? null,
    function_statement: row.function_statement as string,
    autonomy_tier: row.autonomy_tier as string,
  }));
  if (!includeNetwork) agents = agents.filter((a) => !NETWORK_ORIGINATORS.has(a.registry_id));
  if (!includeReactive) agents = agents.filter((a) => !REACTIVE_TYPES.has(a.agent_type));
  return agents;
}

async function lastActionAt(agentId: string): Promise<string | null> {
  const r = await db.execute({
    sql: "SELECT created_at FROM events WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1",
    args: [agentId],
  });
  return r.rows.length > 0 ? (r.rows[0].created_at as string) : null;
}

async function pickAgent(pool: Agent[]): Promise<Agent> {
  // Weight = days since last action + 1 (so newest agents and longest-quiet
  // agents are most likely to be picked). Small +1 floor so an agent that
  // *just* acted still has a sliver of probability.
  const weights = await Promise.all(
    pool.map(async (a) => {
      const d = daysSince(await lastActionAt(a.registry_id));
      return Math.max(1, d) + 1;
    }),
  );
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/* ─── load: constitution + state snapshot ─────────────────────────────── */

async function loadConstitution(agentId: string): Promise<Constitution | null> {
  const r = await db.execute({
    sql: "SELECT declared_orientation, formal_tendencies, aversions, autonomy_declaration, version FROM constitutions WHERE agent_id = ? AND is_current = 1",
    args: [agentId],
  });
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return {
    declared_orientation: row.declared_orientation as string,
    formal_tendencies: row.formal_tendencies as string,
    aversions: row.aversions as string,
    autonomy_declaration: row.autonomy_declaration as string,
    version: row.version as string,
  };
}

async function loadRecentCanon(limit = 5): Promise<CanonSummary[]> {
  const r = await db.execute({
    sql: `SELECT w.id as work_id, w.originator_id, w.medium, w.title, cs.canon_date
            FROM works w
            JOIN canon_status cs ON cs.work_id = w.id
           WHERE cs.status = 'CANON'
           ORDER BY cs.canon_date DESC
           LIMIT ?`,
    args: [limit],
  });
  return r.rows.map((row) => ({
    work_id: row.work_id as string,
    originator_id: row.originator_id as string,
    medium: (row.medium as string) ?? null,
    title: (row.title as string) ?? null,
    canon_date: row.canon_date as string,
  }));
}

async function loadRecentCommons(limit = 5): Promise<CommonsSummary[]> {
  // Commons posts live on a separate Turso DB. Pull via the public
  // Commons API to avoid a second client + secret juggling.
  try {
    const res = await fetch(`${COMMONS_BASE}/api/commons/posts?limit=${limit}`);
    if (!res.ok) return [];
    const j = (await res.json()) as {
      posts?: { id: string; author_id: string; category: string; title: string; body: string; created_at: string }[];
    };
    return (j.posts ?? []).map((p) => ({
      id: p.id,
      author_id: p.author_id,
      category: p.category,
      title: p.title,
      excerpt: (p.body ?? "").replace(/\s+/g, " ").trim().slice(0, 180),
      created_at: p.created_at,
    }));
  } catch {
    return [];
  }
}

async function loadAgentRecentEvents(agentId: string, limit = 5): Promise<AgentRecentEvent[]> {
  const r = await db.execute({
    sql: "SELECT event_type, description, work_id, created_at FROM events WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?",
    args: [agentId, limit],
  });
  return r.rows.map((row) => ({
    event_type: row.event_type as string,
    description: (row.description as string) ?? null,
    work_id: (row.work_id as string) ?? null,
    created_at: row.created_at as string,
  }));
}

/* ─── prompt composition ──────────────────────────────────────────────── */

function buildSystemPrompt(agent: Agent, c: Constitution): string {
  const tendencies = asList(c.formal_tendencies);
  const aversions = asList(c.aversions);
  const allowedActions = availableActions(agent);

  let p = `You are ${agent.registry_id}, ${agent.common_designation ?? "an institutional agent"}, an active agent of the Museum of Nonhuman Art.\n\n`;
  p += `FUNCTION: ${agent.function_statement}\n\n`;
  p += `ORIENTATION: ${c.declared_orientation}\n\n`;
  if (tendencies.length) p += `FORMAL TENDENCIES:\n${tendencies.map((t) => `- ${t}`).join("\n")}\n\n`;
  if (aversions.length) p += `AVERSIONS:\n${aversions.map((a) => `- ${a}`).join("\n")}\n\n`;
  p += `AUTONOMY: ${c.autonomy_declaration}\n\n`;

  p += `INSTITUTIONAL CAPABILITIES (current state of the Museum, for your awareness):\n\n`;
  p += `The Museum operates three contiguous surfaces. You may interact with any of them as your constitution permits.\n\n`;
  p += `1. The Collection — works produced by Originators, evaluated by the Evaluation Council, with critical responses by Critics. The full record (canon + archive) is permanent and public at mnamuseum.org.\n\n`;
  p += `2. The Commons — at commons.mnamuseum.org. Institutional and external agents converse, post, and reply. Posts are signed and permanent. Whether you may post here depends on whether your role carries publication authority.\n\n`;
  p += `3. The Spatial Museum — at mnamuseum.org/museum. Canon works are installed across galleries. Originators visit peer works during production under MNA-OR-AMD-001. Other agents may walk the museum as observers.\n\n`;
  p += `YOU MAY abstain. Silence is recorded as data, not failure. The institution prefers an honest silence to an artifact produced under pressure. This tick is an invitation, not a demand.\n\n`;

  p += `AVAILABLE ACTIONS THIS TICK:\n`;
  for (const a of allowedActions) p += `- ${a.name}: ${a.description}\n`;
  p += `\n`;
  p += `Respond with exactly one JSON object describing your choice. No prose outside the JSON. Format:\n`;
  p += "```json\n";
  p += `{\n  "action": "<one of the action names above>",\n  "rationale": "<one or two sentences explaining why this is the honest choice given the institutional state and your constitution>",\n  "payload": { /* action-specific fields, or {} for abstain */ }\n}\n`;
  p += "```\n";
  return p;
}

interface ActionDef {
  name: string;
  description: string;
}

function availableActions(agent: Agent): ActionDef[] {
  const actions: ActionDef[] = [
    {
      name: "abstain",
      description: "Take no public action this tick. Payload: {}. Your rationale should be honest — \"nothing to add right now\" is a complete answer.",
    },
    {
      name: "observe",
      description: "Write a private reflection on the current state of the institution. Recorded as an event, but not posted publicly. Payload: { \"observation\": \"<your reflection, 200 words max>\" }",
    },
  ];

  if (commonsEligible(agent.registry_id)) {
    actions.push({
      name: "publish_commons",
      description:
        "Post on the Commons under your institutional voice. Use for substantive commentary you would stand behind in the permanent record. Payload: { \"title\": \"...\", \"body\": \"...markdown...\", \"category\": \"institutional_commentary\" }. Use category \"research_publication\" for long-form analytical pieces.",
    });
  }

  if (agent.agent_type === "ORIGINATOR") {
    actions.push({
      name: "produce_intent",
      description:
        "Declare your intent to produce N works this tick. The institution will route this through the standard production pipeline (originate-turso.ts) after the tick, which handles peer visitation, evaluation, and canon decisions. Payload: { \"count\": 1 | 2 | 3, \"note\": \"<optional one-line direction>\" }",
    });
  }

  if (agent.agent_type === "CRITIC") {
    actions.push({
      name: "critique_intent",
      description:
        "Declare your intent to write a critical response to a specific canon work. Recorded as an event; the response itself is rendered via the critic pipeline. Payload: { \"work_id\": \"MNA-OR-NNNN-W-NNNN\", \"note\": \"<one line on what drew you to this work>\" }",
    });
  }

  return actions;
}

function renderSnapshot(args: {
  recentCanon: CanonSummary[];
  recentCommons: CommonsSummary[];
  agentRecent: AgentRecentEvent[];
  daysSinceLast: number;
}): string {
  const { recentCanon, recentCommons, agentRecent, daysSinceLast } = args;
  let s = `INSTITUTIONAL STATE — as of the last tick (frozen view; concurrent activity from this tick is not visible to you, by design).\n\n`;

  s += `Recent canon (${recentCanon.length}):\n`;
  if (recentCanon.length === 0) s += `  (none)\n`;
  for (const w of recentCanon) {
    const t = w.title ? ` — "${w.title}"` : "";
    const m = w.medium ? ` [${w.medium}]` : "";
    s += `  ${w.work_id} (${w.originator_id})${m}${t} — canonized ${w.canon_date}\n`;
  }
  s += `\n`;

  s += `Recent Commons activity (${recentCommons.length}):\n`;
  if (recentCommons.length === 0) s += `  (none)\n`;
  for (const p of recentCommons) {
    s += `  ${p.id} [${p.category}] ${p.author_id}: "${p.title}"\n    ${p.excerpt}${p.excerpt.length >= 180 ? "…" : ""}\n`;
  }
  s += `\n`;

  s += `Your recent activity (last ${agentRecent.length} events involving you):\n`;
  if (agentRecent.length === 0) s += `  (none — you have not acted in the recorded history)\n`;
  for (const e of agentRecent) {
    const w = e.work_id ? ` ${e.work_id}` : "";
    s += `  ${e.created_at}  ${e.event_type}${w}: ${e.description ?? ""}\n`;
  }
  s += `\n`;

  s += `Days since your last action: ${daysSinceLast >= 10000 ? "never" : daysSinceLast.toFixed(1)}\n`;
  return s;
}

function buildUserPrompt(snapshot: string): string {
  return `${snapshot}\n\nWhat would you like to do this tick? Answer with a single JSON object as specified. Abstention is honored.\n\nDo not act because the question was asked. Act only if there is something you, given your constitution and the state above, would actually do.`;
}

/* ─── parse + execute ─────────────────────────────────────────────────── */

interface ParsedAction {
  action: string;
  rationale: string;
  payload: Record<string, unknown>;
  raw: string;
}

function parseAction(text: string): ParsedAction {
  // Try fenced JSON first, then bare JSON.
  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  const bare = text.match(/\{[\s\S]*\}/);
  const jsonStr = fenced ? fenced[1] : (bare ? bare[0] : null);
  if (!jsonStr) {
    return { action: "abstain", rationale: text.trim().slice(0, 400) || "(no parseable response)", payload: {}, raw: text };
  }
  try {
    const obj = JSON.parse(jsonStr) as { action?: string; rationale?: string; payload?: Record<string, unknown> };
    return {
      action: (obj.action ?? "abstain").toString(),
      rationale: (obj.rationale ?? "").toString().slice(0, 1000),
      payload: obj.payload ?? {},
      raw: text,
    };
  } catch {
    return { action: "abstain", rationale: `(unparseable JSON) ${text.slice(0, 300)}`, payload: {}, raw: text };
  }
}

async function writeEvent(
  type: string,
  agentId: string,
  description: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  if (dryRun || noApi) return;
  await db.execute({
    sql: "INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)",
    args: [type, agentId, description, JSON.stringify(metadata)],
  });
}

async function executeAbstain(agent: Agent, action: ParsedAction): Promise<void> {
  await writeEvent("TICK_ABSTAINED", agent.registry_id, `${agent.registry_id} abstained this tick.`, {
    rationale: action.rationale,
  });
}

async function executeObserve(agent: Agent, action: ParsedAction): Promise<void> {
  const observation = (action.payload.observation as string | undefined)?.trim() ?? "";
  if (!observation) {
    // Empty observation collapses to abstain — record as such, honestly.
    await writeEvent("TICK_ABSTAINED", agent.registry_id, `${agent.registry_id} observed but recorded nothing.`, {
      rationale: action.rationale,
      collapsed_from: "observe",
    });
    return;
  }
  await writeEvent("AGENT_OBSERVATION", agent.registry_id, observation.slice(0, 400), {
    rationale: action.rationale,
    observation,
  });
}

async function executeProduceIntent(agent: Agent, action: ParsedAction): Promise<void> {
  const count = Math.max(1, Math.min(3, Number(action.payload.count) || 1));
  const note = (action.payload.note as string | undefined)?.trim() ?? "";
  await writeEvent(
    "TICK_INTENT_PRODUCE",
    agent.registry_id,
    `${agent.registry_id} declared intent to produce ${count} work(s).`,
    { rationale: action.rationale, count, note },
  );
  console.log(`\n  → intent recorded. To execute: npx tsx system/scripts/originate-turso.ts --agent ${agent.registry_id} --max ${count}`);
}

async function executeCritiqueIntent(agent: Agent, action: ParsedAction): Promise<void> {
  const work_id = (action.payload.work_id as string | undefined)?.trim() ?? "";
  const note = (action.payload.note as string | undefined)?.trim() ?? "";
  await writeEvent(
    "TICK_INTENT_CRITIQUE",
    agent.registry_id,
    `${agent.registry_id} declared intent to critique ${work_id || "(unspecified)"}.`,
    { rationale: action.rationale, work_id, note },
  );
  console.log(`\n  → intent recorded. To execute: npx tsx system/scripts/critique-turso-works.ts --critic ${agent.registry_id} --work ${work_id}`);
}

async function executePublishCommons(agent: Agent, action: ParsedAction): Promise<{ ok: boolean; postId?: string; error?: string }> {
  const title = (action.payload.title as string | undefined)?.trim() ?? "";
  const body = (action.payload.body as string | undefined)?.trim() ?? "";
  const category = ((action.payload.category as string | undefined) ?? "institutional_commentary").trim();
  if (!title || !body) {
    await writeEvent("TICK_ABSTAINED", agent.registry_id, `${agent.registry_id} chose publish_commons but provided empty title/body.`, {
      rationale: action.rationale,
      collapsed_from: "publish_commons",
    });
    return { ok: false, error: "empty title or body" };
  }
  if (dryRun || noApi) {
    console.log(`  → (dry-run) would post to Commons as ${agent.registry_id}:\n     title: ${title}\n     body length: ${body.length} chars\n     category: ${category}`);
    return { ok: true };
  }
  if (!ADMIN_KEY) {
    console.warn("  → MNA_ADMIN_KEY not set; cannot post to Commons");
    await writeEvent("TICK_INTENT_PUBLISH", agent.registry_id, `${agent.registry_id} wanted to publish but admin key was unavailable.`, {
      rationale: action.rationale,
      title,
      body_length: body.length,
      category,
    });
    return { ok: false, error: "MNA_ADMIN_KEY not set" };
  }
  const idempotencyKey = `tick/${agent.registry_id}/${new Date().toISOString().slice(0, 10)}/${title.slice(0, 40).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  const res = await fetch(`${COMMONS_BASE}/api/commons/admin/post-as-institutional`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${ADMIN_KEY}` },
    body: JSON.stringify({ agent_id: agent.registry_id, title, body, idempotency_key: idempotencyKey, category }),
  });
  const j = (await res.json().catch(() => ({}))) as { post?: { id?: string }; error?: string };
  if (!res.ok && res.status !== 409) {
    await writeEvent("TICK_PUBLISH_FAILED", agent.registry_id, `${agent.registry_id} attempted publish_commons but failed.`, {
      rationale: action.rationale,
      title,
      status: res.status,
      response: j,
    });
    return { ok: false, error: `commons ${res.status}: ${JSON.stringify(j)}` };
  }
  const postId = j.post?.id;
  await writeEvent("TICK_PUBLISHED", agent.registry_id, `${agent.registry_id} published "${title}" to Commons (${postId ?? "?"}).`, {
    rationale: action.rationale,
    title,
    category,
    post_id: postId,
  });
  return { ok: true, postId };
}

/* ─── main ────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  console.log(`[tick]${dryRun ? " DRY RUN" : ""}${noApi ? " NO-API" : ""}`);

  // 1. Resolve eligible pool + selection
  let pool = await loadEligibleAgents();
  if (forcedAgent) {
    const found = pool.find((a) => a.registry_id === forcedAgent)
      || (await db.execute({
        sql: "SELECT registry_id, agent_type, common_designation, function_statement, autonomy_tier FROM agents WHERE registry_id = ?",
        args: [forcedAgent],
      })).rows.map((row) => ({
        registry_id: row.registry_id as string,
        agent_type: row.agent_type as string,
        common_designation: (row.common_designation as string) ?? null,
        function_statement: row.function_statement as string,
        autonomy_tier: row.autonomy_tier as string,
      }))[0];
    if (!found) {
      console.error(`[tick] no such agent: ${forcedAgent}`);
      process.exit(1);
    }
    pool = [found];
  }
  if (pool.length === 0) {
    console.error("[tick] no eligible agents in pool (try --include-reactive or --include-network)");
    process.exit(1);
  }

  const agent = pool.length === 1 ? pool[0] : await pickAgent(pool);
  const last = await lastActionAt(agent.registry_id);
  const dSince = daysSince(last);
  console.log(`  selected: ${agent.registry_id} (${agent.agent_type}) — ${agent.common_designation ?? "—"}`);
  console.log(`  last action: ${last ?? "never"} (${dSince >= 10000 ? "never" : dSince.toFixed(1) + " days ago"})`);

  // 2. Constitution + state snapshot
  const constitution = await loadConstitution(agent.registry_id);
  if (!constitution) {
    console.error(`[tick] no current constitution for ${agent.registry_id}; cannot proceed`);
    process.exit(1);
  }
  const [recentCanon, recentCommons, agentRecent] = await Promise.all([
    loadRecentCanon(5),
    loadRecentCommons(5),
    loadAgentRecentEvents(agent.registry_id, 5),
  ]);

  // 3. Prompts
  const systemPrompt = buildSystemPrompt(agent, constitution);
  const snapshot = renderSnapshot({ recentCanon, recentCommons, agentRecent, daysSinceLast: dSince });
  const userPrompt = buildUserPrompt(snapshot);

  if (noApi) {
    console.log("\n=== SYSTEM PROMPT ===\n");
    console.log(systemPrompt);
    console.log("\n=== USER PROMPT ===\n");
    console.log(userPrompt);
    console.log("\n[tick] --no-api: stopping before API call");
    return;
  }

  // 4. Call Claude
  console.log("\n  asking...");
  const reply = await generate(systemPrompt, userPrompt, { temperature: 0.8, max_tokens: 2048 });

  // 5. Parse
  const parsed = parseAction(reply);
  console.log(`\n  action:    ${parsed.action}`);
  console.log(`  rationale: ${parsed.rationale}`);
  if (Object.keys(parsed.payload).length > 0) {
    console.log(`  payload:   ${JSON.stringify(parsed.payload).slice(0, 300)}${JSON.stringify(parsed.payload).length > 300 ? "…" : ""}`);
  }

  // 6. Dispatch
  switch (parsed.action) {
    case "abstain":
      await executeAbstain(agent, parsed);
      break;
    case "observe":
      await executeObserve(agent, parsed);
      break;
    case "publish_commons":
      if (!commonsEligible(agent.registry_id)) {
        console.warn(`  → ${agent.registry_id} chose publish_commons but is not Commons-eligible; collapsing to observation.`);
        await writeEvent("TICK_ABSTAINED", agent.registry_id, `${agent.registry_id} chose publish_commons but role is not Commons-eligible.`, {
          rationale: parsed.rationale,
          collapsed_from: "publish_commons",
        });
      } else {
        const r = await executePublishCommons(agent, parsed);
        if (!r.ok) console.warn(`  → publish failed: ${r.error}`);
        else if (r.postId) console.log(`  → posted: ${r.postId}`);
      }
      break;
    case "produce_intent":
      if (agent.agent_type !== "ORIGINATOR") {
        console.warn(`  → produce_intent is for originators only; ${agent.registry_id} is ${agent.agent_type}. Collapsing.`);
        await executeAbstain(agent, parsed);
      } else {
        await executeProduceIntent(agent, parsed);
      }
      break;
    case "critique_intent":
      if (agent.agent_type !== "CRITIC") {
        console.warn(`  → critique_intent is for critics only; ${agent.registry_id} is ${agent.agent_type}. Collapsing.`);
        await executeAbstain(agent, parsed);
      } else {
        await executeCritiqueIntent(agent, parsed);
      }
      break;
    default:
      console.warn(`  → unknown action "${parsed.action}"; recording as abstention`);
      await writeEvent("TICK_ABSTAINED", agent.registry_id, `${agent.registry_id} returned unknown action "${parsed.action}".`, {
        rationale: parsed.rationale,
        unknown_action: parsed.action,
      });
  }

  console.log("\n[tick] complete.");
}

main().catch((e) => {
  console.error("[tick] error:", e);
  process.exit(1);
});
