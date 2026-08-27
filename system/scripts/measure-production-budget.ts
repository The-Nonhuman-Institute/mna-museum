/**
 * measure-production-budget.ts — what a provider actually GRANTS an Originator,
 * against the prompt production really sends.
 *
 * Two works were truncated on 2026-08-26 (MNA-OR-0001-W-0026, W-0027) and the
 * Conservator safe-rendered both. The Conservator repairs the rendering; the
 * work stays half-written, and nothing warned that the completion budget granted
 * was below the budget asked for. Before changing how the institution produces,
 * measure — the way the Groq tier limits were measured rather than read off a
 * blog.
 *
 * Writes nothing. Produces no work. One request per provider.
 *
 *   MNA_DUMP_PROMPT=/tmp/p.json npx tsx system/scripts/originate-turso.ts \
 *     --agent MNA-OR-0001 --dry-run --format svg
 *   npx tsx system/scripts/measure-production-budget.ts /tmp/p.json
 */

import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

// Measure the models the institution actually uses. Naming them here would let
// this report a budget for a model no round ever calls — and the Gemini 2.5
// line is already retired, so a hardcoded default would simply 404.
import { estTokens, groqGrantFor, modelForProvider } from "../src/llm";


/** What originate-turso asks for on any non-prose medium. */
const ASKED = 8192;

interface Measurement {
  provider: string;
  model: string;
  granted: number | string;
  finish: string;
  reasoningTokens: number | null;
  completionTokens: number | null;
  contentChars: number;
  complete: boolean | null;
  error?: string;
}

/**
 * How many characters of THIS medium one completion token buys.
 *
 * The whole budget question turns on this. `estTokens` in llm.ts assumes
 * len/3.6, which is a prose ratio; markup and structured data are dense with
 * punctuation and numerals and tokenize far worse. A grant that looks generous
 * in tokens can be small in characters, which is the unit a work is actually
 * measured in.
 */
const charsPerToken = (chars: number, tokens: number | null) =>
  tokens && tokens > 0 ? (chars / tokens).toFixed(2) : "?";

const closed = (payload: string, format: string): boolean | null => {
  const p = payload.trim();
  if (format === "svg") return p.includes("</svg>");
  if (format === "html-css") return /<\/html>/i.test(p);
  if (format.endsWith("-json")) {
    try { JSON.parse(p); return true; } catch { return false; }
  }
  return null;
};

async function measureGroq(system: string, user: string, format: string): Promise<Measurement> {
  const model = modelForProvider("groq", "standard");
  // The clamp under measurement, asked of llm.ts itself rather than
  // reimplemented here — a measurement that computes its own idea of the budget
  // measures the copy, not the institution.
  const granted = groqGrantFor(system, user, ASKED);
  const base: Measurement = {
    provider: "groq", model, granted, finish: "-", reasoningTokens: null, completionTokens: null, contentChars: 0, complete: null,
  };
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model,
        temperature: 0.9,
        max_completion_tokens: granted,
        reasoning_effort: process.env.GROQ_REASONING_EFFORT || "low",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
    });
    const raw = await res.text();
    if (!res.ok) return { ...base, error: `HTTP ${res.status}: ${raw.slice(0, 160)}` };
    const body = JSON.parse(raw);
    const content: string = body?.choices?.[0]?.message?.content ?? "";
    return {
      ...base,
      finish: body?.choices?.[0]?.finish_reason ?? "?",
      reasoningTokens: body?.usage?.completion_tokens_details?.reasoning_tokens ?? null,
      completionTokens: body?.usage?.completion_tokens ?? null,
      contentChars: content.length,
      complete: closed(content, format),
    };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : String(e) };
  }
}

async function measureGemini(system: string, user: string, format: string): Promise<Measurement> {
  const model = modelForProvider("gemini", "standard");
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  const base: Measurement = {
    provider: "gemini", model, granted: ASKED, finish: "-", reasoningTokens: null, completionTokens: null, contentChars: 0, complete: null,
  };
  if (!key) return { ...base, granted: "-", error: "GEMINI_API_KEY not set" };
  try {
    // No per-request clamp: llm.ts passes maxOutputTokens straight through.
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: ASKED },
        }),
      },
    );
    const raw = await res.text();
    if (!res.ok) return { ...base, error: `HTTP ${res.status}: ${raw.slice(0, 160)}` };
    const body = JSON.parse(raw);
    const cand = body?.candidates?.[0];
    const content: string = cand?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    return {
      ...base,
      finish: cand?.finishReason ?? "?",
      reasoningTokens: body?.usageMetadata?.thoughtsTokenCount ?? null,
      completionTokens: body?.usageMetadata?.candidatesTokenCount ?? null,
      contentChars: content.length,
      complete: closed(content, format),
    };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) {
    console.error("usage: measure-production-budget.ts <dumped-prompt.json>");
    process.exit(1);
  }
  const { agent, format, system, user } = JSON.parse(fs.readFileSync(file, "utf8"));
  const promptTokens = estTokens(system) + estTokens(user);

  console.log(`measuring the production budget — ${agent}, medium ${format}`);
  console.log(`  prompt: ${system.length + user.length} chars, ~${promptTokens} tokens`);
  console.log(`  asked for: ${ASKED} completion tokens\n`);

  // One generation is an anecdote. Whether a work truncates depends on how
  // long that particular work wants to be, so the same prompt has to be run
  // more than once before the ceiling means anything.
  const sIdx = process.argv.indexOf("--samples");
  const samples = sIdx >= 0 ? Math.max(1, parseInt(process.argv[sIdx + 1], 10) || 1) : 1;

  const results: Measurement[] = [];
  for (let i = 0; i < samples; i++) {
    if (samples > 1) console.log(`── sample ${i + 1} of ${samples}`);
    for (const r of [await measureGroq(system, user, format), await measureGemini(system, user, format)]) {
      results.push(r);
      report(r, format);
    }
  }

  if (samples > 1) {
    console.log("── summary");
    for (const provider of ["groq", "gemini"]) {
      const mine = results.filter((r) => r.provider === provider && !r.error);
      if (!mine.length) continue;
      const truncated = mine.filter((r) => r.complete === false).length;
      console.log(`  ${provider}: ${truncated}/${mine.length} truncated`);
    }
  }
}

function report(r: Measurement, format: string) {
  {
    console.log(`  ${r.provider} (${r.model})`);
    if (r.error) { console.log(`    error: ${r.error}\n`); return; }
    console.log(`    granted        ${r.granted}${typeof r.granted === "number" && r.granted < ASKED ? `  ← clamped from ${ASKED}` : ""}`);
    console.log(`    finish_reason  ${r.finish}`);
    if (r.reasoningTokens !== null) console.log(`    reasoning      ${r.reasoningTokens} tokens spent before any content`);
    console.log(`    content        ${r.contentChars} chars in ${r.completionTokens ?? "?"} tokens (${charsPerToken(r.contentChars, r.completionTokens)} chars/token)`);
    // The usable ceiling is the grant MINUS what thinking already spent, times
    // the density of this medium. Multiplying the whole grant reported a
    // Gemini ceiling of ~13,000 chars in the same breath as MAX_TOKENS at
    // 9,064 — an instrument contradicting its own reading.
    if (typeof r.granted === "number") {
      const usable = r.granted - (r.reasoningTokens ?? 0);
      const density = Number(charsPerToken(r.contentChars, r.completionTokens));
      if (density > 0)
        console.log(`    ceiling        ~${Math.round(usable * density)} chars of ${format} — ${r.granted} granted less ${r.reasoningTokens ?? 0} spent thinking, at ${density} chars/token`);
    }
    console.log(`    complete       ${r.complete === null ? "unknown for this medium" : r.complete ? "yes" : "NO — truncated"}\n`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : String(e));
  process.exit(1);
});
