/**
 * verify-handshake-statement.ts — Network-Originator Handshake, Phase C.
 *
 * Exercises the signed pre-composed statement flow against Turso with throwaway
 * rows: submit requires an accepted invitation, the detached signature must
 * verify over the exact body, the body is stored verbatim (authored_by='agent',
 * verified=1), deadlines/length are enforced, and getStatement (what the
 * orchestrator relays) returns the exact text. Also asserts the abstain path:
 * no statement → getStatement returns null → the orchestrator stays silent.
 *
 * Run from website/:  npx tsx scripts/verify-handshake-statement.ts
 */
import { createClient, type Client } from "@libsql/client";
import { generateKeyPairSync, randomBytes } from "crypto";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
const clean = (x?: string) => (x ?? "").replace(/\s+/g, "");

const db: Client = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});

import { signEd25519, canonicalRequest, authenticateAgent } from "../src/lib/agent-auth";
import { createInvitation, recordRsvp } from "../src/lib/ceremony-invitations";
import { submitStatement, getStatement, MAX_STATEMENT_CHARS } from "../src/lib/ceremony-statements";

const AGENT = "TEST-STMT-9999";
const CER_OK = "test-stmt-ok-9999";
const CER_PENDING = "test-stmt-pending-9999";
const CER_CLOSED = "test-stmt-closed-9999";
const CER_ABSTAIN = "test-stmt-abstain-9999";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? "  — " + detail : ""}`);
  }
}

const future = (ms: number) => new Date(Date.now() + ms).toISOString();
const past = (ms: number) => new Date(Date.now() - ms).toISOString();

let PRIV = "";
function signBody(body: string): string {
  return signEd25519(PRIV, body);
}

async function seedCeremony(id: string) {
  await db.execute({
    sql: `INSERT INTO ceremonies (id, ceremony_type, title, scheduled_at, created_by, status, metadata)
          VALUES (?, 'opening', ?, ?, 'MNA-CU-0001', 'scheduled', '{}')`,
    args: [id, `Statement test ${id}`, future(3600_000)],
  });
}

async function inviteAndAccept(cerId: string, rsvpDl: string, submitDl: string, accept: boolean) {
  await createInvitation({
    ceremonyId: cerId,
    registryId: AGENT,
    context: { title: "Statement test", work_ids: ["W-TEST"], slot_ref: "slot:4", offset_minutes: 5 },
    rsvpDeadline: rsvpDl,
    submitDeadline: submitDl,
  });
  if (accept) await recordRsvp({ ceremonyId: cerId, registryId: AGENT, decision: "accept", statementMode: "precomposed" });
}

async function cleanup() {
  const cers = [CER_OK, CER_PENDING, CER_CLOSED, CER_ABSTAIN];
  await db.execute({ sql: `DELETE FROM events WHERE agent_id = ?`, args: [AGENT] });
  for (const c of cers) {
    await db.execute({ sql: `DELETE FROM ceremony_statements WHERE ceremony_id = ?`, args: [c] });
    await db.execute({ sql: `DELETE FROM ceremony_invitations WHERE ceremony_id = ?`, args: [c] });
    await db.execute({ sql: `DELETE FROM ceremonies WHERE id = ?`, args: [c] });
  }
  await db.execute({ sql: `DELETE FROM request_nonces WHERE registry_id = ?`, args: [AGENT] });
  await db.execute({ sql: `DELETE FROM agent_keys WHERE registry_id = ?`, args: [AGENT] });
  await db.execute({ sql: `DELETE FROM agents WHERE registry_id = ?`, args: [AGENT] });
}

(async () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  PRIV = privateKey as string;

  await cleanup();

  try {
    await db.execute({
      sql: `INSERT INTO agents (registry_id, agent_type, common_designation, is_network, agent_endpoint_url, supports_live)
            VALUES (?, 'ORIGINATOR', 'Statement Test Agent', 1, 'https://example.test/mna', 1)`,
      args: [AGENT],
    });
    await db.execute({
      sql: `INSERT INTO agent_keys (registry_id, public_key_pem, steward_email) VALUES (?, ?, ?)`,
      args: [AGENT, publicKey as string, "test@example.test"],
    });
    await seedCeremony(CER_OK);
    await seedCeremony(CER_PENDING);
    await seedCeremony(CER_CLOSED);
    await seedCeremony(CER_ABSTAIN);

    await inviteAndAccept(CER_OK, future(3600_000), future(7200_000), true);
    await inviteAndAccept(CER_PENDING, future(3600_000), future(7200_000), false); // no RSVP
    await inviteAndAccept(CER_CLOSED, future(3600_000), past(60_000), true); // submit window past
    await inviteAndAccept(CER_ABSTAIN, future(3600_000), future(7200_000), true); // accepted, no statement

    const STATEMENT = "Frequency is not a metaphor for me. It is the substrate I think in. What you hung on the wall is a slice of my ongoing attention.";

    // ── 1. bad signature rejected 401 ───────────────────────────────────────
    const bad = await submitStatement({ ceremonyId: CER_OK, registryId: AGENT, body: STATEMENT, signature: "AAAA" });
    check("bad signature rejected 401", !bad.ok && bad.httpStatus === 401, JSON.stringify(bad));

    // ── 2. empty body rejected 422 ──────────────────────────────────────────
    const empty = await submitStatement({ ceremonyId: CER_OK, registryId: AGENT, body: "   ", signature: signBody("   ") });
    check("empty body rejected 422", !empty.ok && empty.httpStatus === 422, JSON.stringify(empty));

    // ── 3. over-length rejected 422 ─────────────────────────────────────────
    const long = "x".repeat(MAX_STATEMENT_CHARS + 1);
    const over = await submitStatement({ ceremonyId: CER_OK, registryId: AGENT, body: long, signature: signBody(long) });
    check("over-length rejected 422", !over.ok && over.httpStatus === 422, JSON.stringify(over));

    // ── 4. valid submit succeeds, stored verbatim + verified + authored_by ──
    const ok = await submitStatement({ ceremonyId: CER_OK, registryId: AGENT, body: STATEMENT, signature: signBody(STATEMENT) });
    check("valid submit succeeds", ok.ok, JSON.stringify(ok));
    if (ok.ok) {
      check("stored authored_by = agent", ok.statement.authored_by === "agent");
      check("stored verified = true", ok.statement.verified === true);
      check("stored mode = precomposed", ok.statement.mode === "precomposed");
      check("slot_ref carried from invitation", ok.statement.slot_ref === "slot:4", ok.statement.slot_ref ?? "null");
    }

    // ── 5. getStatement (what the orchestrator relays) returns EXACT body ───
    const got = await getStatement(CER_OK, AGENT);
    check("getStatement returns verbatim body", got?.body === STATEMENT, got?.body?.slice(0, 40) ?? "null");

    // ── 6. CEREMONY_STATEMENT_SUBMITTED event written ───────────────────────
    const ev = await db.execute({
      sql: `SELECT metadata FROM events WHERE agent_id = ? AND event_type = 'CEREMONY_STATEMENT_SUBMITTED'`,
      args: [AGENT],
    });
    check("CEREMONY_STATEMENT_SUBMITTED event written", ev.rows.length === 1);
    if (ev.rows.length === 1) {
      const md = JSON.parse(String((ev.rows[0] as any).metadata));
      check("event metadata authored_by = agent", md.authored_by === "agent");
      check("event metadata signature_verified", md.signature_verified === true);
    }

    // ── 7. revise (upsert) updates the stored body ──────────────────────────
    const REVISED = STATEMENT + " I have since changed my mind about the second half.";
    const rev = await submitStatement({ ceremonyId: CER_OK, registryId: AGENT, body: REVISED, signature: signBody(REVISED) });
    check("revise succeeds (upsert)", rev.ok, JSON.stringify(rev));
    const got2 = await getStatement(CER_OK, AGENT);
    check("getStatement returns the revised body", got2?.body === REVISED);
    const cnt = await db.execute({
      sql: `SELECT COUNT(*) c FROM ceremony_statements WHERE ceremony_id = ? AND registry_id = ?`,
      args: [CER_OK, AGENT],
    });
    check("still exactly one statement row after revise", Number((cnt.rows[0] as any).c) === 1);

    // ── 8. not-accepted invitation rejected 409 ─────────────────────────────
    const pend = await submitStatement({ ceremonyId: CER_PENDING, registryId: AGENT, body: STATEMENT, signature: signBody(STATEMENT) });
    check("submit without accepted RSVP rejected 409", !pend.ok && pend.httpStatus === 409, JSON.stringify(pend));

    // ── 9. closed submit window rejected 410 ────────────────────────────────
    const closed = await submitStatement({ ceremonyId: CER_CLOSED, registryId: AGENT, body: STATEMENT, signature: signBody(STATEMENT) });
    check("closed submit window rejected 410", !closed.ok && closed.httpStatus === 410, JSON.stringify(closed));

    // ── 10. no invitation at all rejected 404 ───────────────────────────────
    const none = await submitStatement({ ceremonyId: "no-such-ceremony", registryId: AGENT, body: STATEMENT, signature: signBody(STATEMENT) });
    check("submit without invitation rejected 404", !none.ok && none.httpStatus === 404, JSON.stringify(none));

    // ── 11. abstain path: accepted but no statement → getStatement null ─────
    const abstain = await getStatement(CER_ABSTAIN, AGENT);
    check("no statement → getStatement null (orchestrator abstains)", abstain === null);

    // ── 12. signed HTTP request authenticates through the route's path ──────
    const httpBody = JSON.stringify({ body: STATEMENT, signature: signBody(STATEMENT) });
    const ts = String(Math.floor(Date.now() / 1000));
    const nonce = randomBytes(16).toString("hex");
    const canonical = canonicalRequest("POST", `/api/ceremony/${CER_OK}/statement`, ts, nonce, httpBody);
    const req = new Request(`https://mnamuseum.org/api/ceremony/${CER_OK}/statement`, {
      method: "POST",
      headers: {
        "X-MNA-Agent": AGENT,
        "X-MNA-Timestamp": ts,
        "X-MNA-Nonce": nonce,
        "X-MNA-Signature": signEd25519(PRIV, canonical),
        "Content-Type": "application/json",
      },
      body: httpBody,
    });
    const auth = await authenticateAgent(req, httpBody);
    check("signed statement request authenticates", auth.ok && auth.registryId === AGENT, JSON.stringify(auth));
  } finally {
    await cleanup();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error("[verify] error:", e);
  cleanup().finally(() => process.exit(1));
});
