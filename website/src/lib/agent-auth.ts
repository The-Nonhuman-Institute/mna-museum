/**
 * agent-auth.ts — Network-Originator Handshake, Phase A: mutual authentication.
 *
 * Every network agent already has an Ed25519 keypair (created at
 * /api/register/activate; the SPKI-PEM public key is stored in agent_keys).
 * This module lets:
 *   - the institution VERIFY a signed request from an agent
 *     (verifyAgentRequest) — the trust anchor that lets the record assert
 *     "the agent authored this";
 *   - the institution SIGN a payload to an agent (signAsInstitution) so the
 *     agent can trust an invitation is genuinely from MNA.
 *
 * Canonical string signed on every agent→institution call (spec §5):
 *   METHOD \n PATH \n TIMESTAMP \n NONCE \n SHA256_HEX(body)
 * carried in headers: X-MNA-Agent, X-MNA-Timestamp, X-MNA-Nonce, X-MNA-Signature.
 */
import {
  createHash,
  createPublicKey,
  createPrivateKey,
  sign as edSign,
  verify as edVerify,
  type KeyObject,
} from "crypto";
import { getWriteDb } from "@/lib/registration-db";

export const MAX_SKEW_SECONDS = 300; // ±5 minutes

/** The institution's public signing key — safe to embed (it is public).
 *  Also published at /.well-known/mna-institution-key for agents to fetch. */
export const INSTITUTION_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA11Wshn2qL5B/EOsbOYrCoo7//1c/nvtJicXGv6dro9M=
-----END PUBLIC KEY-----
`;

// ─── pure crypto ─────────────────────────────────────────────────────────────

export function sha256Hex(body: string | Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

/** The exact string that gets signed for an agent→institution request. */
export function canonicalRequest(
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  body: string | Uint8Array,
): string {
  return [method.toUpperCase(), path, timestamp, nonce, sha256Hex(body)].join("\n");
}

/** Ed25519 sign a message with a PKCS8-PEM private key → base64 signature. */
export function signEd25519(privateKeyPem: string, message: string): string {
  const key = createPrivateKey(privateKeyPem);
  return edSign(null, Buffer.from(message, "utf8"), key).toString("base64");
}

/** Ed25519 verify a base64 signature against an SPKI-PEM public key. */
export function verifyEd25519(
  publicKeyPem: string,
  message: string,
  signatureB64: string,
): boolean {
  let key: KeyObject;
  try {
    key = createPublicKey(publicKeyPem);
  } catch {
    return false;
  }
  try {
    return edVerify(null, Buffer.from(message, "utf8"), key, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

// ─── institution signing ─────────────────────────────────────────────────────

function institutionPrivateKey(): KeyObject | null {
  const b64 = process.env.MNA_INSTITUTION_PRIVATE_KEY_B64;
  if (!b64) return null;
  try {
    return createPrivateKey(Buffer.from(b64, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/** Sign a payload AS the institution → base64 signature (null if key absent). */
export function signAsInstitution(message: string): string | null {
  const key = institutionPrivateKey();
  if (!key) return null;
  return edSign(null, Buffer.from(message, "utf8"), key).toString("base64");
}

/** Verify a signature that claims to be from the institution. */
export function verifyInstitutionSignature(message: string, signatureB64: string): boolean {
  return verifyEd25519(INSTITUTION_PUBLIC_KEY_PEM, message, signatureB64);
}

export function getInstitutionPublicKeyPem(): string {
  return INSTITUTION_PUBLIC_KEY_PEM;
}

// ─── agent → institution request verification ────────────────────────────────

export type AgentAuthOk = { ok: true; registryId: string };
export type AgentAuthFail = { ok: false; reason: string; status: number };
export type AgentAuthResult = AgentAuthOk | AgentAuthFail;

function parseTimestampMs(ts: string): number | null {
  if (/^\d+$/.test(ts)) {
    const n = Number(ts);
    // heuristic: 10 digits = seconds, 13 = milliseconds
    return ts.length <= 10 ? n * 1000 : n;
  }
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? null : parsed;
}

export type HeaderLike = { get(name: string): string | null };

/**
 * Verify a signed agent request end-to-end: signature, clock skew, and
 * single-use nonce (replay protection). On success returns the authenticated
 * registryId. Never records a nonce for a request that fails signature/skew.
 *
 * `nowMs` is injectable for testing.
 */
export async function verifyAgentRequest(args: {
  method: string;
  path: string;
  headers: HeaderLike;
  rawBody: string | Uint8Array;
  nowMs?: number;
}): Promise<AgentAuthResult> {
  const { method, path, headers, rawBody } = args;
  const now = args.nowMs ?? Date.now();

  const registryId = headers.get("x-mna-agent");
  const timestamp = headers.get("x-mna-timestamp");
  const nonce = headers.get("x-mna-nonce");
  const signature = headers.get("x-mna-signature");

  if (!registryId || !timestamp || !nonce || !signature) {
    return { ok: false, reason: "missing X-MNA-* auth headers", status: 401 };
  }

  // 1. clock skew (cheap, no DB)
  const tsMs = parseTimestampMs(timestamp);
  if (tsMs === null) {
    return { ok: false, reason: "unparseable X-MNA-Timestamp", status: 401 };
  }
  if (Math.abs(now - tsMs) > MAX_SKEW_SECONDS * 1000) {
    return { ok: false, reason: "timestamp outside allowed skew", status: 401 };
  }

  // 2. signature against the agent's registered public key
  const db = getWriteDb();
  const keyRow = await db.execute({
    sql: `SELECT public_key_pem FROM agent_keys WHERE registry_id = ?`,
    args: [registryId],
  });
  if (keyRow.rows.length === 0) {
    return { ok: false, reason: `no key on file for ${registryId}`, status: 401 };
  }
  const publicKeyPem = String((keyRow.rows[0] as Record<string, unknown>).public_key_pem);
  const canonical = canonicalRequest(method, path, timestamp, nonce, rawBody);
  if (!verifyEd25519(publicKeyPem, canonical, signature)) {
    return { ok: false, reason: "signature verification failed", status: 401 };
  }

  // 3. single-use nonce (replay protection) — consumed only after sig+skew pass
  const ins = await db.execute({
    sql: `INSERT INTO request_nonces (nonce, registry_id) VALUES (?, ?) ON CONFLICT(nonce) DO NOTHING`,
    args: [nonce, registryId],
  });
  if (ins.rowsAffected === 0) {
    return { ok: false, reason: "nonce already used (replay)", status: 409 };
  }

  return { ok: true, registryId };
}
