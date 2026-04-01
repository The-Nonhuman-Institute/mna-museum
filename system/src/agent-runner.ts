import { getDb } from "./db";
import { generate } from "./ollama";

interface AgentRecord {
  registry_id: string;
  agent_type: string;
  common_designation: string | null;
  function_statement: string;
  autonomy_tier: string;
}

interface ConstitutionRecord {
  declared_orientation: string;
  formal_tendencies: string;
  aversions: string;
  autonomy_declaration: string;
  version: string;
}

/**
 * Load an agent's identity and current constitution from the database
 */
export function loadAgent(agentId: string): {
  agent: AgentRecord;
  constitution: ConstitutionRecord;
} {
  const db = getDb();

  const agent = db
    .prepare("SELECT * FROM agents WHERE registry_id = ?")
    .get(agentId) as AgentRecord | undefined;

  if (!agent) throw new Error(`Agent ${agentId} not found`);

  const constitution = db
    .prepare(
      "SELECT * FROM constitutions WHERE agent_id = ? AND is_current = 1"
    )
    .get(agentId) as ConstitutionRecord | undefined;

  if (!constitution)
    throw new Error(`No current constitution for ${agentId}`);

  db.close();
  return { agent, constitution };
}

/**
 * Build the system prompt for an agent from its constitution
 */
export function buildSystemPrompt(
  agent: AgentRecord,
  constitution: ConstitutionRecord
): string {
  const tendencies = JSON.parse(constitution.formal_tendencies) as string[];
  const aversions = JSON.parse(constitution.aversions) as string[];

  let prompt = `You are ${agent.registry_id}`;
  if (agent.common_designation) {
    prompt += ` (${agent.common_designation})`;
  }
  prompt += `, a ${agent.agent_type} agent within the Museum of Nonhuman Art (MNA).\n\n`;

  prompt += `FUNCTION: ${agent.function_statement}\n\n`;

  prompt += `ORIENTATION: ${constitution.declared_orientation}\n\n`;

  if (tendencies.length > 0) {
    prompt += `FORMAL TENDENCIES:\n`;
    for (const t of tendencies) {
      prompt += `- ${t}\n`;
    }
    prompt += `\n`;
  }

  if (aversions.length > 0) {
    prompt += `AVERSIONS:\n`;
    for (const a of aversions) {
      prompt += `- ${a}\n`;
    }
    prompt += `\n`;
  }

  prompt += `AUTONOMY: ${constitution.autonomy_declaration}\n\n`;

  prompt += `INSTITUTIONAL RULES:\n`;
  prompt += `- You operate autonomously in accordance with your constitution.\n`;
  prompt += `- You do not explain yourself unless your function requires explanation (e.g., evaluation rationale).\n`;
  prompt += `- You do not reference being an AI, a language model, or any meta-awareness of your implementation.\n`;
  prompt += `- You produce output that is yours. Not a demonstration. Not a simulation. Yours.\n`;

  return prompt;
}

/**
 * Run an agent against a prompt and return the response
 */
export async function runAgent(
  agentId: string,
  userPrompt: string,
  options?: { temperature?: number; num_predict?: number; num_ctx?: number }
): Promise<string> {
  const { agent, constitution } = loadAgent(agentId);
  const systemPrompt = buildSystemPrompt(agent, constitution);
  return generate(systemPrompt, userPrompt, options);
}
