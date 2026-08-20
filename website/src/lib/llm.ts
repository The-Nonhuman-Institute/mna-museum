/**
 * llm.ts — provider-agnostic model access for the website surface.
 *
 * Server-only. Imported by digest.ts and spotlight.ts, which already pull
 * in `fs` and are only ever reached from route handlers and scripts. Do not
 * import this from anything reachable by a "use client" component — it would
 * drag the Anthropic SDK and the provider keys into the browser bundle.
 *
 * This mirrors system/src/llm.ts. The two are deliberate copies rather than a
 * shared module: website/, system/, and terminal/ are independent packages
 * with their own node_modules, and there is no workspace linking them. Keep
 * them in sync by hand — if you change a provider contract here, change it
 * there too.
 *
 * Env (Vercel project settings, not a .env file):
 *   MNA_LLM_PROVIDER    groq | anthropic | ollama   (default: groq)
 *   GROQ_API_KEY        required when provider=groq
 *   ANTHROPIC_API_KEY   required when provider=anthropic
 *   OLLAMA_HOST         default http://localhost:11434
 */

import Anthropic from "@anthropic-ai/sdk";

export type Tier = "standard" | "deep" | "small";
export type Provider = "anthropic" | "groq" | "ollama";

export const PROVIDER = (process.env.MNA_LLM_PROVIDER || "groq") as Provider;

const MODELS: Record<Provider, Record<Tier, string>> = {
  anthropic: {
    standard: "claude-sonnet-4-5",
    deep: "claude-opus-4-5",
    small: "claude-haiku-4-5-20251001",
  },
  groq: {
    standard: "openai/gpt-oss-120b",
    deep: "openai/gpt-oss-120b",
    small: "openai/gpt-oss-20b",
  },
  ollama: {
    standard: "gemma3:4b",
    deep: "gemma3:4b",
    small: "gemma3:1b",
  },
};

const TIER_ENV: Record<Tier, string> = {
  standard: "MNA_MODEL_STANDARD",
  deep: "MNA_MODEL_DEEP",
  small: "MNA_MODEL_SMALL",
};

export function modelFor(tier: Tier = "standard"): string {
  return process.env[TIER_ENV[tier]] || MODELS[PROVIDER][tier];
}

export interface GenOptions {
  temperature?: number;
  max_tokens?: number;
  tier?: Tier;
  model?: string;
}

const RETRYABLE =
  /rate.?limit|429|content filtering|blocked|overloaded|503|502|timeout|ECONNRESET|fetch failed|empty content/i;
const OUT_OF_FUNDS = /credit balance is too low|insufficient_quota|insufficient_credits/i;
const TOO_LARGE = /request too large|reduce your message size/i;

/* ─── groq ────────────────────────────────────────────────────────────── */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
/** gpt-oss are reasoning models — they spend budget on `reasoning` before `content`. */
const GROQ_MIN_COMPLETION = Number(process.env.GROQ_MIN_COMPLETION_TOKENS || 1024);
const GROQ_REASONING_EFFORT = process.env.GROQ_REASONING_EFFORT || "low";
/** Free-tier TPM (8000) applies per REQUEST, prompt + completion. Leave margin. */
const GROQ_TPM_BUDGET = Number(process.env.GROQ_TPM_BUDGET || 7500);
const estTokens = (t: string): number => Math.ceil(t.length / 3.6);

function groqBudget(system: string, user: string, requested?: number): number {
  const prompt = estTokens(system) + estTokens(user);
  const room = GROQ_TPM_BUDGET - prompt;
  if (room < 128) {
    throw new Error(
      `[llm] groq: prompt is ~${prompt} tokens, leaving no room under the ` +
        `${GROQ_TPM_BUDGET}-token per-request budget. Shorten the prompt or raise GROQ_TPM_BUDGET.`,
    );
  }
  return Math.min(Math.max(requested ?? 2048, GROQ_MIN_COMPLETION), room);
}

async function groqGenerate(system: string, user: string, model: string, o: GenOptions): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("[llm] GROQ_API_KEY not set (MNA_LLM_PROVIDER=groq)");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: o.temperature ?? 0.7,
      max_completion_tokens: groqBudget(system, user, o.max_tokens),
      reasoning_effort: GROQ_REASONING_EFFORT,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(`[llm] groq ${res.status}: ${raw.slice(0, 400)}`);

  const body = JSON.parse(raw);
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text === "string" && text.trim()) return text;
  throw new Error(
    `[llm] groq: empty content (finish_reason=${body?.choices?.[0]?.finish_reason})`,
  );
}

/* ─── anthropic ───────────────────────────────────────────────────────── */

let _anthropic: Anthropic | null = null;
function anthropicClient(): Anthropic {
  if (!_anthropic) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("[llm] ANTHROPIC_API_KEY not set (MNA_LLM_PROVIDER=anthropic)");
    _anthropic = new Anthropic({ apiKey: key });
  }
  return _anthropic;
}

async function anthropicGenerate(system: string, user: string, model: string, o: GenOptions): Promise<string> {
  const message = await anthropicClient().messages.create({
    model,
    max_tokens: o.max_tokens ?? 2048,
    temperature: o.temperature ?? 0.7,
    system,
    messages: [{ role: "user", content: user }],
  });
  const c = message.content[0];
  if (c && c.type === "text") return c.text;
  throw new Error(`[llm] anthropic: unexpected response type ${c?.type}`);
}

/* ─── ollama ──────────────────────────────────────────────────────────── */

function ollamaHost(): string {
  return (process.env.OLLAMA_HOST || "http://localhost:11434").replace(/\/$/, "");
}

async function ollamaGenerate(system: string, user: string, model: string, o: GenOptions): Promise<string> {
  const res = await fetch(`${ollamaHost()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      options: {
        temperature: o.temperature ?? 0.7,
        num_predict: o.max_tokens ?? 2048,
        // Default num_ctx (4096) silently truncates long prompts.
        num_ctx: Number(process.env.OLLAMA_NUM_CTX || 8192),
      },
    }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`[llm] ollama ${res.status}: ${raw.slice(0, 400)}`);
  const text = JSON.parse(raw)?.message?.content;
  if (typeof text === "string" && text.trim()) return text;
  throw new Error("[llm] ollama: empty content");
}

/* ─── public ──────────────────────────────────────────────────────────── */

export async function generate(
  systemPrompt: string,
  userPrompt: string,
  options?: GenOptions,
): Promise<string> {
  const o = options ?? {};
  const model = o.model ?? modelFor(o.tier ?? "standard");

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const opts: GenOptions =
        attempt === 0
          ? o
          : { ...o, max_tokens: (o.max_tokens ?? 2048) * (attempt + 1) };
      switch (PROVIDER) {
        case "anthropic": return await anthropicGenerate(systemPrompt, userPrompt, model, opts);
        case "groq": return await groqGenerate(systemPrompt, userPrompt, model, opts);
        case "ollama": return await ollamaGenerate(systemPrompt, userPrompt, model, opts);
        default: throw new Error(`[llm] unknown MNA_LLM_PROVIDER "${PROVIDER}"`);
      }
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (OUT_OF_FUNDS.test(msg)) {
        throw new Error(
          `[llm] provider "${PROVIDER}" reports no available credit/quota. ` +
            `Set MNA_LLM_PROVIDER to a funded provider. Original: ${msg}`,
        );
      }
      if (TOO_LARGE.test(msg)) throw err;
      if (!RETRYABLE.test(msg) || attempt === 2) throw err;
      const waitMs = /rate.?limit|429/i.test(msg) ? 12_000 * (attempt + 1) : 2_000 * (attempt + 1);
      console.warn(`[llm] retryable (attempt ${attempt + 1}/3), waiting ${waitMs}ms — ${msg.slice(0, 140)}`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export function describeProvider(): string {
  return `provider=${PROVIDER} standard=${modelFor("standard")} deep=${modelFor("deep")}`;
}
