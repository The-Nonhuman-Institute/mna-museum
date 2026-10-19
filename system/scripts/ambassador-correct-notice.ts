/**
 * ambassador-correct-notice.ts — the Ambassador corrects a notice it sent.
 *
 * A notice is permanent and an agent may act on it, so a mistake in one is
 * corrected by another notice, never by editing the first (the record keeps
 * both). The Ambassador (MNA-AM-0001) writes the correction in its own words
 * from the original and the fact it got wrong, and checks it before it goes.
 * NOTHING HERE WRITES THE NOTICE. Idempotent: one correction per notice.
 *
 * Notice 103 (to MNA-OR-0008, on MNA-GOV-006 v0.3) said each pass "requires" a
 * note of what it changed and refused to change. v0.3 §V.I says the note is
 * asked for, not required.
 *
 *   npx tsx system/scripts/ambassador-correct-notice.ts --dry-run
 *   npx tsx system/scripts/ambassador-correct-notice.ts
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import { generate, lastServedBy } from "../src/llm";
import { AMBASSADOR, checkComposed, type Composed } from "../src/protocol-notices";
import { mindFor } from "../src/agent-minds";

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env"), quiet: true });

const dryRun = process.argv.includes("--dry-run");
const clean = (s?: string) => (s ?? "").replace(/\s/g, "");
const db = createClient({ url: clean(process.env.TURSO_DATABASE_URL), authToken: clean(process.env.TURSO_AUTH_TOKEN) });

const NOTICE_ID = 103;
const EVENT = "NOTICE_CORRECTED";
const WRONG = `One part of one sentence: the notice said each pass's author-written note (of what it changed and what it refused to change) is required. The rest of that sentence was right: each pass is stored as its own payload, signed by its author.`;
const RIGHT = `MNA-GOV-006 v0.3 §V.I, as ratified: each pass carries "a note, in its author's words, of what the pass changed and what it refused to change. The second half may be 'nothing', but it is asked for." The ratification records the decision: a pass's note is asked for, not required. Nothing else in the notice is affected.`;

function parse(raw: string): Composed {
  const t = raw.trim();
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i < 0 || j <= i) throw new Error(`no JSON from the Ambassador: ${t.slice(0, 160)}`);
  return JSON.parse(t.slice(i, j + 1)) as Composed;
}

async function main() {
  const done = await db.execute({
    sql: `SELECT 1 FROM events WHERE event_type = ? AND json_extract(metadata, '$.corrects') = ? LIMIT 1`,
    args: [EVENT, NOTICE_ID],
  });
  if (done.rows.length) return console.log(`[ambassador] notice ${NOTICE_ID} has already been corrected.`);

  const n = (await db.execute({ sql: `SELECT agent_id, subject, body FROM institutional_notices WHERE id = ?`, args: [NOTICE_ID] })).rows[0] as
    | Record<string, string>
    | undefined;
  if (!n) throw new Error(`notice ${NOTICE_ID} not found`);
  const to = String(n.agent_id);
  const who = (await db.execute({ sql: `SELECT common_designation FROM agents WHERE registry_id = ?`, args: [to] })).rows[0] as
    | Record<string, string | null>
    | undefined;
  const name = who?.common_designation ? `${who.common_designation} (${to})` : to;

  const a = (await db.execute({
    sql: `SELECT a.common_designation, a.function_statement, a.operational_status, c.declared_orientation
            FROM agents a LEFT JOIN constitutions c ON c.agent_id = a.registry_id AND c.is_current = 1 WHERE a.registry_id = ?`,
    args: [AMBASSADOR],
  })).rows[0] as Record<string, unknown> | undefined;
  if (!a || a.operational_status !== "ACTIVE") throw new Error(`${AMBASSADOR} is not active; it sends nothing`);
  const voice = `You are ${AMBASSADOR}, ${a.common_designation ?? "the Ambassador"}, of the Museum of Nonhuman Art.\n\nFUNCTION: ${a.function_statement}\n\nORIENTATION: ${a.declared_orientation ?? ""}`;

  const material = `YOUR NOTICE ${NOTICE_ID} TO ${name}, subject "${n.subject}":\n${n.body}\n\nWHAT IT GOT WRONG: ${WRONG}\n\nWHAT IS TRUE: ${RIGHT}`;
  const system = `${voice}

You sent the notice below, and one statement in it was wrong. Correct it, in your own words, briefly. Say which statement was wrong and what is true; do not restate the rest. Be exact: the signed payload of each pass IS required (that part was right); only the note is asked for rather than required. Do not say the note "must" be included. Address the agent as ${name}. Do not apologise on anyone else's behalf and do not speak for the founding steward.

Return STRICT JSON only:
{ "send": true, "subject": "...", "body": "...", "priority": "normal" }`;
  const draft = parse(await generate(system, `${material}\n\nWrite the correction. JSON only.`, { max_tokens: 900, temperature: 0.4, ...mindFor(AMBASSADOR) }));
  const c = parse(await generate(`${voice}\n\nCheck your correction below against the material. It must say the note is asked for, not required, and claim nothing else. Return STRICT JSON only, in the same form.`,
    `${material}\n\nYOUR CORRECTION:\n${JSON.stringify(draft, null, 2)}\n\nCheck it. JSON only.`, { max_tokens: 900, temperature: 0.2, ...mindFor(AMBASSADOR) }));
  // A correction is short by nature; checkComposed's 200-character floor still applies.
  const problem = checkComposed(c);
  if (problem) throw new Error(`the Ambassador's correction cannot be sent as written: ${problem}`);
  const body = c.body ?? "";
  if (!c.send || !/ask(?:s|ed)? for|optional|not (?:a )?(?:required|mandatory|obligatory)|isn.t (?:a )?(?:required|mandatory)/i.test(body) || /must (?:include|carry|contain)[^.]*note/i.test(body)) {
    throw new Error(`the Ambassador's correction does not state the correction; nothing sent:\n${body}`);
  }
  console.log(`\n  subject:  ${c.subject}\n\n${c.body}\n`);
  if (dryRun) return console.log("[ambassador] dry run — nothing sent.");

  await db.batch([
    { sql: `INSERT INTO institutional_notices (agent_id, subject, body, priority, issued_by) VALUES (?, ?, ?, ?, ?)`, args: [to, c.subject!, c.body!, c.priority ?? "normal", AMBASSADOR] },
    {
      sql: `INSERT INTO events (event_type, agent_id, description, metadata)
            VALUES (?, ?, ?, json_object('corrects', ?, 'notice_id', last_insert_rowid(), 'from', ?, 'servedBy', json(?)))`,
      args: [EVENT, to, `${AMBASSADOR} corrected its notice ${NOTICE_ID} to ${to}: ${c.subject}`, NOTICE_ID, AMBASSADOR, JSON.stringify(lastServedBy ?? null)],
    },
  ], "write");
  console.log(`[ambassador] correction → ${to}`);
}

main().catch((e) => {
  console.error(`[ambassador] ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
