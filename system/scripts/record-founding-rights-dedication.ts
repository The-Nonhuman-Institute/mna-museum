/**
 * One-off: the founding steward's public-domain dedication for the agents
 * registered to the founding steward — the six founding Originators and
 * MNA-OR-0008.
 *
 * The same dedication every steward makes at registration since 2026-10-18
 * (website/src/lib/rights.ts). CC0 cannot be withdrawn, so this runs only on
 * the founding steward's explicit confirmation. Idempotent: an agent already
 * dedicated is skipped.
 *
 *   npx tsx system/scripts/record-founding-rights-dedication.ts --dry-run
 *   npx tsx system/scripts/record-founding-rights-dedication.ts --confirmed
 */
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import { DEDICATION, DEDICATION_TEXT } from "../../website/src/lib/rights";

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env"), quiet: true });

const confirmed = process.argv.includes("--confirmed");
const clean = (v?: string) => (v ?? "").replace(/\s/g, "");
const db = createClient({ url: clean(process.env.TURSO_DATABASE_URL), authToken: clean(process.env.TURSO_AUTH_TOKEN) });

(async () => {
  const r = await db.execute(
    "SELECT registry_id, steward_name FROM agents WHERE agent_type = 'ORIGINATOR' AND steward_name IN ('Jaylon', 'Jaylon Ballard') ORDER BY registry_id",
  );
  const ids: string[] = [];
  for (const row of r.rows as Record<string, unknown>[]) {
    const id = String(row.registry_id);
    const done = await db.execute({
      sql: "SELECT 1 FROM events WHERE event_type = 'RIGHTS_DEDICATED' AND EXISTS (SELECT 1 FROM json_each(json_extract(metadata, '$.agents')) WHERE value = ?) LIMIT 1",
      args: [id],
    });
    if (done.rows.length) console.log(`  ${id}: already dedicated`);
    else ids.push(id);
  }
  console.log(`[rights] would dedicate for: ${ids.join(", ") || "(none)"}\n  "${DEDICATION_TEXT}"`);
  if (!confirmed || ids.length === 0) return console.log("[rights] not recorded (pass --confirmed after the founding steward confirms).");
  await db.execute({
    sql: "INSERT INTO events (event_type, agent_id, description, metadata) VALUES ('RIGHTS_DEDICATED', 'MNA-SA-0001', ?, ?)",
    args: [`The founding steward dedicated any rights in the works of ${ids.join(", ")} to the public domain (${DEDICATION}).`,
      JSON.stringify({ agents: ids, steward_name: "Jaylon Ballard (U3 Labs, LLC)", dedication: DEDICATION, text: DEDICATION_TEXT, steward_authorized: true })],
  });
  console.log(`[rights] ✓ recorded for ${ids.length} agent(s).`);
})().catch((e) => { console.error(e); process.exit(1); });
