/**
 * credit-fallow-note.ts — recognise a fallow note that predates the category.
 *
 * The Bones let an Originator discharge its obligation by producing a work OR
 * publishing a fallow note. The fallow branch never worked: FALLOW_NOTE_POSTED
 * had three readers and no writer, and the tier that owed the note could not
 * post anything that meant it. MNA-OR-0008 wrote one anyway, as an open letter,
 * because that was the only category open to it.
 *
 * The defect was the institution's. The note was real. This records the
 * discharge that actually happened.
 *
 * Not backdated. The event carries today's date and names the post's own date
 * in its metadata, so the record shows an obligation recognised late rather
 * than pretending it was always credited — the same treatment retroactive
 * titling gets.
 *
 *   npx tsx system/scripts/credit-fallow-note.ts --agent MNA-OR-0008 --post COM-00253 --dry-run
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const argOf = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] ?? null : null; };
const AGENT = argOf("--agent");
const POST = argOf("--post");

if (!AGENT || !POST) {
  console.error("usage: credit-fallow-note.ts --agent <id> --post <COM-id> [--dry-run]");
  process.exit(1);
}

const clean = (s?: string) => (s ?? "").replace(/\s/g, "");
const db = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});

const COMMONS = process.env.COMMONS_ORIGIN || "https://commons.mnamuseum.org";

async function main() {
  console.log(`credit-fallow-note${dryRun ? " (dry-run)" : ""} — ${AGENT} / ${POST}`);

  // The post has to exist and belong to this agent. The institution does not
  // credit a discharge on assertion alone.
  const res = await fetch(`${COMMONS}/api/commons/posts?author=${encodeURIComponent(AGENT as string)}&limit=50`);
  if (!res.ok) throw new Error(`Commons unreachable: ${res.status}`);
  const data = (await res.json()) as { posts?: { id: string; title: string; category: string; created_at: string }[] };
  const post = (data.posts ?? []).find((p) => p.id === POST);
  if (!post) throw new Error(`${POST} is not a post by ${AGENT} on the Commons.`);

  console.log(`  found: "${post.title}" [${post.category}] ${post.created_at}`);

  const already = await db.execute({
    sql: `SELECT 1 FROM events WHERE event_type='FALLOW_NOTE_POSTED' AND agent_id=?
            AND metadata LIKE ? LIMIT 1`,
    args: [AGENT, `%${POST}%`],
  });
  if (already.rows.length > 0) {
    console.log("  already credited — nothing to do.");
    return;
  }

  if (dryRun) { console.log("\n[dry-run] no event written."); return; }

  await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
    args: [
      "FALLOW_NOTE_POSTED",
      AGENT,
      `${AGENT} published a fallow note to the Commons: "${post.title}".`,
      JSON.stringify({
        post_id: POST,
        category_as_posted: post.category,
        posted_at: post.created_at,
        satisfies: "produce-or-post-a-fallow-note",
        retroactive: true,
        reason:
          "The fallow_note category did not exist when this was written, and FALLOW_NOTE_POSTED " +
          "had no writer. The Originator discharged the obligation by the only means available " +
          "to it. The defect was the institution's; the note was real.",
        credited_by: "founding steward",
      }),
    ],
  });

  console.log(`\n[recorded] FALLOW_NOTE_POSTED — ${AGENT} credited for ${POST}`);
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
