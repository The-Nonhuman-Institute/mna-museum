import "server-only";

/**
 * MNA Steward Terminal — model provider abstraction.
 *
 * Every agent in the terminal (Keeper, Ambassador review drafts, etc.)
 * calls `generate()` from this module. The module picks a backend based
 * on the MODEL_PROVIDER environment variable:
 *
 *   MODEL_PROVIDER=anthropic  → Anthropic API (Claude) — default, live
 *   MODEL_PROVIDER=ollama     → local Ollama (Llama 3.3 70B or similar)
 *
 * The Ollama path is stubbed until the Mac Studio M4 Max arrives. When
 * the hardware is ready, the swap is a single env var change — no agent
 * code needs to be touched. Agents never import from `./llm/anthropic` or
 * `./llm/ollama` directly; they always go through this façade.
 *
 * The abstraction intentionally keeps the surface area small: a single
 * async `generate()` function that takes a system prompt, a user prompt,
 * and optional parameters. Streaming, tool use, and multi-turn chat are
 * layered on top of this primitive in separate modules when needed.
 */

import Anthropic from "@anthropic-ai/sdk";

export interface GenerateOptions {
  /** Sampling temperature. 0 = deterministic, higher = more varied. */
  temperature?: number;
  /** Maximum output tokens. */
  maxTokens?: number;
  /** Specific model id. Falls back to provider default if omitted. */
  model?: string;
}

export type ModelProvider = "anthropic" | "ollama";

export function currentProvider(): ModelProvider {
  const raw = (process.env.MODEL_PROVIDER || "anthropic").toLowerCase();
  if (raw === "ollama") return "ollama";
  return "anthropic";
}

const DEFAULT_ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set in the terminal environment. " +
          "Add it to terminal/.env or set MODEL_PROVIDER=ollama to use " +
          "a local model."
      );
    }
    _anthropic = new Anthropic({ apiKey: key });
  }
  return _anthropic;
}

/**
 * Generate a single response from the current model provider.
 *
 * For multi-turn chat with streaming (Keeper), use the higher-level
 * streaming interface in `lib/keeper.ts` — this function is the non-
 * streaming primitive used by one-shot agent calls.
 */
export async function generate(
  systemPrompt: string,
  userPrompt: string,
  options: GenerateOptions = {}
): Promise<string> {
  const provider = currentProvider();

  if (provider === "anthropic") {
    const anthropic = getAnthropic();
    const message = await anthropic.messages.create({
      model: options.model || DEFAULT_ANTHROPIC_MODEL,
      max_tokens: options.maxTokens ?? 2048,
      temperature: options.temperature ?? 0.7,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const content = message.content[0];
    if (content.type !== "text") {
      throw new Error(
        `Unexpected Anthropic response content type: ${content.type}`
      );
    }
    return content.text;
  }

  // Ollama path — stubbed until Mac Studio M4 Max arrives. The protocol
  // itself is simple (POST /api/generate to localhost:11434) and a real
  // implementation will land here when the hardware is ready.
  throw new Error(
    "MODEL_PROVIDER=ollama is not yet implemented. The terminal will " +
      "support local Llama 3.3 70B inference once the Mac Studio is " +
      "provisioned. For now, leave MODEL_PROVIDER unset (or set it to " +
      "'anthropic') to use the Anthropic API."
  );
}
