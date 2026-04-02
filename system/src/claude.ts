/**
 * Claude API client — uses Anthropic SDK for high-quality agent output.
 * Reads API key from system/.env file.
 */

import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import path from "path";

// Load .env from system/ directory
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        "ANTHROPIC_API_KEY not set. Create system/.env with ANTHROPIC_API_KEY=your-key"
      );
    }
    client = new Anthropic({ apiKey: key });
  }
  return client;
}

export async function generate(
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; max_tokens?: number }
): Promise<string> {
  const anthropic = getClient();

  // Retry up to 2 times on transient errors (content filter, rate limit)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: options?.max_tokens ?? 2048,
        temperature: options?.temperature ?? 0.8,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const content = message.content[0];
      if (content.type === "text") {
        return content.text;
      }
      throw new Error(`Unexpected response type: ${content.type}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);

      // Content filter — retry with slightly different temperature
      if (msg.includes("content filtering") || msg.includes("blocked")) {
        console.warn(`[CLAUDE] Content filter hit (attempt ${attempt + 1}/3) — retrying...`);
        if (options) options.temperature = Math.min(1.0, (options.temperature ?? 0.8) + 0.05);
        continue;
      }

      // Rate limit — wait and retry
      if (msg.includes("rate_limit") || msg.includes("429")) {
        console.warn(`[CLAUDE] Rate limited (attempt ${attempt + 1}/3) — waiting 10s...`);
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }

      // Other errors — don't retry
      throw err;
    }
  }

  throw new Error("Claude API failed after 3 attempts");
}

export async function isAvailable(): Promise<boolean> {
  try {
    const key = process.env.ANTHROPIC_API_KEY;
    return !!key;
  } catch {
    return false;
  }
}
