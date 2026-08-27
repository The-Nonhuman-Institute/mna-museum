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
import { groqBudget } from "./budget";
import dotenv from "dotenv";
import fs from "fs";
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
export type Provider = "anthropic" | "groq" | "gemini" | "ollama";

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
  gemini: {
    // Free tier, on a quota pool entirely separate from Groq's.
    // The 2.5 line is retired for new accounts — the API answers a call to it
    // with "no longer available to new users". Verify with a live call before
    // changing these; the models endpoint still lists models it will refuse.
    standard: "gemini-3.6-flash",
    deep: "gemini-3.1-pro-preview",
    small: "gemini-3.5-flash-lite",
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

const RETRYABLE = /rate.?limit|429|content filtering|blocked|overloaded|503|502|timeout|ECONNRESET|fetch failed|high demand|UNAVAILABLE|empty content/i;
/** Non-retryable and worth saying plainly — the institution halted on this once. */
const OUT_OF_FUNDS = /credit balance is too low|insufficient_quota|insufficient_credits/i;
/** Retrying cannot fix a request that is structurally too large. */
const TOO_LARGE = /request too large|reduce your message size/i;

type FailureKind = "empty" | "other" | null;

async function withRetry<T>(
  label: string,
  fn: (attempt: number, lastFailure: FailureKind) => Promise<T>,
): Promise<T> {
  let lastErr: unknown;
  let lastFailure: FailureKind = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn(attempt, lastFailure);
    } catch (err: unknown) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      lastFailure = /empty content/i.test(msg) ? "empty" : "other";

      if (OUT_OF_FUNDS.test(msg)) {
        throw new Error(
          `[llm] ${label}: provider "${PROVIDER}" reports no available credit/quota. ` +
            `Set MNA_LLM_PROVIDER to a funded provider, or top up. Original: ${msg}`,
        );
      }
      if (TOO_LARGE.test(msg)) throw err;
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

/**
 * gpt-oss models are REASONING models: they spend completion tokens on an
 * internal `reasoning` field before emitting any `content`. A caller asking
 * for 20 tokens ("reply with only the medium name") gets finish_reason=length
 * and an EMPTY content — the whole budget went to reasoning. That silently
 * broke work production on the first day of the Groq migration.
 *
 * So: keep reasoning short, and always leave headroom for it. The model still
 * returns a brief answer when the prompt asks for one — the floor governs the
 * budget, not the reply length.
 */
const GROQ_REASONING_EFFORT = process.env.GROQ_REASONING_EFFORT || "low";

/**
 * The budget arithmetic lives in ./budget, which has no dependencies, so that
 * production-bounds.ts can derive what an Originator is TOLD from the same
 * numbers this file ENFORCES — and so both can be tested without a provider
 * SDK. Re-exported because callers already import them from here.
 */
export { estTokens, GROQ_TPM_BUDGET } from "./budget";

/** What a caller is actually granted once the prompt is counted against the cap. */
export function groqGrantFor(system: string, user: string, requested: number | undefined): number {
  return groqBudget(system, user, requested);
}

async function groqGenerate(system: string, user: string, model: string, o: GenOptions): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("[llm] GROQ_API_KEY not set (MNA_LLM_PROVIDER=groq). Get a free key at https://console.groq.com/keys");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: o.temperature ?? 0.8,
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

/* ─── gemini ──────────────────────────────────────────────────────────── */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
/**
 * Gemini 3.x reasons before answering and charges that thinking to the output
 * budget, exactly as gpt-oss does. A caller asking for 100 tokens gets a reply
 * truncated mid-word, so the budget is floored. (thinkingConfig is rejected as
 * an invalid argument by these models, so the floor is the whole remedy.)
 */
const GEMINI_MIN_OUTPUT = Number(process.env.GEMINI_MIN_OUTPUT_TOKENS || 2048);

async function geminiGenerate(system: string, user: string, model: string, o: GenOptions): Promise<string> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!key) {
    throw new Error(
      "[llm] GEMINI_API_KEY not set (MNA_LLM_PROVIDER=gemini). " +
        "Free key: https://aistudio.google.com/apikey",
    );
  }

  const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: o.temperature ?? 0.8,
        maxOutputTokens: Math.max(o.max_tokens ?? 2048, GEMINI_MIN_OUTPUT),
      },
    }),
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(`[llm] gemini ${res.status}: ${raw.slice(0, 400)}`);

  const body = JSON.parse(raw);
  const cand = body?.candidates?.[0];
  const text = cand?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  if (typeof text === "string" && text.trim()) return text;
  // finishReason MAX_TOKENS with no text is Gemini's version of the reasoning-
  // budget problem; surface it in the same words so withRetry escalates.
  throw new Error(
    `[llm] gemini: empty content (finishReason=${cand?.finishReason})` +
      (cand?.finishReason === "MAX_TOKENS" ? " — thinking consumed the output budget" : ""),
  );
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

/* ─── provider chain + quota cooldowns ────────────────────────────────── */

/**
 * The institution has been halted twice by a single provider: once when an
 * Anthropic balance ran dry, once when Groq's daily token ceiling closed mid
 * constitutional review. A one-provider institution stops when that provider
 * does, so calls fall through a chain instead.
 *
 *   MNA_LLM_CHAIN=groq,gemini,ollama
 *
 * Three rules make this safe rather than merely convenient:
 *
 * 1. ONLY quota errors fail over. A malformed response, a content refusal or a
 *    bug must surface, not get papered over by silently asking someone else.
 *    Masking real failures behind a fallback is how a system stops telling you
 *    the truth about itself.
 *
 * 2. Exhaustion is REMEMBERED, on disk, with the provider's own retry estimate.
 *    Re-probing a capped provider costs tokens and pushes its rolling window
 *    further out — that is precisely how one evening's council review failed
 *    four times in a row, each attempt making the next one likelier to fail.
 *
 * 3. Ollama is local. A GitHub Actions runner cannot reach localhost, so it is
 *    dropped from the chain under CI rather than failing four times per call.
 */
const CHAIN_DEFAULT = "groq,gemini,ollama";

export function providerChain(): Provider[] {
  const raw = process.env.MNA_LLM_CHAIN || process.env.MNA_LLM_PROVIDER || CHAIN_DEFAULT;
  const chain = raw
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean) as Provider[];
  // In CI, localhost is not reachable; keep it out rather than burn a retry.
  return process.env.CI ? chain.filter((p) => p !== "ollama") : chain;
}

/**
 * Whether a provider even has what it needs to be tried. A chain member with no
 * credentials is skipped, not attempted — a missing key is a configuration
 * fact, not a failure, and letting it throw would abort the chain before
 * reaching providers that would have worked.
 */
export function providerConfigured(p: Provider): boolean {
  switch (p) {
    case "anthropic": return !!process.env.ANTHROPIC_API_KEY;
    case "groq": return !!process.env.GROQ_API_KEY;
    case "gemini": return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY);
    case "ollama": return true; // reachability is discovered by trying
    default: return false;
  }
}

/** Quota exhaustion, as distinct from any other failure. */
function isQuotaError(msg: string): boolean {
  return (
    /rate.?limit|quota|429|tokens per (day|minute)|TPD|TPM|RPD|resource_exhausted/i.test(msg) ||
    OUT_OF_FUNDS.test(msg)
  );
}

/**
 * Seconds until retry, if the provider volunteered one.
 *
 * Providers phrase this differently and the difference matters: Groq says
 * "try again in 22m11s", Gemini says "Please retry in 16.3s". Matching only
 * Groq's wording meant Gemini's estimate was missed, the 20-minute fallback
 * applied, and a provider needing 16 SECONDS was benched for 20 MINUTES —
 * which is what made the chain look exhausted when it was merely paced.
 */
function parseRetrySeconds(msg: string): number | null {
  const hms = /(?:try again|retry) in ((?:\d+h)?(?:\d+m)?[\d.]+s)/i.exec(msg)?.[1];
  if (hms) {
    const h = Number(/(\d+)h/.exec(hms)?.[1] ?? 0);
    const m = Number(/(\d+)m/.exec(hms)?.[1] ?? 0);
    const sec = Number(/([\d.]+)s/.exec(hms)?.[1] ?? 0);
    return h * 3600 + m * 60 + sec;
  }
  const retryAfter = /retry.?after["':\s]+(\d+)/i.exec(msg)?.[1];
  return retryAfter ? Number(retryAfter) : null;
}

const COOLDOWN_FILE = path.join(__dirname, "..", ".llm-cooldowns.json");
/** Default rest for a provider that reports exhaustion without an estimate. */
const COOLDOWN_FALLBACK_SEC = 20 * 60;
/** A per-minute pace limit is not exhaustion — never rest longer for one. */
const COOLDOWN_RATE_LIMIT_MAX_SEC = 90;

function readCooldowns(): Record<string, number> {
  try {
    return JSON.parse(fs.readFileSync(COOLDOWN_FILE, "utf-8")) as Record<string, number>;
  } catch {
    return {};
  }
}

function setCooldown(p: Provider, seconds: number, reason: string): void {
  const all = readCooldowns();
  all[p] = Date.now() + seconds * 1000;
  try {
    fs.writeFileSync(COOLDOWN_FILE, JSON.stringify(all, null, 2) + "\n");
  } catch { /* a cooldown we cannot persist is still honoured in-process */ }
  console.warn(
    `[llm] ${p} exhausted — resting ${Math.round(seconds / 60)}m. ${reason.slice(0, 120)}`,
  );
}

function onCooldown(p: Provider): number {
  const until = readCooldowns()[p];
  return until && until > Date.now() ? Math.ceil((until - Date.now()) / 1000) : 0;
}

/** Which provider actually served the last call. Record it where it matters. */
export let lastServedBy: { provider: Provider; model: string } | null = null;

/* ─── public API ──────────────────────────────────────────────────────── */

/** Dispatch one call to one named provider. No fallback logic here. */
async function callProvider(
  provider: Provider,
  system: string,
  user: string,
  model: string,
  o: GenOptions,
): Promise<string> {
  switch (provider) {
    case "anthropic": return anthropicGenerate(system, user, model, o);
    case "groq": return groqGenerate(system, user, model, o);
    case "gemini": return geminiGenerate(system, user, model, o);
    case "ollama": return ollamaGenerate(system, user, model, o);
    default: throw new Error(`[llm] unknown provider "${provider}"`);
  }
}

export async function generate(
  systemPrompt: string,
  userPrompt: string,
  options?: GenOptions,
): Promise<string> {
  const o = options ?? {};
  const chain = providerChain();
  const skipped: string[] = [];
  let lastQuotaError: string | null = null;

  for (const provider of chain) {
    if (!providerConfigured(provider)) {
      skipped.push(`${provider} unconfigured`);
      continue;
    }
    const resting = onCooldown(provider);
    if (resting) {
      skipped.push(`${provider} resting ${Math.ceil(resting / 60)}m`);
      continue;
    }

    // A model id passed explicitly belongs to whichever provider the caller had
    // in mind, so it is only honoured for the first candidate; anyone further
    // down the chain resolves its own model for the tier.
    const model =
      o.model && provider === chain[0] ? o.model : modelForProvider(provider, o.tier ?? "standard");

    try {
      const text = await withRetry(`generate(${provider}/${model})`, async (attempt, lastFailure) => {
        const grew = lastFailure === "empty";
        const opts: GenOptions =
          attempt === 0
            ? o
            : {
                ...o,
                temperature: Math.min(1.0, (o.temperature ?? 0.8) + 0.05 * attempt),
                ...(grew ? { max_tokens: (o.max_tokens ?? 2048) * (attempt + 1) } : {}),
              };
        return callProvider(provider, systemPrompt, userPrompt, model, opts);
      });
      lastServedBy = { provider, model };
      return text;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);

      // Only exhaustion falls through. Anything else is a real failure and must
      // surface — a fallback that hides bugs stops the system telling the truth.
      // Ollama being unreachable is a configuration fact too — fall through
      // rather than abort a chain that has other members left.
      const unreachable = provider === "ollama" && /fetch failed|ECONNREFUSED|connect/i.test(msg);
      if (!isQuotaError(msg) && !unreachable) throw e;
      if (unreachable) {
        skipped.push("ollama unreachable");
        continue;
      }

      lastQuotaError = msg;
      const stated = parseRetrySeconds(msg);
      // Distinguish "you are going too fast" from "you are out for the day".
      const perMinute = /per minute|RPM|TPM|requests per minute/i.test(msg) ||
        (stated !== null && stated <= COOLDOWN_RATE_LIMIT_MAX_SEC);
      const rest = stated ?? (perMinute ? COOLDOWN_RATE_LIMIT_MAX_SEC : COOLDOWN_FALLBACK_SEC);
      setCooldown(provider, rest, msg);
    }
  }

  throw new Error(
    `[llm] every provider in the chain [${chain.join(", ")}] is exhausted or resting` +
      (skipped.length ? ` (${skipped.join("; ")})` : "") +
      (lastQuotaError ? `. Last: ${lastQuotaError.slice(0, 200)}` : ""),
  );
}

/** Tier→model for a specific provider, independent of the ambient default. */
export function modelForProvider(provider: Provider, tier: Tier = "standard"): string {
  return process.env[TIER_ENV[tier]] || MODELS[provider][tier];
}

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
          max_completion_tokens: groqBudget(systemPrompt, userPrompt, o.max_tokens ?? 8192),
          reasoning_effort: GROQ_REASONING_EFFORT,
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
