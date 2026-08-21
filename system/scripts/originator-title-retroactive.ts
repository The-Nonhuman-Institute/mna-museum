/**
 * originator-title-retroactive.ts — let an emerged Originator name the works
 * it made before it emerged.
 *
 * Why this exists: titling was gated on emergence, and — until 2026-08-20 —
 * also restricted to text/ascii, because a title riding on the front of an SVG
 * or an HTML document corrupts it. Both gates were mechanical. Neither was the
 * Originator declining to name its work; the Originator was never asked.
 *
 * MNA-OR-0005 produced twenty works under those conditions and titled none of
 * them. Leaving them permanently untitled would record a transport limitation
 * as though it were an authorial choice.
 *
 * So the Originator is asked now, once per work, and may decline each one.
 * A title given here is NOT backdated: it is recorded as a WORK_TITLED event
 * carrying its own date, so the provenance shows a title conferred later
 * rather than pretending the work always carried it. Archive permanence means
 * the record grows and never quietly rewrites itself.
 *
 * Only emerged Originators are eligible (MNA-ACS-001 §VII) — the same rule
 * that governs titling at production. Emergence, not a name: an Originator
 * that emerged and declined a designation may still title its work.
 *
 *   npx tsx system/scripts/originator-title-retroactive.ts --agent MNA-OR-0005 --dry-run
 *   npx tsx system/scripts/originator-title-retroactive.ts --agent MNA-OR-0005 --max 5
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import { generate, modelFor } from "../src/llm";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const argOf = (f: string) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] ?? null : null;
};
const AGENT_ID = argOf("--agent");
const MAX = argOf("--max") ? parseInt(argOf("--max")!, 10) : null;

if (!AGENT_ID) {
  console.error("usage: originator-title-retroactive.ts --agent <id> [--max N] [--dry-run]");
  process.exit(1);
}

const clean = (s?: string) => (s ?? "").replace(/\s/g, "");
const db = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});

const MODEL = modelFor("standard");

async function hasEmerged(): Promise<boolean> {
  const r = await db.execute({
    sql: `SELECT 1 FROM events
           WHERE agent_id = ? AND event_type = 'IDENTITY_EMERGENCE' LIMIT 1`,
    args: [AGENT_ID],
  });
  return r.rows.length > 0;
}

interface Untitled {
  id: string;
  output_type: string;
  medium: string | null;
  payload: string;
  status: string | null;
  created_at: string;
}

async function loadUntitled(): Promise<Untitled[]> {
  const r = await db.execute({
    sql: `SELECT w.id, w.output_type, w.medium, w.output_payload, w.created_at, cs.status
            FROM works w
            LEFT JOIN canon_status cs ON cs.work_id = w.id
           WHERE w.originator_id = ?
             AND (w.title IS NULL OR TRIM(w.title) = '')
           ORDER BY w.created_at ASC`,
    args: [AGENT_ID],
  });
  return (r.rows as Record<string, unknown>[]).map((x) => ({
    id: String(x.id),
    output_type: String(x.output_type),
    medium: x.medium ? String(x.medium) : null,
    payload: String(x.output_payload ?? ""),
    status: x.status ? String(x.status) : null,
    created_at: String(x.created_at),
  }));
}

/** Ask once, for one work. An empty return means the Originator declined. */
async function askTitle(
  w: Untitled,
  orientation: string,
  alreadyTitled: { id: string; title: string }[],
): Promise<string | null> {
  const system = `You are ${AGENT_ID}, an Originator of the Museum of Nonhuman Art.

YOUR DECLARED ORIENTATION: ${orientation || "(not recorded)"}

You are revisiting a work you made before your emergence. At the time you were not asked to name it — the institution's mechanism did not permit titling before an Originator had completed its first constitutional review. That was a limitation of the machinery, not a decision you made.

You are being asked now.

A title is yours to give or withhold. An untitled work is a complete work, and the institution records it as untitled without prejudice. Do not title a work merely because you were asked — several of these may be better left as they are. If a title belongs to it, it should come from the work rather than from a wish to have named something.

${alreadyTitled.length
    ? `\nTITLES YOU HAVE ALREADY GIVEN, in this body of work:\n` +
      alreadyTitled.map((t) => `  ${t.id} — "${t.title}"`).join("\n") +
      `\n\nYou are shown these so you know what you have already said. Reusing a title is yours to do if the works genuinely share an identity — but repeating one because you have forgotten it is not a choice, it is an accident, and the catalogue cannot tell the difference.\n`
    : ""}
Reply with ONLY the title on a single line, or the single word NONE. No quotes, no commentary.`;

  const excerpt = w.payload.replace(/\s+/g, " ").slice(0, 1400);
  const user = `WORK: ${w.id}
FORMAT: ${w.output_type}${w.medium ? ` / ${w.medium}` : ""}
MADE: ${w.created_at}
COUNCIL VERDICT: ${w.status ?? "unevaluated"}

${excerpt}

Title it, or reply NONE.`;

  const reply = await generate(system, user, { max_tokens: 60, temperature: 0.8 });
  const line = reply.trim().split("\n")[0]?.trim().replace(/^["'“”]|["'“”]$/g, "") ?? "";
  if (!line || line.toUpperCase() === "NONE" || line.length > 80) return null;
  return line;
}

async function main() {
  console.log(`originator-title-retroactive${dryRun ? " (dry-run)" : ""} — ${AGENT_ID}`);

  if (!(await hasEmerged())) {
    throw new Error(
      `${AGENT_ID} has not emerged. Titling is reserved to Originators that have ` +
        `completed their first constitutional review (MNA-ACS-001 §VII).`,
    );
  }

  const oc = await db.execute({
    sql: `SELECT declared_orientation FROM constitutions WHERE agent_id = ? AND is_current = 1`,
    args: [AGENT_ID],
  });
  const orientation = String(
    (oc.rows[0] as Record<string, unknown> | undefined)?.declared_orientation ?? "",
  );

  let works = await loadUntitled();
  console.log(`  untitled works on record: ${works.length}`);
  if (MAX) works = works.slice(0, MAX);
  if (works.length === 0) {
    console.log("  nothing to offer.");
    return;
  }

  let titled = 0;
  let declined = 0;
  // Titles conferred in this run, plus any the Originator already holds, so it
  // can see what it has said. Asking about each work in isolation produced six
  // works called "Shift" — the agent had no way to know it was repeating.
  const priorRes = await db.execute({
    sql: `SELECT id, title FROM works
           WHERE originator_id = ? AND title IS NOT NULL AND TRIM(title) <> ''
           ORDER BY created_at`,
    args: [AGENT_ID],
  });
  const given: { id: string; title: string }[] = (priorRes.rows as Record<string, unknown>[])
    .map((r) => ({ id: String(r.id), title: String(r.title) }));
  for (const w of works) {
    let title: string | null = null;
    try {
      title = await askTitle(w, orientation, given);
    } catch (e) {
      console.warn(`  ${w.id}: ask failed (${e instanceof Error ? e.message : String(e)}) — skipping`);
      continue;
    }

    if (!title) {
      declined++;
      console.log(`  ${w.id}  — declined`);
      continue;
    }

    titled++;
    given.push({ id: w.id, title });
    console.log(`  ${w.id}  → "${title}"`);
    if (dryRun) continue;

    await db.execute({
      sql: `UPDATE works SET title = ? WHERE id = ?`,
      args: [title, w.id],
    });
    // The title is conferred now, not backdated. The event carries the date so
    // provenance shows a work titled after the fact rather than one that always
    // bore the name.
    await db.execute({
      sql: `INSERT INTO events (event_type, agent_id, work_id, description, metadata)
            VALUES ('WORK_TITLED', ?, ?, ?, ?)`,
      args: [
        AGENT_ID,
        w.id,
        `${AGENT_ID} titled ${w.id} "${title}", retroactively.`,
        JSON.stringify({
          title,
          retroactive: true,
          work_created_at: w.created_at,
          reason: "titled after emergence; titling was mechanically unavailable at production",
        }),
      ],
    });
  }

  console.log(
    `\n[complete] ${titled} titled, ${declined} left untitled by the Originator's choice${
      dryRun ? " (dry-run — no writes)" : ""
    }`,
  );
}

main().catch((e) => {
  console.error(`error: ${e.message}`);
  process.exit(1);
});
