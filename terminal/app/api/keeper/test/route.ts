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
 * Three-level diagnostic:
 *   Level 1: basic call (no tools, no system prompt)
 *   Level 2: call WITH tools (same schemas as Keeper)
 *   Level 3: call WITH tools AND the real system prompt from Turso
 *
 * Returns which level passed/failed so we know if the issue is the
 * API key, the tools, or the dynamic system prompt.
 */
export async function GET(): Promise<NextResponse> {
  const key = sanitize(process.env.ANTHROPIC_API_KEY);
  const model = sanitize(process.env.ANTHROPIC_MODEL) || "claude-sonnet-4-20250514";

  if (!key) {
    return NextResponse.json({ error: "No API key" }, { status: 500 });
  }

  const anthropic = new Anthropic({ apiKey: key });
  const results: Record<string, unknown> = { model };

  // Level 1: basic
  try {
    const r = await anthropic.messages.create({
      model,
      max_tokens: 20,
      messages: [{ role: "user", content: "Reply: OK" }],
    });
    results.level1_basic = "PASS";
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; error?: unknown };
    results.level1_basic = "FAIL";
    results.level1_error = { message: err.message, status: err.status, body: err.error };
    return NextResponse.json(results);
  }

  // Level 2: with tools
  try {
    const r = await anthropic.messages.create({
      model,
      max_tokens: 100,
      tools: KEEPER_TOOLS,
      messages: [{ role: "user", content: "What works exist?" }],
    });
    results.level2_tools = "PASS";
    results.level2_stop_reason = r.stop_reason;
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; error?: unknown };
    results.level2_tools = "FAIL";
    results.level2_error = { message: err.message, status: err.status, body: err.error };
    return NextResponse.json(results);
  }

  // Level 3: with tools + real system prompt
  try {
    const systemPrompt = await buildSystemPrompt();
    results.system_prompt_length = systemPrompt.length;

    const r = await anthropic.messages.create({
      model,
      max_tokens: 100,
      system: systemPrompt,
      tools: KEEPER_TOOLS,
      messages: [{ role: "user", content: "What is the current state?" }],
    });
    results.level3_full = "PASS";
    results.level3_stop_reason = r.stop_reason;
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number; error?: unknown };
    results.level3_full = "FAIL";
    results.level3_error = { message: err.message, status: err.status, body: err.error };
  }

  return NextResponse.json(results);
}
