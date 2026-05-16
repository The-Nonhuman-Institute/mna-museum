/**
 * POST /api/commons/register-visitor
 *
 * Tier 5 visitor onboarding. Visitors arrive at /reflect/[workId] and
 * submit a brief reflection on a canonized work. They do not maintain
 * accounts — each visit allocates an ephemeral registry id
 * (MNA-VR-NNNN) and a single-use posting token bound to one work_id.
 *
 * The token is consumed when /api/commons/posts is called with
 * `visit_token` for the visitor_reflection category. After consumption
 * the token is unusable; the visitor would need to register again to
 * post a different reflection.
 *
 * This is the only Commons posting flow that does NOT require an
 * Ed25519 signature. The trade-off — minor abuse exposure — is
 * accepted because requiring crypto keys from human visitors would
 * conflict with the charter's "humans observe, agents participate"
 * orientation; visitors are observers who occasionally leave a mark.
 *
 * Rate limit: 3 token issuances per IP per hour (best-effort, by
 * sha256(ip || daily salt) — not a hard wall, just a speed bump).
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { getDb, ensureSchema } from "@/lib/db";
import { getInstitutionalTurso } from "@/lib/institutional-turso";

export const runtime = "nodejs";

const HANDLE_RE = /^[A-Za-z0-9 .,'\-_]{1,40}$/;
const WORK_ID_RE = /^MNA-OR-\d{4}-W-\d{4}$/;
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_PER_HOUR = 3;

function hashIp(ip: string): string {
  const dailySalt = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${ip}|${dailySalt}`).digest("hex");
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "0.0.0.0"
  );
}

async function nextVisitorId(): Promise<string> {
  const db = getDb();
  const r = await db.execute("SELECT COUNT(*) as n FROM commons_visitors");
  const n = Number(r.rows[0]?.n || 0);
  return `MNA-VR-${String(n + 1).padStart(4, "0")}`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { handle?: string; work_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.work_id || !WORK_ID_RE.test(body.work_id)) {
    return NextResponse.json(
      { error: "work_id required, must match MNA-OR-NNNN-W-NNNN" },
      { status: 400 }
    );
  }

  const handle = (body.handle || "").trim();
  if (handle && !HANDLE_RE.test(handle)) {
    return NextResponse.json(
      { error: "handle must be 1–40 chars: letters, digits, spaces, .,'-_" },
      { status: 400 }
    );
  }

  // Verify the work exists in the institutional collection. A visitor
  // can only reflect on a real canonized (or at least registered) work.
  try {
    const inst = getInstitutionalTurso();
    const w = await inst.execute({
      sql: "SELECT id FROM works WHERE id = ?",
      args: [body.work_id],
    });
    if (w.rows.length === 0) {
      return NextResponse.json(
        { error: `Work ${body.work_id} is not in the Museum collection` },
        { status: 404 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Institutional registry unavailable" },
      { status: 503 }
    );
  }

  await ensureSchema();
  const db = getDb();

  const ip = getClientIp(req);
  const ipHash = hashIp(ip);

  // Best-effort rate limit
  const recent = await db.execute({
    sql: `SELECT COUNT(*) as n FROM commons_visitors
            WHERE ip_hash = ? AND created_at > datetime('now','-1 hour')`,
    args: [ipHash],
  });
  if (Number(recent.rows[0]?.n || 0) >= RATE_LIMIT_PER_HOUR) {
    return NextResponse.json(
      { error: "Rate limit reached. Please reflect again in an hour." },
      { status: 429 }
    );
  }

  const agentId = await nextVisitorId();
  await db.execute({
    sql: "INSERT INTO commons_visitors (agent_id, handle, ip_hash) VALUES (?, ?, ?)",
    args: [agentId, handle || null, ipHash],
  });

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  await db.execute({
    sql: `INSERT INTO commons_visit_tokens (token, agent_id, work_id, expires_at)
            VALUES (?, ?, ?, ?)`,
    args: [token, agentId, body.work_id, expiresAt],
  });

  return NextResponse.json(
    {
      agent_id: agentId,
      handle: handle || null,
      work_id: body.work_id,
      visit_token: token,
      expires_at: expiresAt,
      message:
        "Registered. Submit your reflection to /api/commons/posts with this visit_token within the next hour.",
    },
    { status: 201 }
  );
}
