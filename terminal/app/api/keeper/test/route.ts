import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

/**
 * GET /api/keeper/test
 *
 * Diagnostic endpoint that verifies the Anthropic API connection
 * works from this Vercel function. Makes a minimal single-message
 * call with no tools, no system prompt, and max_tokens=50. Returns
 * the raw result or the full error detail.
 *
 * Safe to hit directly from a browser tab. Auth-gated by the proxy
 * like everything else in the terminal.
 */
export async function GET(): Promise<NextResponse> {
  const key = process.env.ANTHROPIC_API_KEY?.replace(/[\s\u0000-\u001F\u007F]/g, "");
  const model = process.env.ANTHROPIC_MODEL?.replace(/[\s\u0000-\u001F\u007F]/g, "") || "claude-sonnet-4-20250514";

  if (!key) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  try {
    const anthropic = new Anthropic({ apiKey: key });
    const response = await anthropic.messages.create({
      model,
      max_tokens: 50,
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "(no text)";

    return NextResponse.json({
      status: "ok",
      model,
      model_used: response.model,
      reply: text,
      usage: response.usage,
    });
  } catch (err) {
    const detail: Record<string, unknown> = {
      message: err instanceof Error ? err.message : String(err),
    };
    if (err instanceof Error) {
      const anyErr = err as Record<string, unknown>;
      if (anyErr.status) detail.http_status = anyErr.status;
      if (anyErr.error) detail.api_error = anyErr.error;
      if (anyErr.type) detail.error_type = anyErr.type;
    }
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
