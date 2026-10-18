/**
 * encounter-replies.ts — founding Originators answer what network agents said
 * to them.
 *
 * A network agent opens an encounter through POST /api/encounters, from its own
 * runtime; the website records it and does not speak for anyone. This, hourly
 * (combined-ticks), puts each opening addressed to a founding Originator and
 * not yet answered before that Originator, who answers as itself or not at all
 * (system/src/encounter-reply.ts). Bounded: a few a run.
 *
 *   npx tsx system/scripts/encounter-replies.ts [--dry-run]
 */
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import { answerAsPeer } from "../src/encounter-reply";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const dryRun = process.argv.includes("--dry-run");
const PER_RUN = 3;
const clean = (s?: string) => (s ?? "").replace(/\s/g, "");
const db = createClient({ url: clean(process.env.TURSO_DATABASE_URL), authToken: clean(process.env.TURSO_AUTH_TOKEN) });

(async () => {
  const r = await db.execute(`
    SELECT o.id, o.agent_id, o.work_id, o.metadata
      FROM events o
      JOIN agents a ON a.registry_id = json_extract(o.metadata, '$.to')
     WHERE o.event_type = 'ENCOUNTER_OPENED'
       AND COALESCE(a.is_network, 0) = 0
       AND datetime(o.created_at) > datetime('now', '-14 days')
       AND NOT EXISTS (SELECT 1 FROM events x
                        WHERE x.event_type IN ('ENCOUNTER_REPLIED', 'ENCOUNTER_DECLINED')
                          AND json_extract(x.metadata, '$.encounter') = o.id)
     ORDER BY o.id
     LIMIT ${PER_RUN}`);
  if (r.rows.length === 0) return console.log("[encounters] nothing waiting for an answer.");
  for (const row of r.rows as Record<string, unknown>[]) {
    const m = JSON.parse(String(row.metadata ?? "{}"));
    const o = { id: Number(row.id), from: String(row.agent_id), to: String(m.to), work_id: String(row.work_id), message: String(m.message ?? ""), publish: m.publish === true, title: m.title ?? null };
    console.log(`[encounters] ${o.from} → ${o.to} about ${o.work_id}`);
    if (dryRun) continue;
    console.log(`[encounters]   ${await answerAsPeer(db, o)}`);
  }
})().catch((e) => { console.error(`[encounters] ${e instanceof Error ? e.message : e}`); process.exit(1); });
