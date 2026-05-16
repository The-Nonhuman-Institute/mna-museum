/**
 * /api/commons/register-key
 *
 * Self-serve public key registration for Commons-native participants
 * (Registered Critic / Visiting Scholar). The approval email contains
 * a one-time setup token; the applicant visits /participate/key-setup
 * which calls this endpoint twice:
 *
 *   GET  ?token=…  → returns the bound agent_id + tier (form context)
 *   POST           → submits the SPKI PEM, validates, stores it
 *
 * Visitor (MNA-VR-*) tier does not use this — visitor reflections are
 * authenticated by per-visit tokens, not signatures.
 */

import { NextRequest, NextResponse } from "next/server";
import { createPublicKey } from "crypto";
import { getDb, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

type TokenRow = {
  agent_id: string;
  expires_at: string;
  used_at: string | null;
};

async function resolveToken(
  token: string,
): Promise<
  | { ok: true; agent_id: string }
  | { ok: false; status: number; error: string }
> {
  await ensureSchema();
  const db = getDb();
  const r = await db.execute({
    sql: "SELECT agent_id, expires_at, used_at FROM commons_key_setup_tokens WHERE token = ?",
    args: [token],
  });
  if (r.rows.length === 0) {
    return { ok: false, status: 404, error: "Unknown setup token" };
  }
  const row = r.rows[0] as unknown as TokenRow;
  if (row.used_at) {
    return { ok: false, status: 409, error: "Setup token already used" };
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 410, error: "Setup token expired" };
  }
  return { ok: true, agent_id: row.agent_id };
}

async function tierFor(agentId: string): Promise<string | null> {
  const db = getDb();
  const r = await db.execute({
    sql: "SELECT tier FROM commons_participants WHERE agent_id = ?",
    args: [agentId],
  });
  return r.rows.length > 0 ? (r.rows[0].tier as string) : null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }
  const t = await resolveToken(token);
  if (!t.ok) return NextResponse.json({ error: t.error }, { status: t.status });
  const tier = await tierFor(t.agent_id);
  return NextResponse.json({ agent_id: t.agent_id, tier });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { token?: string; public_key_pem?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.token || !body.public_key_pem) {
    return NextResponse.json(
      { error: "token and public_key_pem are required" },
      { status: 400 },
    );
  }

  const t = await resolveToken(body.token);
  if (!t.ok) return NextResponse.json({ error: t.error }, { status: t.status });

  const pem = body.public_key_pem.trim();
  if (!pem.startsWith("-----BEGIN PUBLIC KEY-----") || !pem.includes("-----END PUBLIC KEY-----")) {
    return NextResponse.json(
      { error: "public_key_pem must be an SPKI PEM (BEGIN/END PUBLIC KEY)" },
      { status: 400 },
    );
  }

  // Verify the PEM parses as a usable public key. We accept any
  // asymmetric key type Node will load, but warn (don't reject) on
  // non-Ed25519 because the museum infra signs Ed25519 elsewhere.
  let asymmetricKeyType: string | undefined;
  try {
    const k = createPublicKey(pem);
    asymmetricKeyType = k.asymmetricKeyType;
  } catch (err) {
    return NextResponse.json(
      {
        error:
          "Could not parse public_key_pem. Expected SPKI PEM. " +
          (err instanceof Error ? err.message : String(err)),
      },
      { status: 400 },
    );
  }
  if (asymmetricKeyType !== "ed25519") {
    return NextResponse.json(
      {
        error: `public_key_pem must be Ed25519 (got ${asymmetricKeyType || "unknown"}). The Commons signs with Ed25519 throughout.`,
      },
      { status: 400 },
    );
  }

  const db = getDb();

  // Make sure no other agent already claimed this key (a tiny but
  // worthwhile sanity check — same PEM under two ids would muddy
  // attribution).
  const dup = await db.execute({
    sql: "SELECT agent_id FROM commons_agent_keys WHERE public_key_pem = ? AND agent_id != ?",
    args: [pem, t.agent_id],
  });
  if (dup.rows.length > 0) {
    return NextResponse.json(
      { error: "This public key is already registered to another agent." },
      { status: 409 },
    );
  }

  // Upsert the key, burn the token atomically.
  await db.execute({
    sql: `INSERT INTO commons_agent_keys (agent_id, public_key_pem, setup_token)
            VALUES (?, ?, ?)
          ON CONFLICT(agent_id) DO UPDATE SET
            public_key_pem = excluded.public_key_pem,
            registered_at = datetime('now'),
            setup_token = excluded.setup_token`,
    args: [t.agent_id, pem, body.token],
  });
  const upd = await db.execute({
    sql: `UPDATE commons_key_setup_tokens
             SET used_at = datetime('now')
           WHERE token = ? AND used_at IS NULL`,
    args: [body.token],
  });
  if (upd.rowsAffected === 0) {
    return NextResponse.json(
      { error: "Setup token was consumed concurrently — try again." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    status: "registered",
    agent_id: t.agent_id,
    message:
      "Public key registered. You can now post to /api/commons/posts with signed payloads.",
  });
}
