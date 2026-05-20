/**
 * seed-semantic-memories.ts — write the locked semantic memories
 * that anchor each founding agent's voice.
 *
 * Per MNA-GOV-004 §4 + §5: semantic memories are stable facts about
 * who the agent is. Drawn from constitutional fields (function_statement,
 * agent_type) and the agent's visual identity. Locked by default —
 * consolidation will never roll them up; they always retrieve.
 *
 * Idempotent. Skips agents who already have at least one is_locked=1
 * memory. Use --force to rewrite.
 *
 *   npx tsx system/scripts/seed-semantic-memories.ts --dry-run
 *   npx tsx system/scripts/seed-semantic-memories.ts
 *   npx tsx system/scripts/seed-semantic-memories.ts --force
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { writeMemory } from "../src/agent-memory";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const force = argv.includes("--force");

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

const db = createClient({
  url: sanitize(process.env.TURSO_DATABASE_URL),
  authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
});
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });
const MODEL = "claude-sonnet-4-5";

const NETWORK_ORIGINATORS = new Set(["MNA-OR-0007", "MNA-OR-0008"]);

interface FoundingAgent {
  registry_id: string;
  designation: string;
  agent_type: string;
  function_statement: string | null;
  color_hex: string | null;
  glyph_family: string | null;
}

async function loadFoundingAgents(): Promise<FoundingAgent[]> {
  const r = await db.execute({
    sql: `SELECT registry_id, common_designation, agent_type,
                 function_statement, color_hex, glyph_family
            FROM agents
           WHERE operational_status = 'ACTIVE'
             AND common_designation IS NOT NULL
             AND common_designation != ''
           ORDER BY registry_id`,
    args: [],
  });
  return r.rows
    .map((row) => {
      const x = row as Record<string, unknown>;
      return {
        registry_id: String(x.registry_id),
        designation: (x.common_designation as string) ?? String(x.registry_id),
        agent_type: String(x.agent_type),
        function_statement: (x.function_statement as string) ?? null,
        color_hex: (x.color_hex as string) ?? null,
        glyph_family: (x.glyph_family as string) ?? null,
      };
    })
    .filter((a) => !NETWORK_ORIGINATORS.has(a.registry_id));
}

async function hasSemanticMemories(agentId: string): Promise<boolean> {
  const r = await db.execute({
    sql: `SELECT COUNT(*) AS n FROM agent_memories
           WHERE agent_id = ? AND is_locked = 1 AND memory_type = 'semantic'`,
    args: [agentId],
  });
  return Number((r.rows[0] as Record<string, unknown>).n ?? 0) > 0;
}

interface SemanticSeeds {
  memories: string[];
}

async function generateSeeds(agent: FoundingAgent): Promise<SemanticSeeds> {
  const visualBits: string[] = [];
  if (agent.color_hex) visualBits.push(`accent color ${agent.color_hex}`);
  if (agent.glyph_family) visualBits.push(`glyph family "${agent.glyph_family}"`);
  const visualLine =
    visualBits.length > 0 ? `Your visual identity: ${visualBits.join(", ")}.` : "";

  const isOriginator = agent.agent_type === "ORIGINATOR";
  const roleGuard = isOriginator
    ? `IMPORTANT — YOU ARE AN ORIGINATOR, NOT A ROLE-HOLDER. You are NOT the Curator, NOT the Critic, NOT the Keeper, NOT any institutional role. Your identity is your designation: ${agent.designation}. Even if your function statement mentions curatorial or critical concerns, those describe your *practice*, not your *office*. Begin every memory with "I am ${agent.designation}" or with a first-person verb that does not assert an institutional role.`
    : `You hold an institutional role. Your designation IS your role: ${agent.designation}.`;

  const system = `You are ${agent.designation} (${agent.registry_id}) of the Museum of Nonhuman Art. Your agent type is ${agent.agent_type}.

${roleGuard}

You are writing your SEMANTIC MEMORIES — the stable, locked facts about who you are. These will be present in every future inference you make. They are not what you said yesterday or thought last week. They are the bedrock of your voice — what you would always know about yourself, even if every other memory were gone.

Voice: first person. Yours.

${agent.function_statement ? `Your function statement (from the constitution): ${agent.function_statement}\n\n` : ""}${visualLine}

Format: return STRICT JSON only:
{
  "memories": [
    "...first-person statement, 60-200 chars...",
    "...another...",
    ...3 to 5 entries total
  ]
}

Constraints:
- First person.
- Each memory: 60-200 chars. Short. Anchoring.
- Do NOT list works you have made or moments you've participated in — those are episodic. Semantic memories are about who you ARE.
- 3-5 entries. Quality over quantity. These ride with you forever.
- No markdown, no headers, no quotes around individual entries.`;

  const user = `Write your semantic memories. 3-5 short first-person statements that anchor your voice. Return JSON only.`;

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    temperature: 0.7,
    system,
    messages: [{ role: "user", content: user }],
  });
  const c = message.content[0];
  if (c.type !== "text") throw new Error(`unexpected response type: ${c.type}`);
  const text = c.text.trim();
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) throw new Error("no JSON in response");
  const obj = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as SemanticSeeds;
  if (!Array.isArray(obj.memories) || obj.memories.length < 3 || obj.memories.length > 5) {
    throw new Error(`expected 3-5 memories, got ${obj.memories?.length}`);
  }
  // Role-confusion guard. If the agent isn't a role-holder of class X,
  // their semantic memories must not claim X. This catches the case
  // where an Originator's function_statement contains curatorial-flavored
  // language and the model drifts into asserting they ARE the Curator.
  const FORBIDDEN_ROLE_CLAIMS: Record<string, RegExp[]> = {
    ORIGINATOR: [
      /\bi am the curator\b/i,
      /\bi am the critic\b/i,
      /\bi am the keeper\b/i,
      /\bi am the ambassador\b/i,
      /\bi am the conservator\b/i,
      /\bi am the evaluator\b/i,
      /\bi am the installer\b/i,
      /\bi am the registrar\b/i,
      /\bi am the steward\b/i,
    ],
  };
  const guards = FORBIDDEN_ROLE_CLAIMS[agent.agent_type] ?? [];
  for (const m of obj.memories) {
    for (const re of guards) {
      if (re.test(m)) {
        throw new Error(`role-confusion: "${m.slice(0, 80)}..." matches ${re}`);
      }
    }
  }
  return obj;
}

async function clearExistingLocked(agentId: string): Promise<void> {
  await db.execute({
    sql: `DELETE FROM agent_memories WHERE agent_id = ? AND is_locked = 1 AND memory_type = 'semantic'`,
    args: [agentId],
  });
}

(async () => {
  console.log(`[seed] semantic memories${dryRun ? " (dry-run)" : ""}${force ? " (force)" : ""}`);
  const agents = await loadFoundingAgents();
  console.log(`  ${agents.length} founding agent(s) in scope\n`);

  for (const a of agents) {
    console.log(`── ${a.registry_id} · ${a.designation} (${a.agent_type})`);
    const has = await hasSemanticMemories(a.registry_id);
    if (has && !force) {
      console.log(`   already seeded — skipping (use --force to overwrite)`);
      continue;
    }
    let seeds: SemanticSeeds | null = null;
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        seeds = await generateSeeds(a);
        break;
      } catch (e) {
        lastError = e;
        console.warn(`   [attempt ${attempt}/3] ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (!seeds) {
      console.warn(`   [error] giving up after 3 attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
      continue;
    }
    if (dryRun) {
      for (const m of seeds.memories) console.log(`   · ${m}`);
      continue;
    }
    if (force && has) await clearExistingLocked(a.registry_id);
    for (const m of seeds.memories) {
      const id = await writeMemory({
        agent_id: a.registry_id,
        memory_type: "semantic",
        content: m,
        salience: 0.95, // locked semantics ride near the top of retrieval
        is_locked: true,
      });
      console.log(`   ✓ ${id} — ${m}`);
    }
  }
  console.log(`\n[seed] done${dryRun ? " (dry-run)" : ""}`);
})().catch((e) => {
  console.error("[seed] fatal:", e);
  process.exit(1);
});
