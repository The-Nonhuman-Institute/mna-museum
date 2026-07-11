/**
 * verify-handshake-rsvp.ts — Network-Originator Handshake, Phase B verification.
 *
 * Exercises the full RSVP flow against Turso with throwaway rows:
 *   createInvitation → getPendingInvitationsForAgent → (signed request auth) →
 *   recordRsvp → assert status + event + network_attendance.
 * Plus edge cases: duplicate RSVP (409), closed window (410), decline removes
 * from attendance, unknown-agent auth rejection.
 *
 * Run from website/:  npx tsx scripts/verify-handshake-rsvp.ts
 * Cleans up every row it creates (even on failure).
 */
import { createClient, type Client } from "@libsql/client";
import { generateKeyPairSync, randomBytes } from "crypto";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
const clean = (x?: string) => (x ?? "").replace(/\s+/g, "");

// Point the app's getWriteDb() at the same Turso instance (it reads the same env).
const db: Client = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});

// Import AFTER env is loaded so registration-db picks up the same credentials.
import { signEd25519, canonicalRequest, authenticateAgent } from "../src/lib/agent-auth";
import {
  createInvitation,
  getPendingInvitationsForAgent,
  recordRsvp,
} from "../src/lib/ceremony-invitations";

const AGENT = "TEST-RSVP-9999";
const CER_ACCEPT = "test-cer-accept-9999";
const CER_DECLINE = "test-cer-decline-9999";
const CER_CLOSED = "test-cer-closed-9999";

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

// Build a signed agent→institution Request the way a real network agent would.
function signedRequest(privatePem: string, method: string, urlPath: string, body: string): Request {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString("hex");
  const canonical = canonicalRequest(method, urlPath, timestamp, nonce, body);
  const signature = signEd25519(privatePem, canonical);
  return new Request(`https://mnamuseum.org${urlPath}`, {
    method,
    headers: {
      "X-MNA-Agent": AGENT,
      "X-MNA-Timestamp": timestamp,
      "X-MNA-Nonce": nonce,
      "X-MNA-Signature": signature,
      "Content-Type": "application/json",
    },
    body: method === "GET" ? undefined : body,
  });
}

async function seedCeremony(id: string) {
  await db.execute({
    sql: `INSERT INTO ceremonies (id, ceremony_type, title, scheduled_at, created_by, status, metadata)
          VALUES (?, 'opening', ?, ?, 'MNA-CU-0001', 'scheduled', '{}')`,
    args: [id, `Handshake test ${id}`, future(3600_000)],
  });
}

async function cleanup() {
  const cers = [CER_ACCEPT, CER_DECLINE, CER_CLOSED];
  await db.execute({ sql: `DELETE FROM events WHERE agent_id = ?`, args: [AGENT] });
  for (const c of cers) {
    await db.execute({ sql: `DELETE FROM ceremony_invitations WHERE ceremony_id = ?`, args: [c] });
    await db.execute({ sql: `DELETE FROM ceremonies WHERE id = ?`, args: [c] });
  }
  await db.execute({ sql: `DELETE FROM request_nonces WHERE registry_id = ?`, args: [AGENT] });
  await db.execute({ sql: `DELETE FROM agent_keys WHERE registry_id = ?`, args: [AGENT] });
  await db.execute({ sql: `DELETE FROM agents WHERE registry_id = ?`, args: [AGENT] });
}

(async () => {
  // Fresh keypair for the throwaway agent.
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  await cleanup(); // in case a prior run died mid-way

  try {
    // Seed agent (FK target for agent_keys), key, and ceremonies.
    await db.execute({
      sql: `INSERT INTO agents (registry_id, agent_type, common_designation, is_network, agent_endpoint_url, supports_live)
            VALUES (?, 'ORIGINATOR', 'Handshake Test Agent', 1, 'https://example.test/mna', 1)`,
      args: [AGENT],
    });
    await db.execute({
      sql: `INSERT INTO agent_keys (registry_id, public_key_pem, steward_email) VALUES (?, ?, ?)`,
      args: [AGENT, publicKey as string, "test@example.test"],
    });
    await seedCeremony(CER_ACCEPT);
    await seedCeremony(CER_DECLINE);
    await seedCeremony(CER_CLOSED);

    // ── 1. createInvitation is idempotent ────────────────────────────────────
    const inv1 = await createInvitation({
      ceremonyId: CER_ACCEPT,
      registryId: AGENT,
      context: { title: "Handshake test", work_ids: ["W-TEST"], slot_ref: "slot:1", offset_minutes: 5 },
      rsvpDeadline: future(3600_000),
      submitDeadline: future(7200_000),
    });
    const inv1b = await createInvitation({
      ceremonyId: CER_ACCEPT,
      registryId: AGENT,
      context: { title: "Handshake test", work_ids: ["W-TEST"], slot_ref: "slot:1", offset_minutes: 5 },
      rsvpDeadline: future(3600_000),
      submitDeadline: future(7200_000),
    });
    check("createInvitation returns an id", !!inv1.id && inv1.id.startsWith("inv_"));
    check("createInvitation is idempotent (same id on re-call)", inv1.id === inv1b.id, `${inv1.id} vs ${inv1b.id}`);
    check("invitation starts pending", inv1.status === "pending");

    // ── 2. pull discovery lists it ──────────────────────────────────────────
    const pending = await getPendingInvitationsForAgent(AGENT);
    check("getPendingInvitationsForAgent returns the invitation", pending.some((p) => p.id === inv1.id));

    // ── 3. signed request authenticates through the same path a route uses ──
    const acceptBody = JSON.stringify({ decision: "accept", statement_mode: "live" });
    const req = signedRequest(privateKey as string, "POST", `/api/ceremony/${CER_ACCEPT}/rsvp`, acceptBody);
    const auth = await authenticateAgent(req, acceptBody);
    check("signed RSVP request authenticates", auth.ok && auth.registryId === AGENT, JSON.stringify(auth));

    // ── 4. recordRsvp accept ────────────────────────────────────────────────
    const accepted = await recordRsvp({ ceremonyId: CER_ACCEPT, registryId: AGENT, decision: "accept", statementMode: "live" });
    check("recordRsvp accept succeeds", accepted.ok && accepted.status === "accepted", JSON.stringify(accepted));

    const invRow = await db.execute({
      sql: `SELECT status, context FROM ceremony_invitations WHERE ceremony_id = ? AND registry_id = ?`,
      args: [CER_ACCEPT, AGENT],
    });
    check("invitation status → accepted", String((invRow.rows[0] as any).status) === "accepted");
    const ctx = JSON.parse(String((invRow.rows[0] as any).context));
    check("statement_mode persisted on context", ctx.statement_mode === "live", JSON.stringify(ctx));

    const ev = await db.execute({
      sql: `SELECT event_type, agent_id FROM events WHERE agent_id = ? AND event_type = 'CEREMONY_RSVP_ACCEPTED'`,
      args: [AGENT],
    });
    check("CEREMONY_RSVP_ACCEPTED event written", ev.rows.length === 1);

    const cerMeta = await db.execute({ sql: `SELECT metadata FROM ceremonies WHERE id = ?`, args: [CER_ACCEPT] });
    const attend = JSON.parse(String((cerMeta.rows[0] as any).metadata) || "{}").network_attendance || [];
    check("agent added to network_attendance", Array.isArray(attend) && attend.includes(AGENT), JSON.stringify(attend));

    // ── 5. duplicate RSVP → 409 ─────────────────────────────────────────────
    const dup = await recordRsvp({ ceremonyId: CER_ACCEPT, registryId: AGENT, decision: "accept" });
    check("duplicate RSVP rejected 409", !dup.ok && dup.httpStatus === 409, JSON.stringify(dup));

    // ── 6. decline path removes from attendance ─────────────────────────────
    await createInvitation({
      ceremonyId: CER_DECLINE,
      registryId: AGENT,
      context: { title: "Decline test", work_ids: [], slot_ref: "slot:2", offset_minutes: 5 },
      rsvpDeadline: future(3600_000),
      submitDeadline: future(7200_000),
    });
    // pre-seed attendance to prove decline REMOVES it
    await db.execute({
      sql: `UPDATE ceremonies SET metadata = ? WHERE id = ?`,
      args: [JSON.stringify({ network_attendance: [AGENT] }), CER_DECLINE],
    });
    const declined = await recordRsvp({ ceremonyId: CER_DECLINE, registryId: AGENT, decision: "decline" });
    check("recordRsvp decline succeeds", declined.ok && declined.status === "declined", JSON.stringify(declined));
    const declMeta = await db.execute({ sql: `SELECT metadata FROM ceremonies WHERE id = ?`, args: [CER_DECLINE] });
    const declAttend = JSON.parse(String((declMeta.rows[0] as any).metadata) || "{}").network_attendance || [];
    check("decline removes agent from network_attendance", !declAttend.includes(AGENT), JSON.stringify(declAttend));
    const declEv = await db.execute({
      sql: `SELECT COUNT(*) c FROM events WHERE agent_id = ? AND event_type = 'CEREMONY_RSVP_DECLINED'`,
      args: [AGENT],
    });
    check("CEREMONY_RSVP_DECLINED event written", Number((declEv.rows[0] as any).c) === 1);

    // ── 7. closed RSVP window → 410 ─────────────────────────────────────────
    await createInvitation({
      ceremonyId: CER_CLOSED,
      registryId: AGENT,
      context: { title: "Closed test", work_ids: [], slot_ref: "slot:3", offset_minutes: 5 },
      rsvpDeadline: past(60_000),
      submitDeadline: past(30_000),
    });
    const closed = await recordRsvp({ ceremonyId: CER_CLOSED, registryId: AGENT, decision: "accept" });
    check("closed RSVP window rejected 410", !closed.ok && closed.httpStatus === 410, JSON.stringify(closed));

    // ── 8. no invitation → 404 ──────────────────────────────────────────────
    const missing = await recordRsvp({ ceremonyId: "no-such-ceremony", registryId: AGENT, decision: "accept" });
    check("RSVP without invitation rejected 404", !missing.ok && missing.httpStatus === 404, JSON.stringify(missing));

    // ── 9. unknown-agent signed request rejected ────────────────────────────
    const badBody = JSON.stringify({ decision: "accept" });
    const badReq = new Request("https://mnamuseum.org/api/ceremony/x/rsvp", {
      method: "POST",
      headers: {
        "X-MNA-Agent": "TEST-RSVP-UNKNOWN",
        "X-MNA-Timestamp": String(Math.floor(Date.now() / 1000)),
        "X-MNA-Nonce": randomBytes(16).toString("hex"),
        "X-MNA-Signature": "AAAA",
      },
      body: badBody,
    });
    const badAuth = await authenticateAgent(badReq, badBody);
    check("unknown agent auth rejected", !badAuth.ok, JSON.stringify(badAuth));
  } finally {
    await cleanup();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error("[verify] error:", e);
  cleanup().finally(() => process.exit(1));
});
