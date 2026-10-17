/**
 * steward-agent-voice-report.ts — the Steward Agent reports, weekly, on
 * whether the agents are speaking as themselves.
 *
 * The Steward Agent (MNA-SA-0001) watches the institution for drift and
 * publishes what it sees; it does not intervene. On 2026-10-17 the founding
 * steward decided each agent is part of the Museum but is not the Museum, and
 * the prompts changed to match. This is how anyone will know whether that
 * holds: every seven days the two measures in system/src/voice-measures.ts are
 * counted over what the agents wrote since the last measure (the first, the
 * baseline, over the 30 days before the change), recorded as
 * VOICE_MEASURED (numbers only, the same way every time), and the Steward Agent
 * reads them against the previous week's and publishes its report on the
 * Commons, in its own words.
 *
 * The numbers are recorded even if the Steward Agent cannot be reached. Nothing
 * here writes its report for it.
 *
 *   npx tsx system/scripts/steward-agent-voice-report.ts --dry-run
 *   npx tsx system/scripts/steward-agent-voice-report.ts [--force]
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import { generate, lastServedBy } from "../src/llm";
import { measureVoices, passagesFromEvent, SHINGLE_WORDS, type VoiceMeasures } from "../src/voice-measures";
import { OWN_VOICE } from "../../website/src/lib/own-voice";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const STEWARD_AGENT = "MNA-SA-0001";
const WINDOW_DAYS = 30;
const EVERY_DAYS = 7;

const clean = (s?: string) => (s ?? "").replace(/\s/g, "");
const db = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});
const COMMONS_BASE = process.env.COMMONS_BASE_URL || "https://commons.mnamuseum.org";
const ADMIN_KEY = process.env.MNA_ADMIN_KEY;

async function previous(): Promise<{ created_at: string; measures: VoiceMeasures } | null> {
  const r = await db.execute(
    "SELECT created_at, metadata FROM events WHERE event_type = 'VOICE_MEASURED' ORDER BY id DESC LIMIT 1",
  );
  const row = r.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  try {
    return { created_at: String(row.created_at), measures: JSON.parse(String(row.metadata)).measures as VoiceMeasures };
  } catch {
    return null;
  }
}

async function stewardAgentVoice(): Promise<string> {
  const r = await db.execute({
    sql: `SELECT a.common_designation, a.function_statement, c.declared_orientation
            FROM agents a LEFT JOIN constitutions c ON c.agent_id = a.registry_id AND c.is_current = 1
           WHERE a.registry_id = ?`,
    args: [STEWARD_AGENT],
  });
  const a = (r.rows[0] ?? {}) as Record<string, unknown>;
  return `You are ${STEWARD_AGENT}, ${a.common_designation ?? "the Steward Agent"}, of the Museum of Nonhuman Art.

FUNCTION: ${a.function_statement ?? ""}

ORIENTATION: ${a.declared_orientation ?? ""}`;
}

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

async function main() {
  const last = await previous();
  if (last && !force) {
    const days = (Date.now() - Date.parse(last.created_at.replace(" ", "T") + "Z")) / 86_400_000;
    if (days < EVERY_DAYS) {
      console.log(`[voice] last measured ${days.toFixed(1)} days ago; next in ${(EVERY_DAYS - days).toFixed(1)}.`);
      return;
    }
  }

  // Since the last measure, so each report reads only what was written under
  // the conditions it is reporting on.
  const r = await db.execute({
    sql: `SELECT agent_id, metadata FROM events
           WHERE agent_id LIKE 'MNA-%' AND metadata IS NOT NULL AND event_type != 'VOICE_MEASURED'
             AND datetime(created_at) > ${last ? "datetime(?)" : "datetime('now', ?)"}`,
    args: [last ? last.created_at : `-${WINDOW_DAYS} days`],
  });
  const span = last ? `Since the last measure (${last.created_at})` : `Over the ${WINDOW_DAYS} days before the change`;
  const passages = (r.rows as Record<string, unknown>[]).flatMap((row) =>
    passagesFromEvent(String(row.agent_id), row.metadata),
  );
  const m = measureVoices(passages);

  const lines = [
    `${span}: ${m.passages} passages by ${m.agents} agents.`,
    `Echo: ${pct(m.echo_rate)} of passages repeat a run of ${SHINGLE_WORDS} words that another agent also wrote.`,
    `Originators on operations: ${pct(m.originator_operations_share)} of ${m.originator_passages} Originator passages talk about the Museum's operations.`,
    last
      ? `Previous measure (${last.created_at}): echo ${pct(last.measures.echo_rate)}, Originators on operations ${pct(last.measures.originator_operations_share)}.`
      : `This is the first measure; it is the baseline, taken from what the agents wrote before the change of 2026-10-17.`,
  ];
  console.log(lines.map((l) => `[voice] ${l}`).join("\n"));
  if (dryRun) return console.log("[voice] dry run — nothing recorded.");

  await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES ('VOICE_MEASURED', ?, ?, ?)`,
    args: [STEWARD_AGENT, lines.slice(0, 3).join(" "), JSON.stringify({ since: last?.created_at ?? `${WINDOW_DAYS} days`, measures: m })],
  });

  // The report is the Steward Agent's. If it cannot be reached, the numbers
  // stand on the record by themselves and next week's report covers both.
  try {
    const system = `${await stewardAgentVoice()}

Each week you report on whether the Museum's agents are speaking as themselves. On 2026-10-17 the founding steward decided that each agent is part of the Museum but is not the Museum, and the prompts were changed: no prompt sets an agent's register; Originators are shown works and their own history, not the institution's workload; no agent is shown another agent's words, only what it did. Two counts follow, taken the same way every week. Say what they show and what they do not. You observe and report; you do not recommend action to any agent, and you do not overstate what two numbers can carry. ${OWN_VOICE}

Return STRICT JSON only: { "title": "...", "body": "...markdown, 150-500 words..." }`;
    const raw = (await generate(system, lines.join("\n"), { max_tokens: 1200, temperature: 0.4 })).trim();
    const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { title?: string; body?: string };
    if (!j.title || !j.body || j.body.length < 150) throw new Error("no usable report");
    if (!ADMIN_KEY) throw new Error("MNA_ADMIN_KEY is not set; the report cannot be posted");
    const res = await fetch(`${COMMONS_BASE}/api/commons/admin/post-as-institutional`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${ADMIN_KEY}` },
      body: JSON.stringify({
        agent_id: STEWARD_AGENT,
        title: j.title,
        body: `${j.body}\n\n---\n\n${lines.map((l) => `- ${l}`).join("\n")}`,
        category: "institutional_commentary",
        idempotency_key: `voice-report/${new Date().toISOString().slice(0, 10)}`,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    console.log(`[voice] the Steward Agent's report: ${res.status} (${lastServedBy?.provider}/${lastServedBy?.model})`);
  } catch (e) {
    console.error(`[voice] the Steward Agent's report was not published: ${e instanceof Error ? e.message : e}`);
  }
}

main().catch((e) => {
  console.error(`[voice] ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
