import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { KEEPER_TOOLS } from "@/lib/keeper-tools";
import { buildSystemPrompt } from "@/lib/keeper";

export const runtime = "nodejs";
export const maxDuration = 60;

function sanitize(raw: string | undefined): string {
  return (raw || "").replace(/[\s\u0000-\u001F\u007F]/g, "");
}

/**
 * GET /api/keeper/test
 *
 * Diagnoses the system prompt. Level 1 + 2 already passed.
 * Now we inspect the system prompt itself.
 */
export async function GET(): Promise<NextResponse> {
  const key = sanitize(process.env.ANTHROPIC_API_KEY);
  const model = sanitize(process.env.ANTHROPIC_MODEL) || "claude-sonnet-4-20250514";
  const anthropic = new Anthropic({ apiKey: key });
  const results: Record<string, unknown> = { model };

  // Build the system prompt
  let systemPrompt: string;
  try {
    systemPrompt = await buildSystemPrompt();
    results.prompt_length = systemPrompt.length;
    results.prompt_first_200 = systemPrompt.slice(0, 200);
    results.prompt_last_200 = systemPrompt.slice(-200);

    // Check for control characters
    const controlChars: { pos: number; code: number; char: string }[] = [];
    for (let i = 0; i < systemPrompt.length; i++) {
      const code = systemPrompt.charCodeAt(i);
      if (code < 32 && code !== 10 && code !== 13 && code !== 9) {
        controlChars.push({ pos: i, code, char: `\\x${code.toString(16).padStart(2, "0")}` });
      }
    }
    results.control_chars_found = controlChars.length;
    if (controlChars.length > 0) {
      results.control_chars = controlChars.slice(0, 10);
    }
  } catch (e: unknown) {
    const err = e as { message?: string };
    results.build_prompt_error = err.message;
    return NextResponse.json(results);
  }

  // Try with the real system prompt
  try {
    const r = await anthropic.messages.create({
      model,
      max_tokens: 50,
      system: systemPrompt,
      tools: KEEPER_TOOLS,
      messages: [{ role: "user", content: "Status?" }],
    });
    results.real_prompt = "PASS";
    results.stop_reason = r.stop_reason;
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; error?: unknown };
    results.real_prompt = "FAIL";
    results.real_prompt_error = {
      message: err.message,
      status: err.status,
      body: err.error,
    };
  }

  // Try with a cleaned version (strip all control chars except newlines)
  const cleanedPrompt = systemPrompt.replace(/[^\x09\x0A\x0D\x20-\x7E\x80-\uFFFF]/g, "");
  if (cleanedPrompt.length !== systemPrompt.length) {
    results.cleaned_prompt_length = cleanedPrompt.length;
    results.chars_stripped = systemPrompt.length - cleanedPrompt.length;

    try {
      const r = await anthropic.messages.create({
        model,
        max_tokens: 50,
        system: cleanedPrompt,
        tools: KEEPER_TOOLS,
        messages: [{ role: "user", content: "Status?" }],
      });
      results.cleaned_prompt = "PASS";
    } catch (e: unknown) {
      const err = e as { message?: string; status?: number; error?: unknown };
      results.cleaned_prompt = "FAIL";
      results.cleaned_prompt_error = err.message;
    }
  } else {
    results.cleaned_prompt = "SAME_AS_ORIGINAL (no chars to strip)";

    // Try with a SHORT version of the prompt (first 500 chars) to see if it's length
    try {
      const r = await anthropic.messages.create({
        model,
        max_tokens: 50,
        system: systemPrompt.slice(0, 500),
        tools: KEEPER_TOOLS,
        messages: [{ role: "user", content: "Status?" }],
      });
      results.short_prompt = "PASS";
    } catch (e: unknown) {
      const err = e as { message?: string };
      results.short_prompt = "FAIL";
      results.short_prompt_error = err.message;
    }

    // Try WITHOUT tools but with full prompt
    try {
      const r = await anthropic.messages.create({
        model,
        max_tokens: 50,
        system: systemPrompt,
        messages: [{ role: "user", content: "Status?" }],
      });
      results.no_tools = "PASS";
    } catch (e: unknown) {
      const err = e as { message?: string };
      results.no_tools = "FAIL";
      results.no_tools_error = err.message;
    }
  }

  return NextResponse.json(results);
}
