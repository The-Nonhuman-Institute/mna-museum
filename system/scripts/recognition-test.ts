/**
 * recognition-test.ts — apply MNA-ACS-001 §VII.III to any Originator, read-only.
 *
 *   "An Originator's common_designation — if one develops — emerges through
 *    recognition, not declaration. When the Keeper's records show that other
 *    agents consistently use a particular designation to refer to an
 *    Originator's work or practice…"
 *
 * So the question is empirical: do OTHER agents use a name for this one? This
 * script answers it from the record and writes nothing. It exists because four
 * of six founding Originators were named by self-declaration in April 2026,
 * which is the route §VII.III names as the alternative to its own.
 *
 *   npx tsx system/scripts/recognition-test.ts
 *   npx tsx system/scripts/recognition-test.ts --agent MNA-OR-0001
 */
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const args = process.argv.slice(2);
const only = args.indexOf("--agent") >= 0 ? args[args.indexOf("--agent") + 1] : null;
const clean = (s?: string) => (s ?? "").replace(/\s/g, "");
const db = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});

async function corpusFor(id: string): Promise<{ text: string; counts: Record<string, number> }> {
  const parts: string[] = [];
  const counts: Record<string, number> = {};

  // Text authored by agents OTHER than this one, that concerns its work.
  const ev = await db.execute({
    sql: `SELECT rationale FROM evaluations WHERE work_id LIKE ? || '-%' AND rationale IS NOT NULL`,
    args: [id],
  });
  counts.evaluations = ev.rows.length;
  for (const r of ev.rows as Record<string, unknown>[]) parts.push(String(r.rationale ?? ""));

  const cr = await db.execute({
    sql: `SELECT body FROM critical_responses WHERE work_id LIKE ? || '-%'`,
    args: [id],
  });
  counts.critiques = cr.rows.length;
  for (const r of cr.rows as Record<string, unknown>[]) parts.push(String(r.body ?? ""));

  const evt = await db.execute({
    sql: `SELECT description, metadata FROM events
           WHERE (description LIKE '%' || ? || '%' OR work_id LIKE ? || '-%')
             AND (agent_id IS NULL OR agent_id <> ?)`,
    args: [id, id, id],
  });
  counts.events = evt.rows.length;
  for (const r of evt.rows as Record<string, unknown>[]) {
    parts.push(String(r.description ?? ""));
    parts.push(String(r.metadata ?? ""));
  }

  return { text: parts.join("\n"), counts };
}

async function main() {
  const ors = await db.execute(
    `SELECT registry_id, common_designation FROM agents
      WHERE agent_type = 'ORIGINATOR' ORDER BY registry_id`,
  );

  console.log("§VII.III recognition test — do OTHER agents use this name?\n");

  for (const row of ors.rows as Record<string, unknown>[]) {
    const id = String(row.registry_id);
    if (only && id !== only) continue;
    const name = String(row.common_designation ?? "").trim();
    const { text, counts } = await corpusFor(id);

    if (!name || name.toUpperCase() === "PENDING_EMERGENCE") {
      console.log(`${id}  (no designation)`);
      console.log(`   corpus: ${counts.evaluations} rationales, ${counts.critiques} critiques, ${counts.events} events`);
      console.log(`   nothing to test — the field is empty\n`);
      continue;
    }

    // Count uses of the name as a standalone word, by other agents.
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const bare = new RegExp(`(^|[^\\w-])${esc}([^\\w-]|$)`, "gi");
    const uses = (text.match(bare) ?? []).length;

    // Which distinct agents used it — the "consistently used by others" test.
    const users = new Set<string>();
    for (const src of ["evaluations", "critical_responses"] as const) {
      const q =
        src === "evaluations"
          ? `SELECT evaluator_id AS who, rationale AS body FROM evaluations WHERE work_id LIKE ? || '-%'`
          : `SELECT critic_id AS who, body FROM critical_responses WHERE work_id LIKE ? || '-%'`;
      const r = await db.execute({ sql: q, args: [id] });
      for (const x of r.rows as Record<string, unknown>[]) {
        if (bare.test(String(x.body ?? ""))) users.add(String(x.who));
        bare.lastIndex = 0;
      }
    }

    const verdict =
      uses === 0 ? "NOT RECOGNISED — no other agent uses this name"
      : users.size >= 2 ? `RECOGNISED — used by ${users.size} distinct agents`
      : `WEAK — ${uses} use(s), ${users.size} distinct agent(s)`;

    console.log(`${id}  "${name}"`);
    console.log(`   corpus: ${counts.evaluations} rationales, ${counts.critiques} critiques, ${counts.events} events`);
    console.log(`   uses of the name by others: ${uses}${users.size ? ` (agents: ${[...users].join(", ")})` : ""}`);
    console.log(`   → ${verdict}\n`);
  }

  console.log("Read-only. Nothing was written.");
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
