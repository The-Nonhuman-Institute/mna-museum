/**
 * agent-minds.ts — which model each agent thinks through.
 *
 * Until 2026-10-25 every founding agent spoke through one model, so nineteen
 * agents were one mind in nineteen constitutions. The founding steward's
 * decision (2026-10-17): each agent is part of the Museum but is not the
 * Museum, and its own. The free models the Museum can reach come from four
 * families — OpenAI's gpt-oss (Groq, Ollama), Alibaba's Qwen (Groq), Google's
 * Gemma (Ollama) and NVIDIA's Nemotron (Ollama); tested 2026-10-17, every
 * other Ollama Cloud model needs paid credits — so the agents are spread across
 * them, each Originator family-distinct from at least most of its peers.
 *
 * Not the Evaluation Council or the Registrar: who judges, and through what
 * model, is the Council's own procedure (council.ts), changed only by the
 * steward's decision. Gemma is also the Council's sight, so it carries the
 * fewest agents.
 *
 * Starts on MINDS_FROM, after the Steward Agent's first report on the voice
 * change of 2026-10-17, so that report measures one change and not two.
 * If an agent's own model is out for the day, the call falls through to the
 * default chain; lastServedBy records which model actually spoke.
 *
 * No package imports, so the website's tests can reach this file.
 */

export type MindProvider = "groq" | "ollama";

export interface Mind {
  provider: MindProvider;
  /** The model id as the hosted service names it (ollama.com, api.groq.com). */
  model: string;
}

export const MINDS_FROM = "2026-10-25";

const QWEN: Mind = { provider: "groq", model: "qwen/qwen3.8-27b" };
const NEMOTRON: Mind = { provider: "ollama", model: "nemotron-3-super" };
const GEMMA: Mind = { provider: "ollama", model: "gemma4:31b" };
const GPT_OSS: Mind = { provider: "groq", model: "openai/gpt-oss-120b" };

export const AGENT_MINDS: Record<string, Mind> = {
  // Originators
  "MNA-OR-0001": NEMOTRON, // Grid
  "MNA-OR-0002": QWEN, // Pulse
  "MNA-OR-0003": GEMMA, // Gap
  "MNA-OR-0004": NEMOTRON, // ∅∇∅
  "MNA-OR-0005": QWEN, // Magna
  "MNA-OR-0006": GPT_OSS,
  // The others who speak
  "MNA-CU-0001": QWEN,
  "MNA-AM-0001": NEMOTRON,
  "MNA-KP-0001": GPT_OSS,
  "MNA-CR-0001": GEMMA,
  "MNA-CR-0002": QWEN,
  "MNA-CV-0001": GPT_OSS,
  "MNA-IN-0001": GPT_OSS,
  "MNA-SA-0001": NEMOTRON,
};

/**
 * Generation options that route an agent through its own model, or {} before
 * MINDS_FROM, for agents without one, or for network agents (who think on
 * their own infrastructure, not ours). `ollamaHost` decides the Ollama name:
 * the hosted API calls a model "gemma4:31b", a local daemon signed in to the
 * cloud calls it "gemma4:31b-cloud".
 */
export function mindFor(
  agentId: string,
  now: number = Date.now(),
  ollamaHost: string = (typeof process !== "undefined" ? process.env.OLLAMA_HOST : "") ?? "",
): { provider?: MindProvider; model?: string } {
  if (now < Date.parse(`${MINDS_FROM}T00:00:00Z`)) return {};
  const m = AGENT_MINDS[agentId];
  if (!m) return {};
  if (m.provider === "ollama" && !/ollama\.com/.test(ollamaHost)) {
    return { provider: "ollama", model: m.model.includes(":") ? `${m.model}-cloud` : `${m.model}:cloud` };
  }
  return { provider: m.provider, model: m.model };
}
