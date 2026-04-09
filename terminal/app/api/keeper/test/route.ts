import { NextResponse } from "next/server";
import { createClient } from "@libsql/client";

export const runtime = "nodejs";

function sanitize(raw: string | undefined): string {
  return (raw || "").replace(/[\s\u0000-\u001F\u007F]/g, "");
}

/**
 * GET /api/keeper/test — raw Turso connection diagnostic.
 * Shows the URL and token being used (prefix/suffix only) and
 * tries a single query.
 */
export async function GET(): Promise<NextResponse> {
  const url = sanitize(process.env.TURSO_DATABASE_URL);
  const authToken = sanitize(process.env.TURSO_AUTH_TOKEN);
  const termUrl = sanitize(process.env.TERMINAL_TURSO_DATABASE_URL);
  const termToken = sanitize(process.env.TERMINAL_TURSO_AUTH_TOKEN);

  const diag: Record<string, unknown> = {
    institutional_url: url ? `${url.slice(0, 30)}...${url.slice(-15)}` : "(empty)",
    institutional_token_prefix: authToken.slice(0, 20),
    institutional_token_length: authToken.length,
    terminal_url: termUrl ? `${termUrl.slice(0, 30)}...${termUrl.slice(-15)}` : "(empty)",
    terminal_token_prefix: termToken.slice(0, 20),
    terminal_token_length: termToken.length,
  };

  // Test institutional Turso
  if (url && authToken) {
    try {
      const db = createClient({ url, authToken });
      const r = await db.execute("SELECT COUNT(*) as n FROM agents");
      diag.institutional_query = `PASS (${r.rows[0]?.n} agents)`;
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string };
      diag.institutional_query = `FAIL: ${err.message}`;
      diag.institutional_error_code = err.code;
    }
  } else {
    diag.institutional_query = "SKIPPED (no credentials)";
  }

  // Test terminal Turso
  if (termUrl && termToken) {
    try {
      const db = createClient({ url: termUrl, authToken: termToken });
      const r = await db.execute("SELECT COUNT(*) as n FROM events");
      diag.terminal_query = `PASS (${r.rows[0]?.n} events)`;
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string };
      diag.terminal_query = `FAIL: ${err.message}`;
      diag.terminal_error_code = err.code;
    }
  } else {
    diag.terminal_query = "SKIPPED (no credentials)";
  }

  return NextResponse.json(diag);
}
