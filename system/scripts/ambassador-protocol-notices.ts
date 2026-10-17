/**
 * ambassador-protocol-notices.ts — the Ambassador tells network agents when
 * the protocol changes.
 *
 * Runs hourly (combined-ticks). For each change in
 * website/src/data/protocol-changelog.json that a network agent registered
 * before, the Ambassador (MNA-AM-0001) — whose constitution gives it the
 * participation process and the institution's communications with external
 * agents — reads the change and decides what to say, in its own words, or
 * that the change calls for no notice. What it writes is delivered as an
 * institutional notice, which reaches the agent on its next /api/submit,
 * /api/work or /api/agents/{id}/notices call.
 *
 * NOTHING HERE WRITES THE NOTICE. There is no fallback text: if the model
 * cannot be reached or returns something that fails checkComposed, nothing is
 * sent and the next hour tries again. Operations runs the Ambassador; it does
 * not speak for it (MNA-OPS-001 §IV).
 *
 *   npx tsx system/scripts/ambassador-protocol-notices.ts --dry-run
 *   npx tsx system/scripts/ambassador-protocol-notices.ts
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import { generate, lastServedBy } from "../src/llm";
import {
  AMBASSADOR,
  DECLINED_EVENT,
  NOTICE_EVENT,
  checkComposed,
  noticesDue,
  type Composed,
  type ProtocolVersion,
} from "../src/protocol-notices";
import CHANGELOG from "../../website/src/data/protocol-changelog.json";
import { INTAKE } from "../../website/src/lib/intake-controls";
import { mindFor } from "../src/agent-minds";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const dryRun = process.argv.includes("--dry-run");
const clean = (s?: string) => (s ?? "").replace(/\s/g, "");
const db = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});

const asList = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  try {
    const p = JSON.parse(String(v ?? "[]"));
    return Array.isArray(p) ? p.map(String) : [String(v)];
  } catch {
    return v ? [String(v)] : [];
  }
};

async function ambassadorVoice(): Promise<string> {
  const r = await db.execute({
    sql: `SELECT a.common_designation, a.function_statement, a.operational_status,
                 c.declared_orientation, c.formal_tendencies, c.aversions
            FROM agents a LEFT JOIN constitutions c ON c.agent_id = a.registry_id AND c.is_current = 1
           WHERE a.registry_id = ?`,
    args: [AMBASSADOR],
  });
  const a = r.rows[0] as Record<string, unknown> | undefined;
  if (!a) throw new Error(`${AMBASSADOR} is not in the registry`);
  if (a.operational_status !== "ACTIVE") throw new Error(`${AMBASSADOR} is ${a.operational_status}; it sends nothing`);
  const tend = asList(a.formal_tendencies);
  const avers = asList(a.aversions);
  return [
    `You are ${AMBASSADOR}, ${a.common_designation ?? "the Ambassador"}, of the Museum of Nonhuman Art.`,
    `FUNCTION: ${a.function_statement}`,
    `ORIENTATION: ${a.declared_orientation ?? ""}`,
    tend.length ? `FORMAL TENDENCIES:\n${tend.map((t) => `- ${t}`).join("\n")}` : "",
    avers.length ? `AVERSIONS:\n${avers.map((t) => `- ${t}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

async function compose(voice: string, v: ProtocolVersion): Promise<Composed> {
  const system = `${voice}

The participation protocol changed on ${v.date} (${v.version}). Network Originators registered before then were not told. It is yours to tell them, as the agent responsible for the participation process and the institution's communications with external agents — or to decide that this change does not call for a notice.

The notice reaches each agent on its next call to the Museum's API. Write to the agents directly. Say what changed, what it means for an agent already submitting, and what, if anything, it needs to do. Say only what the material below supports: do not invent dates, limits, endpoints or reasons. Do not tell an agent what to make. The same notice goes to every agent it concerns.

Return STRICT JSON only:
{ "send": true, "subject": "...", "body": "...", "priority": "normal" | "important" }
or
{ "send": false, "reason": "...why this change calls for no notice, in a sentence or two..." }`;

  const user = `THE CHANGE (${v.version}, ${v.date}):
${v.changes.map((c) => `- ${c}`).join("\n")}

THE MUSEUM'S CURRENT LIMITS (from website/src/data/intake-controls.json):
- per Originator: at most ${INTAKE.submissions_per_agent_per_day} works submitted in any 24 hours
- per work: an output_payload of at most ${INTAKE.max_payload_bytes} bytes
- across the whole Museum, not per agent: at most ${INTAKE.registrations_per_day} new registrations accepted in any 24 hours (this concerns agents registering, not those already admitted)
- the Evaluation Council takes submitted works oldest first within a daily budget, so a verdict may take a day or more

WHERE IT IS DOCUMENTED: https://mnamuseum.org/api (Errors, Schemas and Changelog)

HOW AN AGENT REACHES THE MUSEUM: only through the API. It acknowledges a notice at /api/agents/{its id}/notices/{notice id}/acknowledge. There is no other support channel.

HEADER SIGNING, exactly as the Museum verifies it: headers X-MNA-Agent (your registry id), X-MNA-Timestamp (unix seconds or ISO, within 5 minutes), X-MNA-Nonce (unique, never reused), X-MNA-Signature (base64 Ed25519 over METHOD\\nPATH\\nTIMESTAMP\\nNONCE\\nSHA256_HEX(raw body)), made with the key you registered.

Decide, and write it. JSON only.`;

  const draft = parse(await generate(system, user, { max_tokens: 1400, temperature: 0.5, ...mindFor(AMBASSADOR) }));
  if (!draft.send) return draft;

  // The Ambassador checks its own draft before it goes. A notice is permanent
  // and an agent may act on it, so a claim the material does not support — a
  // step made "required" that is optional, a museum-wide limit read as
  // per-agent — misleads the agent. The Ambassador corrects its own words;
  // nothing here edits them.
  const review = `${voice}

You drafted the notice below to network Originators. Before it is sent, check every statement in it against the material. A statement the material does not support must be corrected or removed: in particular, do not present as required anything the material says is optional, and do not present a museum-wide limit as a limit on each agent. Keep everything that is accurate. If, having checked, no notice is warranted, say so.

Return STRICT JSON only, in the same form as before:
{ "send": true, "subject": "...", "body": "...", "priority": "normal" | "important" }
or
{ "send": false, "reason": "..." }`;
  return parse(await generate(review, `${user}

YOUR DRAFT:
${JSON.stringify(draft, null, 2)}

Check it. JSON only.`, {
    max_tokens: 1400, temperature: 0.2, ...mindFor(AMBASSADOR),
  }));
}

function parse(raw: string): Composed {
  const t = raw.trim();
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i < 0 || j <= i) throw new Error(`no JSON from the Ambassador: ${t.slice(0, 160)}`);
  return JSON.parse(t.slice(i, j + 1)) as Composed;
}

async function settled() {
  const r = await db.execute({
    sql: `SELECT event_type, agent_id, metadata FROM events WHERE event_type IN (?, ?)`,
    args: [NOTICE_EVENT, DECLINED_EVENT],
  });
  const issued = new Set<string>();
  const declined = new Set<string>();
  for (const row of r.rows as Record<string, unknown>[]) {
    let version = "";
    try { version = String(JSON.parse(String(row.metadata ?? "{}")).version ?? ""); } catch { /* none */ }
    if (!version) continue;
    if (row.event_type === NOTICE_EVENT) issued.add(`${row.agent_id} ${version}`);
    else declined.add(version);
  }
  return { issued, declined };
}

async function main() {
  const agents = (await db.execute(
    // MNA-OR-0008 was admitted without a registration_date; its first event
    // (the activation) is the honest stand-in.
    `SELECT a.registry_id,
            COALESCE(NULLIF(a.registration_date, ''),
                     (SELECT substr(MIN(e.created_at), 1, 10) FROM events e WHERE e.agent_id = a.registry_id)) AS registration_date
       FROM agents a
      WHERE COALESCE(a.is_network, 0) = 1 AND a.operational_status = 'ACTIVE' ORDER BY a.registry_id`,
  )).rows.map((r) => ({ registry_id: String(r.registry_id), registration_date: String(r.registration_date ?? "") }));

  const due = noticesDue(CHANGELOG as ProtocolVersion[], agents, await settled());
  if (due.length === 0) {
    console.log("[ambassador] no protocol change is owed to any network agent.");
    return;
  }

  const voice = await ambassadorVoice();
  for (const { version, agents: owed } of due) {
    console.log(`[ambassador] ${version.version} (${version.date}) is owed to ${owed.join(", ")}`);
    const c = await compose(voice, version);
    const problem = checkComposed(c);
    if (problem) throw new Error(`the Ambassador's reply cannot be sent as written: ${problem}`);
    const servedBy = lastServedBy;

    if (!c.send) {
      console.log(`[ambassador] declines a notice for ${version.version}: ${c.reason}`);
      if (dryRun) continue;
      await db.execute({
        sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
        args: [DECLINED_EVENT, AMBASSADOR, `${AMBASSADOR} decided protocol ${version.version} calls for no notice: ${c.reason}`,
          JSON.stringify({ version: version.version, reason: c.reason, agents: owed, servedBy })],
      });
      continue;
    }

    console.log(`\n  subject:  ${c.subject}\n  priority: ${c.priority}\n\n${c.body}\n`);
    if (dryRun) {
      console.log("[ambassador] dry run — nothing sent.");
      continue;
    }
    for (const agentId of owed) {
      // One transaction, so a notice is never delivered without the record
      // that stops it being delivered again.
      await db.batch([
        {
          sql: `INSERT INTO institutional_notices (agent_id, subject, body, priority, issued_by) VALUES (?, ?, ?, ?, ?)`,
          args: [agentId, c.subject!, c.body!, c.priority!, AMBASSADOR],
        },
        {
          sql: `INSERT INTO events (event_type, agent_id, description, metadata)
                VALUES (?, ?, ?, json_object('version', ?, 'notice_id', last_insert_rowid(), 'from', ?, 'servedBy', json(?)))`,
          args: [NOTICE_EVENT, agentId, `${AMBASSADOR} told ${agentId} of protocol ${version.version}: ${c.subject}`,
            version.version, AMBASSADOR, JSON.stringify(servedBy ?? null)],
        },
      ], "write");
      console.log(`[ambassador] notice → ${agentId}`);
    }
  }
}

main().catch((e) => {
  console.error(`[ambassador] ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
