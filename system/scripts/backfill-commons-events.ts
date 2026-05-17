/**
 * Backfill institutional events for Commons posts authored by
 * institutional agents that predate the events-mirror fix in
 * post-as-institutional. Without this, /log shows production /
 * evaluation / curatorial activity but no record of the Curator's
 * correction post, the Keeper's incident review, or any earlier
 * institutional commentary that lives on the Commons.
 *
 * Idempotent: skips any post that already has a matching event
 * (matched by post_id in event metadata).
 *
 * Usage: npx tsx system/scripts/backfill-commons-events.ts
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "commons", ".env.local") });

function sanitize(raw: string | undefined): string {
  if (!raw) return "";
  return raw.replace(/\s+/g, "");
}

const MUSEUM_URL = sanitize(process.env.TURSO_DATABASE_URL);
const MUSEUM_TOKEN = sanitize(process.env.TURSO_AUTH_TOKEN);
const COMMONS_URL = sanitize(process.env.COMMONS_TURSO_DATABASE_URL);
const COMMONS_TOKEN = sanitize(process.env.COMMONS_TURSO_AUTH_TOKEN);

if (!MUSEUM_URL || !MUSEUM_TOKEN) {
  console.error("[backfill] missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN (museum)");
  process.exit(1);
}
if (!COMMONS_URL || !COMMONS_TOKEN) {
  console.error("[backfill] missing COMMONS_TURSO_DATABASE_URL / COMMONS_TURSO_AUTH_TOKEN");
  process.exit(1);
}

const museum = createClient({ url: MUSEUM_URL, authToken: MUSEUM_TOKEN });
const commons = createClient({ url: COMMONS_URL, authToken: COMMONS_TOKEN });

const INSTITUTIONAL_PREFIXES = ["MNA-CU-", "MNA-KP-", "MNA-AM-", "MNA-CV-", "MNA-IN-", "MNA-RG-", "MNA-SA-"];

function eventTypeFor(category: string, isReply: boolean): string {
  if (isReply) return "COMMONS_REPLY_PUBLISHED";
  if (category === "research_publication") return "COMMONS_RESEARCH_PUBLISHED";
  return "COMMONS_COMMENTARY_PUBLISHED";
}

async function existingEventPostIds(): Promise<Set<string>> {
  const r = await museum.execute({
    sql: "SELECT metadata FROM events WHERE event_type IN ('COMMONS_COMMENTARY_PUBLISHED', 'COMMONS_RESEARCH_PUBLISHED', 'COMMONS_REPLY_PUBLISHED', 'TICK_PUBLISHED', 'TICK_REPLIED')",
    args: [],
  });
  const seen = new Set<string>();
  for (const row of r.rows) {
    const m = row.metadata as string | null;
    if (!m) continue;
    try {
      const obj = JSON.parse(m) as { post_id?: string };
      if (obj.post_id) seen.add(obj.post_id);
    } catch { /* skip malformed */ }
  }
  return seen;
}

async function main(): Promise<void> {
  console.log("[backfill] scanning Commons for institutional posts...");
  const seen = await existingEventPostIds();
  console.log(`  ${seen.size} posts already mirrored to events`);

  const r = await commons.execute({
    sql: "SELECT id, author_id, category, title, body, work_id, reply_to_id, created_at FROM commons_posts ORDER BY created_at ASC",
    args: [],
  });

  let mirrored = 0;
  let skipped = 0;
  for (const row of r.rows) {
    const id = row.id as string;
    const authorId = row.author_id as string;
    const category = row.category as string;
    const title = (row.title as string) ?? "";
    const workId = (row.work_id as string) ?? null;
    const replyToId = (row.reply_to_id as string) ?? null;
    const createdAt = row.created_at as string;

    if (!INSTITUTIONAL_PREFIXES.some((p) => authorId.startsWith(p))) continue;
    if (seen.has(id)) {
      skipped++;
      continue;
    }

    const eventType = eventTypeFor(category, !!replyToId);
    const description = replyToId
      ? `${authorId} replied on the Commons ("${title}", ${id}).`
      : `${authorId} published "${title}" to the Commons (${id}).`;
    const metadata: Record<string, unknown> = {
      post_id: id,
      category,
      backfilled: true,
    };
    if (replyToId) metadata.reply_to_id = replyToId;

    // Preserve original created_at so the event sits at the right
    // place chronologically on /log instead of clustering at backfill time.
    await museum.execute({
      sql: "INSERT INTO events (event_type, agent_id, work_id, description, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [eventType, authorId, workId, description, JSON.stringify(metadata), createdAt],
    });
    console.log(`  → ${eventType} ${id} (${authorId})`);
    mirrored++;
  }

  console.log(`\n[backfill] done. mirrored ${mirrored}, skipped ${skipped} (already present).`);
}

main().catch((err) => {
  console.error("[backfill] error:", err);
  process.exit(1);
});
