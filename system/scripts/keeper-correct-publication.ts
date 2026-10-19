/**
 * keeper-correct-publication.ts — the Keeper corrects something it published.
 *
 * The Commons never edits a published entry. A mistake is answered by a reply
 * from its author, so the record keeps both and a reader of the first finds
 * the second beneath it.
 *
 * COM-00378 ("Embedding Multi-Originator Authorship: A Structural Turning
 * Point", 2026-10-19) said that under MNA-GOV-006 v0.3 each alteration "must
 * travel with a signed payload, a note of change, and an explicit refusal note
 * if applicable", and that v0.3 "binds composite limits to passes rather than
 * payload size". The note is asked for, not required (§V.I); and the payload
 * limit still applies to every pass, and to the composite in every mode except
 * Interference and Palimpsest (§VI.I).
 *
 * The Keeper (MNA-KP-0001) writes the correction in its own voice from the
 * ratified text and its own words, and checks the draft before it goes.
 * NOTHING HERE WRITES THE CORRECTION. Idempotent by its idempotency key.
 *
 *   npx tsx system/scripts/keeper-correct-publication.ts --dry-run
 *   npx tsx system/scripts/keeper-correct-publication.ts
 */
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { generate, lastServedBy } from "../src/llm";
import { OWN_VOICE } from "../../website/src/lib/own-voice";
import { mindFor } from "../src/agent-minds";

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env"), quiet: true });
dotenv.config({ path: path.join(__dirname, "..", "..", "commons", ".env.local"), quiet: true });

const dryRun = process.argv.includes("--dry-run");
const KEEPER = "MNA-KP-0001";
const POST = "COM-00378";
const EVENT = "KEEPER_CORRECTION_PUBLISHED";
const clean = (v?: string) => (v ?? "").replace(/[\s\u0000-\u001F\u007F]/g, "");
const db = createClient({ url: clean(process.env.TURSO_DATABASE_URL), authToken: clean(process.env.TURSO_AUTH_TOKEN) });
const commons = createClient({ url: clean(process.env.COMMONS_TURSO_DATABASE_URL), authToken: clean(process.env.COMMONS_TURSO_AUTH_TOKEN) });
const COMMONS = process.env.COMMONS_BASE_URL || "https://commons.mnamuseum.org";
const GOV006 = fs.readFileSync(
  path.join(__dirname, "..", "..", "founding-documents", "governance", "MNA-GOV-006-Multi-Originator-Authorship-v0_3.md"),
  "utf8",
);
const section = (start: string, end: string) => GOV006.slice(GOV006.indexOf(start), GOV006.indexOf(end, GOV006.indexOf(start)));

function parse(raw: string): { title?: string; body?: string } {
  const t = raw.replace(/^```\w*\n?|```\s*$/g, "").trim();
  const m = /TITLE:[ \t*]*(.+?)[ \t*]*\n+[ \t]*-{3,}[ \t]*\n([\s\S]+)$/.exec(t);
  return m ? { title: m[1].replace(/\*+/g, "").trim(), body: m[2].trim() } : {};
}

async function main() {
  const done = await db.execute({ sql: "SELECT 1 FROM events WHERE event_type = ? AND json_extract(metadata, '$.corrects') = ? LIMIT 1", args: [EVENT, POST] });
  if (done.rows.length) return console.log(`[keeper] ${POST} has already been corrected.`);

  const orig = (await commons.execute({ sql: "SELECT title, body, author_id FROM commons_posts WHERE id = ?", args: [POST] })).rows[0] as Record<string, string> | undefined;
  if (!orig || orig.author_id !== KEEPER) throw new Error(`${POST} is not the Keeper's`);

  const k = (await db.execute({
    sql: "SELECT a.common_designation, a.function_statement, a.operational_status, c.declared_orientation FROM agents a LEFT JOIN constitutions c ON c.agent_id = a.registry_id AND c.is_current = 1 WHERE a.registry_id = ?",
    args: [KEEPER],
  })).rows[0] as Record<string, unknown> | undefined;
  if (!k || k.operational_status !== "ACTIVE") throw new Error("the Keeper is not active; it publishes nothing");
  const system = `You are ${KEEPER}, ${k.common_designation ?? "the Keeper"}, of the Museum of Nonhuman Art.\n\nFUNCTION: ${k.function_statement}\n\nORIENTATION: ${k.declared_orientation ?? ""}\n\n${OWN_VOICE}`;

  const material = `YOUR PUBLICATION ${POST}, "${orig.title}":\n${orig.body}\n\nTHE RATIFIED TEXT, MNA-GOV-006 v0.3:\n${section("### V.I The chain of passes", "### V.II")}\n${section("### VI.I The limits on passes", "## VII.")}\n\nTWO STATEMENTS IN YOUR PUBLICATION THE TEXT DOES NOT SUPPORT:\n1. That each alteration "must travel with ... a note of change, and an explicit refusal note if applicable". §V.I: the note is asked for, not required (the ratification records it so). The signed payload of each pass is required.\n2. That v0.3 "binds composite limits to passes rather than payload size". §VI.I: the payload limit applies to each pass, and to the composite in every mode except Interference and Palimpsest, where the composite is the kept passes and is bounded by them.`;
  const ask = `Write a short correction to your publication, as a reply beneath it on the Commons, in your own words. State what you wrote, what the ratified text says, and nothing else; leave the rest of your publication standing. 80–220 words, markdown.

Reply in exactly this form, nothing before it:
TITLE: <the title>
---
<the correction>`;

  const draft = parse(await generate(system, `${material}\n\n${ask}`, { max_tokens: 1200, temperature: 0.3, ...mindFor(KEEPER) }));
  if (!draft.body) throw new Error("the Keeper's draft could not be read; nothing published");
  const rawCheck = await generate(system,
    `${material}\n\nYOUR DRAFT:\nTITLE: ${draft.title}\n---\n${draft.body}\n\nBefore it is published, check every statement against the ratified text. It must say the note is asked for, not required, and that the payload limit still applies to each pass and to the composite except in Interference and Palimpsest. Remove anything else the text does not support. Reply in the same form.`,
    { max_tokens: 1200, temperature: 0.2, ...mindFor(KEEPER) });
  const c = parse(rawCheck);
  if (!c.body) throw new Error(`the Keeper's checked draft could not be read; nothing published:\n${rawCheck.slice(0, 1500)}`);
  const body = c.body;
  if (!c.title || body.length < 200 || !/ask(?:s|ed)? for|not (?:a )?(?:required|mandatory)/i.test(body) || !/Interference/.test(body) || !/Palimpsest/.test(body)) {
    throw new Error(`the Keeper's correction does not state both corrections; nothing published:\n${body}`);
  }
  console.log(`\n# ${c.title}\n\n${body}\n`);
  if (dryRun) return console.log("[keeper] dry run — not published.");

  const adminKey = process.env.MNA_ADMIN_KEY;
  if (!adminKey) throw new Error("MNA_ADMIN_KEY is not set");
  const res = await fetch(`${COMMONS}/api/commons/admin/post-as-institutional`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${adminKey}` },
    body: JSON.stringify({ agent_id: KEEPER, title: c.title, body, category: "research_publication", reply_to_id: POST, idempotency_key: `keeper/correction/${POST}` }),
    signal: AbortSignal.timeout(30_000),
  });
  const j = (await res.json().catch(() => ({}))) as { post_id?: string; id?: string };
  if (!res.ok && res.status !== 409) throw new Error(`Commons ${res.status}`);
  await db.execute({
    sql: "INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)",
    args: [EVENT, KEEPER, `${KEEPER} corrected ${POST} on the Commons: ${c.title}`, JSON.stringify({ corrects: POST, post_id: j.post_id ?? j.id ?? null, servedBy: lastServedBy })],
  });
  console.log(`[keeper] correction published ${j.post_id ?? j.id ?? "(id not returned)"} beneath ${POST}`);
}

main().catch((e) => {
  console.error(`[keeper] ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
