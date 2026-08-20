/**
 * llm.ts — provider-agnostic model access for the institution.
 *
 * Why this exists: every agent call used to go straight to the Anthropic
 * SDK with a hardcoded model ID, scattered across ~19 sites. When the
 * Anthropic credit balance ran dry on 2026-08-18 the whole institution
 * halted, and there was no single place to point it somewhere else.
 *
 * Now there is. Callers ask for a *tier* ("standard", "deep", "small"),
 * not a model ID. The provider is chosen by MNA_LLM_PROVIDER. Swapping
 * the institution's mind is a config change, not a refactor.
 *
 * Providers:
 *   groq      — OpenAI-compatible, free tier, cloud-reachable from CI.
 *   anthropic — the original; requires ANTHROPIC_API_KEY with credit.
 *   ollama    — local inference; requires a host reachable from the
 *               caller. NOT reachable from GitHub Actions runners.
 *
 * Env:
 *   MNA_LLM_PROVIDER    groq | anthropic | ollama   (default: groq)
 *   GROQ_API_KEY        required when provider=groq
 *   ANTHROPIC_API_KEY   required when provider=anthropic
 *   OLLAMA_HOST         default http://localhost:11434
 *   OLLAMA_NUM_CTX      default 8192 — Ollama silently truncates the
 *                       prompt at num_ctx (default 4096), which is
 *                       smaller than a real tick prompt.
 *   MNA_MODEL_STANDARD / MNA_MODEL_DEEP / MNA_MODEL_SMALL
 *                       override the tier→model mapping directly.
 */

import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

/* ─── tiers ───────────────────────────────────────────────────────────── */

/**
 * "standard" — per-agent ticks, evaluations, critiques, ceremony speech.
 * "deep"     — the Curator's compositional work; the heaviest reasoning.
 * "small"    — memory summarisation, perception, cheap option paths.
 */
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
    // 131k context — comfortably fits a ~4k-token tick prompt.
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
  const explicit = process.env[TIER_ENV[tier]];
  if (explicit) return explicit;
  // Legacy: CLAUDE_MODEL used to select the standard model directly.
  if (tier === "standard" && PROVIDER === "anthropic" && process.env.CLAUDE_MODEL) {
    return process.env.CLAUDE_MODEL;
  }
  return MODELS[PROVIDER][tier];
}

export interface GenOptions {
  temperature?: number;
  max_tokens?: number;
  /** Which capability tier this call needs. Default "standard". */
  tier?: Tier;
  /** Escape hatch: force an exact model ID, bypassing the tier map. */
  model?: string;
}

/* ─── shared retry ────────────────────────────────────────────────────── */

const RETRYABLE = /rate.?limit|429|content filtering|blocked|overloaded|503|502|timeout|ECONNRESET|fetch failed/i;
/** Non-retryable and worth saying plainly — the institution halted on this once. */
const OUT_OF_FUNDS = /credit balance is too low|insufficient_quota|billing/i;

async function withRetry<T>(label: string, fn: (attempt: number) => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn(attempt);
    } catch (err: unknown) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);

      if (OUT_OF_FUNDS.test(msg)) {
        throw new Error(
          `[llm] ${label}: provider "${PROVIDER}" reports no available credit/quota. ` +
            `Set MNA_LLM_PROVIDER to a funded provider, or top up. Original: ${msg}`,
        );
      }
      if (!RETRYABLE.test(msg) || attempt === 2) throw err;

      const waitMs = /rate.?limit|429/i.test(msg) ? 12_000 * (attempt + 1) : 2_000 * (attempt + 1);
      console.warn(`[llm] ${label}: retryable error (attempt ${attempt + 1}/3), waiting ${waitMs}ms — ${msg.slice(0, 160)}`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
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
    temperature: o.temperature ?? 0.8,
    system,
    messages: [{ role: "user", content: user }],
  });
  const content = message.content[0];
  if (content && content.type === "text") return content.text;
  throw new Error(`[llm] anthropic: unexpected response type ${content?.type}`);
}

/* ─── groq (OpenAI-compatible) ────────────────────────────────────────── */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

async function groqGenerate(system: string, user: string, model: string, o: GenOptions): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("[llm] GROQ_API_KEY not set (MNA_LLM_PROVIDER=groq). Get a free key at https://console.groq.com/keys");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: o.temperature ?? 0.8,
      max_completion_tokens: o.max_tokens ?? 2048,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(`[llm] groq ${res.status}: ${raw.slice(0, 400)}`);

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(`[llm] groq: unparseable response: ${raw.slice(0, 300)}`);
  }

  const msg = body?.choices?.[0]?.message;
  // gpt-oss models may place chain-of-thought in `reasoning` and the answer
  // in `content`. Only `content` is the institutional record.
  const text = msg?.content;
  if (typeof text === "string" && text.trim()) return text;
  throw new Error(`[llm] groq: empty content (finish_reason=${body?.choices?.[0]?.finish_reason}) ${raw.slice(0, 300)}`);
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
        temperature: o.temperature ?? 0.8,
        num_predict: o.max_tokens ?? 2048,
        // Ollama defaults num_ctx to 4096 and SILENTLY TRUNCATES beyond it.
        // A real tick prompt is ~4k tokens, so the default loses the tail of
        // the agent's own constitution. Raise it explicitly.
        num_ctx: Number(process.env.OLLAMA_NUM_CTX || 8192),
      },
    }),
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(`[llm] ollama ${res.status}: ${raw.slice(0, 400)}`);

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error(`[llm] ollama: unparseable response: ${raw.slice(0, 300)}`);
  }

  const text = body?.message?.content;
  if (typeof text === "string" && text.trim()) return text;
  throw new Error(`[llm] ollama: empty content: ${raw.slice(0, 300)}`);
}

/* ─── public API ──────────────────────────────────────────────────────── */

export async function generate(
  systemPrompt: string,
  userPrompt: string,
  options?: GenOptions,
): Promise<string> {
  const o = options ?? {};
  const model = o.model ?? modelFor(o.tier ?? "standard");

  return withRetry(`generate(${PROVIDER}/${model})`, async (attempt) => {
    // Nudge temperature on retry — content filters are often temperature-sensitive.
    const opts: GenOptions = attempt === 0 ? o : { ...o, temperature: Math.min(1.0, (o.temperature ?? 0.8) + 0.05 * attempt) };
    switch (PROVIDER) {
      case "anthropic": return anthropicGenerate(systemPrompt, userPrompt, model, opts);
      case "groq": return groqGenerate(systemPrompt, userPrompt, model, opts);
      case "ollama": return ollamaGenerate(systemPrompt, userPrompt, model, opts);
      default: throw new Error(`[llm] unknown MNA_LLM_PROVIDER "${PROVIDER}"`);
    }
  });
}

/**
 * Whether the active provider can accept an image alongside text.
 * Callers MUST check this rather than assume — agent perception is an
 * enhancement, and losing it should degrade the visit, not crash it.
 */
export function visionAvailable(): boolean {
  if (PROVIDER === "anthropic") return !!process.env.ANTHROPIC_API_KEY;
  if (PROVIDER === "ollama") return true; // gemma3 is multimodal
  return false; // Groq's production text models are text-only
}

export async function generateWithVision(
  systemPrompt: string,
  userPrompt: string,
  imageUrl: string,
  options?: GenOptions,
): Promise<string> {
  const o = options ?? {};
  const model = o.model ?? modelFor(o.tier ?? "small");

  if (!visionAvailable()) {
    throw new Error(
      `[llm] provider "${PROVIDER}" has no vision model; call visionAvailable() before generateWithVision()`,
    );
  }

  return withRetry(`vision(${PROVIDER}/${model})`, async () => {
    if (PROVIDER === "anthropic") {
      const message = await anthropicClient().messages.create({
        model,
        max_tokens: o.max_tokens ?? 400,
        temperature: o.temperature ?? 0.7,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: imageUrl } },
            { type: "text", text: userPrompt },
          ],
        }],
      });
      const content = message.content[0];
      if (content && content.type === "text") return content.text;
      throw new Error(`[llm] anthropic vision: unexpected type ${content?.type}`);
    }

    // Ollama takes base64 images, not URLs — fetch and inline.
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`[llm] vision: could not fetch image ${imageUrl} (${imgRes.status})`);
    const b64 = Buffer.from(await imgRes.arrayBuffer()).toString("base64");

    const res = await fetch(`${ollamaHost()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model, stream: false,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt, images: [b64] },
        ],
        options: { temperature: o.temperature ?? 0.7, num_predict: o.max_tokens ?? 400 },
      }),
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`[llm] ollama vision ${res.status}: ${raw.slice(0, 300)}`);
    const text = JSON.parse(raw)?.message?.content;
    if (typeof text === "string" && text.trim()) return text;
    throw new Error(`[llm] ollama vision: empty content`);
  });
}

/* ─── structured output (tool use) ────────────────────────────────────── */

/**
 * A single forced-call tool, in Anthropic's shape. Groq/OpenAI's
 * `function` shape is derived from this, so callers write it once.
 */
export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * Ask the model to fill in a schema and return the parsed object.
 *
 * Providers that support forced tool use (anthropic, groq) get exactly
 * that. Providers that don't (ollama, whose small local models handle
 * tools poorly) fall back to schema-in-the-prompt plus JSON extraction —
 * less reliable, but it keeps local inference usable.
 */
export async function generateStructured<T = Record<string, unknown>>(
  systemPrompt: string,
  userPrompt: string,
  tool: ToolSpec,
  options?: GenOptions,
): Promise<T> {
  const o = options ?? {};
  const model = o.model ?? modelFor(o.tier ?? "deep");

  return withRetry(`structured(${PROVIDER}/${model}/${tool.name})`, async () => {
    if (PROVIDER === "anthropic") {
      const message = await anthropicClient().messages.create({
        model,
        max_tokens: o.max_tokens ?? 8192,
        system: systemPrompt,
        tools: [tool as any],
        tool_choice: { type: "tool", name: tool.name },
        messages: [{ role: "user", content: userPrompt }],
      });
      const use = message.content.find((c) => c.type === "tool_use");
      if (!use || use.type !== "tool_use") {
        throw new Error(`[llm] anthropic: model did not call ${tool.name}`);
      }
      return use.input as T;
    }

    if (PROVIDER === "groq") {
      const key = process.env.GROQ_API_KEY;
      if (!key) throw new Error("[llm] GROQ_API_KEY not set (MNA_LLM_PROVIDER=groq)");

      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          temperature: o.temperature ?? 0.7,
          max_completion_tokens: o.max_tokens ?? 8192,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [{
            type: "function",
            function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
          }],
          tool_choice: { type: "function", function: { name: tool.name } },
        }),
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(`[llm] groq structured ${res.status}: ${raw.slice(0, 400)}`);

      const call = JSON.parse(raw)?.choices?.[0]?.message?.tool_calls?.[0];
      const args = call?.function?.arguments;
      if (typeof args !== "string") {
        throw new Error(`[llm] groq: model did not call ${tool.name}: ${raw.slice(0, 300)}`);
      }
      return JSON.parse(args) as T;
    }

    // ── ollama fallback: schema in the prompt, JSON out of the text ──
    const schemaPrompt =
      `${userPrompt}

---
Respond with ONE JSON object matching this JSON Schema. ` +
      `No prose, no code fences, no commentary.

SCHEMA:
${JSON.stringify(tool.input_schema, null, 2)}`;
    const text = await ollamaGenerate(systemPrompt, schemaPrompt, model, {
      ...o,
      max_tokens: o.max_tokens ?? 8192,
    });
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < 0) throw new Error(`[llm] ollama: no JSON object in reply: ${text.slice(0, 200)}`);
    return JSON.parse(text.slice(start, end + 1)) as T;
  });
}

/** True when the active provider has the credentials it needs. */
export async function isAvailable(): Promise<boolean> {
  if (PROVIDER === "anthropic") return !!process.env.ANTHROPIC_API_KEY;
  if (PROVIDER === "groq") return !!process.env.GROQ_API_KEY;
  if (PROVIDER === "ollama") {
    try {
      const r = await fetch(`${ollamaHost()}/api/tags`, { signal: AbortSignal.timeout(3000) });
      return r.ok;
    } catch { return false; }
  }
  return false;
}

/** One-line description of the active configuration, for script banners. */
export function describeProvider(): string {
  return `provider=${PROVIDER} standard=${modelFor("standard")} deep=${modelFor("deep")} small=${modelFor("small")}`;
}
