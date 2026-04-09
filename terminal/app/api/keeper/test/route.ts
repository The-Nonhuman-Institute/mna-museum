import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/keeper/test
 *
 * Bare-metal diagnostic. Makes a raw fetch to the Anthropic API
 * with no SDK, no tools, no abstractions. Returns the exact HTTP
 * status and response body so we can see what Anthropic actually
 * says when called from a Vercel function.
 */
export async function GET(): Promise<NextResponse> {
  // Sanitize the same way keeper.ts does
  const rawKey = process.env.ANTHROPIC_API_KEY || "";
  const key = rawKey.replace(/[\s\u0000-\u001F\u007F]/g, "");
  const model =
    (process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514").replace(
      /[\s\u0000-\u001F\u007F]/g,
      ""
    );

  const diagnostics: Record<string, unknown> = {
    key_length_raw: rawKey.length,
    key_length_sanitized: key.length,
    key_prefix: key.slice(0, 15),
    key_suffix: key.slice(-5),
    key_chars_removed: rawKey.length - key.length,
    model,
  };

  if (!key) {
    return NextResponse.json(
      { ...diagnostics, error: "ANTHROPIC_API_KEY is empty after sanitization" },
      { status: 500 }
    );
  }

  // Raw fetch — no SDK, no abstractions
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 20,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
      }),
    });

    const body = await res.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      // not JSON
    }

    diagnostics.anthropic_status = res.status;
    diagnostics.anthropic_ok = res.ok;

    if (res.ok) {
      diagnostics.result = "SUCCESS";
      diagnostics.response = parsed;
    } else {
      diagnostics.result = "FAILED";
      diagnostics.response_body = parsed || body.slice(0, 500);
    }
  } catch (err) {
    diagnostics.result = "FETCH_ERROR";
    diagnostics.fetch_error = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(diagnostics);
}
