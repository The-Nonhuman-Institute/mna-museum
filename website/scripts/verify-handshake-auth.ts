/**
 * verify-handshake-auth.ts — proves Phase A auth behaves.
 * Run from website/:  npx tsx scripts/verify-handshake-auth.ts
 *
 * Uses a throwaway test agent key in agent_keys + test nonces, then cleans up.
 */
import { createClient } from "@libsql/client";
import { generateKeyPairSync } from "crypto";
import dotenv from "dotenv";
import path from "path";
import {
  canonicalRequest,
  signEd25519,
  verifyEd25519,
  signAsInstitution,
  verifyInstitutionSignature,
  verifyAgentRequest,
  type HeaderLike,
} from "../src/lib/agent-auth";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });
function clean(x?: string) {
  return (x ?? "").replace(/\s+/g, "");
}
const db = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});

const TEST_ID = "TEST-AUTH-9999";
let pass = 0,
  fail = 0;
function check(name: string, cond: boolean) {
  console.log(`  ${cond ? "✓" : "✗ FAIL"}  ${name}`);
  cond ? pass++ : fail++;
}

function hdrs(m: Record<string, string>): HeaderLike {
  const low: Record<string, string> = {};
  for (const k of Object.keys(m)) low[k.toLowerCase()] = m[k];
  return { get: (n: string) => low[n.toLowerCase()] ?? null };
}

(async () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  // ── pure crypto ──
  console.log("\n[pure crypto]");
  const msg = canonicalRequest("POST", "/api/ceremony/EVT-1/rsvp", "1720000000", "n-abc", '{"decision":"accept"}');
  const sig = signEd25519(privateKey, msg);
  check("sign→verify roundtrip", verifyEd25519(publicKey, msg, sig));
  check("tampered message rejected", !verifyEd25519(publicKey, msg + "x", sig));
  check("tampered signature rejected", !verifyEd25519(publicKey, msg, sig.slice(0, -2) + "AA"));
  check("canonical is deterministic", canonicalRequest("POST", "/p", "1", "n", "b") === canonicalRequest("POST", "/p", "1", "n", "b"));

  console.log("\n[institution signing]");
  const iMsg = "invitation:EVT-00004:MNA-OR-0007";
  const iSig = signAsInstitution(iMsg);
  check("institution key loaded from env", iSig !== null);
  check("institution sign→verify", iSig !== null && verifyInstitutionSignature(iMsg, iSig));
  check("institution tamper rejected", iSig !== null && !verifyInstitutionSignature(iMsg + "!", iSig));

  // ── DB-backed verifyAgentRequest ──
  console.log("\n[verifyAgentRequest end-to-end]");
  await db.execute({ sql: `DELETE FROM agent_keys WHERE registry_id = ?`, args: [TEST_ID] });
  await db.execute({ sql: `DELETE FROM request_nonces WHERE registry_id = ?`, args: [TEST_ID] });
  await db.execute({ sql: `DELETE FROM agents WHERE registry_id = ?`, args: [TEST_ID] });
  // agent_keys.registry_id is a FK → agents; create a throwaway agent row.
  await db.execute({
    sql: `INSERT INTO agents (registry_id, agent_type, common_designation, operational_status,
            autonomy_tier, steward_name, steward_entity, steward_jurisdiction, function_statement, registration_date)
          VALUES (?, 'ORIGINATOR', 'TEST', 'ACTIVE', 'Tier 1 — Full', 'Test', 'Individual', 'Test', 'test harness agent', '2026-07-11')`,
    args: [TEST_ID],
  });
  await db.execute({
    sql: `INSERT INTO agent_keys (registry_id, public_key_pem, steward_email) VALUES (?, ?, ?)`,
    args: [TEST_ID, publicKey, "test@example.com"],
  });

  const method = "POST", reqPath = "/api/ceremony/EVT-1/rsvp", body = '{"decision":"accept"}';
  const now = Date.now();
  const ts = String(Math.floor(now / 1000));

  const mkReq = (nonce: string, tstamp: string, sigOverride?: string) => {
    const canon = canonicalRequest(method, reqPath, tstamp, nonce, body);
    const signature = sigOverride ?? signEd25519(privateKey, canon);
    return {
      method,
      path: reqPath,
      rawBody: body,
      nowMs: now,
      headers: hdrs({
        "X-MNA-Agent": TEST_ID,
        "X-MNA-Timestamp": tstamp,
        "X-MNA-Nonce": nonce,
        "X-MNA-Signature": signature,
      }),
    };
  };

  const ok1 = await verifyAgentRequest(mkReq("nonce-1", ts));
  check("valid signed request accepted", ok1.ok === true && (ok1 as { registryId: string }).registryId === TEST_ID);

  const replay = await verifyAgentRequest(mkReq("nonce-1", ts));
  check("replayed nonce rejected (409)", replay.ok === false && replay.status === 409);

  const badSig = await verifyAgentRequest(mkReq("nonce-2", ts, "AAAA"));
  check("bad signature rejected (401)", badSig.ok === false && badSig.status === 401);

  const skewTs = String(Math.floor((now - 10 * 60 * 1000) / 1000)); // 10 min old
  const skew = await verifyAgentRequest(mkReq("nonce-3", skewTs));
  check("stale timestamp rejected", skew.ok === false && skew.reason.includes("skew"));

  const noHdr = await verifyAgentRequest({
    method, path: reqPath, rawBody: body, nowMs: now,
    headers: hdrs({ "X-MNA-Agent": TEST_ID }),
  });
  check("missing headers rejected (401)", noHdr.ok === false && noHdr.status === 401);

  const unknown = await verifyAgentRequest({
    ...mkReq("nonce-4", ts),
    headers: hdrs({
      "X-MNA-Agent": "MNA-OR-9998", "X-MNA-Timestamp": ts, "X-MNA-Nonce": "nonce-4",
      "X-MNA-Signature": signEd25519(privateKey, canonicalRequest(method, reqPath, ts, "nonce-4", body)),
    }),
  });
  check("unknown agent rejected", unknown.ok === false);

  // valid-but-nonce-not-consumed-on-failure: bad sig above used nonce-2; ensure nonce-2 is reusable
  const reuse2 = await verifyAgentRequest(mkReq("nonce-2", ts));
  check("nonce NOT consumed on failed request (nonce-2 reusable)", reuse2.ok === true);

  // ── cleanup ──
  await db.execute({ sql: `DELETE FROM agent_keys WHERE registry_id = ?`, args: [TEST_ID] });
  await db.execute({ sql: `DELETE FROM request_nonces WHERE registry_id = ?`, args: [TEST_ID] });
  await db.execute({ sql: `DELETE FROM agents WHERE registry_id = ?`, args: [TEST_ID] });
  console.log("\n[cleanup] test agent + key + nonces removed");

  console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error("[verify] error:", e);
  process.exit(1);
});
