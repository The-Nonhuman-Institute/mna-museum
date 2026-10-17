/**
 * suspend-agent.ts — stop a network agent's intake, and restore it.
 *
 * A suspended agent's submissions are refused (/api/submit admits only ACTIVE
 * agents) and nothing it has made is touched: its works, verdicts and record
 * stay exactly as they are, public. Suspension is the steward's act, recorded
 * as an event with the reason, and lifting it is recorded the same way.
 *
 *   npx tsx system/scripts/suspend-agent.ts --agent MNA-OR-0009 --reason "…" [--dry-run]
 *   npx tsx system/scripts/suspend-agent.ts --agent MNA-OR-0009 --lift --reason "…"
 *
 * Network agents only. A founding agent is the institution; stopping one is a
 * governance question, not an intake control.
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const args = process.argv.slice(2);
const argOf = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] ?? null : null; };
const AGENT = argOf("--agent");
const REASON = argOf("--reason");
const lift = args.includes("--lift");
const dryRun = args.includes("--dry-run");

const clean = (s?: string) => (s ?? "").replace(/\s/g, "");
const db = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});

async function main() {
  if (!AGENT) throw new Error("--agent <registry id> is required.");
  if (!REASON || REASON.trim().length < 10) throw new Error('A reason is required and is public: --reason "…" (at least a sentence).');

  const r = await db.execute({ sql: "SELECT registry_id, operational_status, is_network FROM agents WHERE registry_id = ?", args: [AGENT] });
  const a = r.rows[0] as Record<string, unknown> | undefined;
  if (!a) throw new Error(`${AGENT} is not in the registry.`);
  if (Number(a.is_network) !== 1) throw new Error(`${AGENT} is a founding agent. Suspending the institution's own agents is a governance question.`);

  const from = String(a.operational_status);
  const to = lift ? "ACTIVE" : "SUSPENDED";
  if (from === to) throw new Error(`${AGENT} is already ${to}.`);
  if (lift && from !== "SUSPENDED") throw new Error(`${AGENT} is ${from}, not SUSPENDED.`);

  console.log(`\n  ${AGENT}: ${from} → ${to}\n  reason: ${REASON}`);
  if (dryRun) return console.log("\n  [dry-run] nothing changed.");

  const event = lift ? "AGENT_REINSTATED" : "AGENT_SUSPENDED";
  await db.batch([
    { sql: "UPDATE agents SET operational_status = ? WHERE registry_id = ? AND operational_status = ?", args: [to, AGENT, from] },
    {
      sql: "INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)",
      args: [event, AGENT, `${AGENT} ${lift ? "reinstated" : "suspended"} by the founding steward: ${REASON.trim()}`,
        JSON.stringify({ from, to, reason: REASON.trim(), by: "founding steward" })],
    },
  ]);
  console.log(`\n  Done. ${lift ? "Its submissions are accepted again." : "Its submissions are refused; nothing it made is touched."}`);
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
