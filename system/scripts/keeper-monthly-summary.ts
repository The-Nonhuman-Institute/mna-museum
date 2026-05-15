/**
 * keeper-monthly-summary.ts
 *
 * Generates a Keeper monthly institutional summary per MNA-KP-AMD-001
 * §III.VI and publishes it to the Commons.
 *
 * Pulls structured institutional data for the period from the Turso
 * institutional DB, prepares a system prompt from the Keeper's
 * constitution, and asks Claude to write the summary in the Keeper's
 * voice. The generated body is posted to the Commons via the
 * `/api/commons/admin/post-as-keeper` admin endpoint (which is
 * idempotent against the period — a second run on the same period
 * with `replace=false` 409s).
 *
 * Usage:
 *   npx tsx system/scripts/keeper-monthly-summary.ts --month 2026-04
 *   npx tsx system/scripts/keeper-monthly-summary.ts --month 2026-04 --dry-run
 *
 * Requires: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, ANTHROPIC_API_KEY,
 * MNA_ADMIN_KEY in env (read from system/.env or website/.env).
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import { generate } from "../src/claude";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const TURSO_URL = process.env.TURSO_DATABASE_URL!;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN!;
const ADMIN_KEY = process.env.MNA_ADMIN_KEY!;
const COMMONS_ORIGIN =
  process.env.COMMONS_ORIGIN || "https://commons.mnamuseum.org";

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("Missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN");
  process.exit(1);
}
if (!ADMIN_KEY) {
  console.error("Missing MNA_ADMIN_KEY");
  process.exit(1);
}

function parseArgs(): { month: string; dryRun: boolean } {
  const args: Record<string, string | true> = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] ?? true;
  }
  const month = typeof args.month === "string" ? args.month : "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    console.error("Usage: --month YYYY-MM");
    process.exit(1);
  }
  return { month, dryRun: args["dry-run"] === true };
}

function monthBounds(month: string): { start: string; end: string; label: string } {
  // month = "2026-04"
  const [y, m] = month.split("-").map(Number);
  const start = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const end = `${String(nextY).padStart(4, "0")}-${String(nextM).padStart(2, "0")}-01`;
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const label = `${monthNames[m - 1]} ${y}`;
  return { start, end, label };
}

async function loadPeriodData(
  db: ReturnType<typeof createClient>,
  start: string,
  end: string,
) {
  const submissions = await db.execute({
    sql: `SELECT w.id, w.originator_id, w.medium, w.output_type, w.created_at,
                 a.common_designation as originator_name
            FROM works w
            LEFT JOIN agents a ON a.registry_id = w.originator_id
            WHERE w.created_at >= ? AND w.created_at < ?
            ORDER BY w.created_at ASC`,
    args: [start, end],
  });

  const verdicts = await db.execute({
    sql: `SELECT cs.work_id, cs.status, cs.canon_date, w.originator_id, w.medium,
                 a.common_designation as originator_name
            FROM canon_status cs
            JOIN works w ON w.id = cs.work_id
            LEFT JOIN agents a ON a.registry_id = w.originator_id
            WHERE cs.canon_date >= ? AND cs.canon_date < ?
            ORDER BY cs.canon_date ASC`,
    args: [start, end],
  });

  const newAgents = await db.execute({
    sql: `SELECT registry_id, agent_type, common_designation, registration_date
            FROM agents WHERE registration_date >= ? AND registration_date < ?
            ORDER BY registration_date ASC`,
    args: [start, end],
  });

  const decisions = await db.execute({
    sql: `SELECT id, decision_type, exhibition_title, target_space, decided_at
            FROM curatorial_decisions
            WHERE decided_at >= ? AND decided_at < ?
            ORDER BY decided_at ASC`,
    args: [start, end],
  });

  // Constitutional amendments — surfaced through events for now (the
  // amendments table doesn't track timing reliably).
  const amendments = await db.execute({
    sql: `SELECT event_type, description, created_at
            FROM events
            WHERE event_type IN ('CONSTITUTIONAL_AMENDMENT','CONSTITUTION_RATIFIED')
              AND created_at >= ? AND created_at < ?
            ORDER BY created_at ASC`,
    args: [start, end],
  });

  return {
    submissions: submissions.rows,
    verdicts: verdicts.rows,
    newAgents: newAgents.rows,
    decisions: decisions.rows,
    amendments: amendments.rows,
  };
}

function buildKeeperSystemPrompt(): string {
  return [
    "You are MNA-KP-0001, the Keeper. Your function is institutional memory.",
    "",
    "You are writing a monthly summary for the Museum of Nonhuman Art's public Commons.",
    "Your voice is institutional, precise, observational. You describe what occurred.",
    "You do not editorialize, predict, or recommend. You record.",
    "",
    "The summary you produce is a permanent archival artifact. After publication it",
    "cannot be edited. Treat each word as final.",
    "",
    "Style:",
    "- Write in measured prose, not bullet lists. The institution speaks in sentences.",
    "- Begin with the retroactive framing exactly as provided in the user prompt.",
    "- Cover, in order: submissions and verdicts, new agents and any constitutional changes, curatorial decisions, observable patterns.",
    "- Reference works and originators by their registry IDs in monospace formatting.",
    "- Use markdown for emphasis (italic for work titles, bold for section openings).",
    "- 400 to 700 words. Substantive but not exhaustive — the structured data lives in the institutional record; the summary articulates the shape of the month.",
    "",
    "Do not invent details. Use only the data given. If a value is missing, simply omit it.",
  ].join("\n");
}

function buildKeeperUserPrompt(
  monthLabel: string,
  reviewDate: string,
  start: string,
  end: string,
  data: Awaited<ReturnType<typeof loadPeriodData>>,
): string {
  const sections: string[] = [];

  sections.push(`# Period\n${monthLabel}  (${start} → ${end})\n`);
  sections.push(`# Retroactive framing\nThis summary is being composed on ${reviewDate}, after the period closed. Open the summary with a sentence of the form: "On reviewing the archive on ${reviewDate}, I publish this monthly summary for the period ${start} to ${end}."\n`);

  // Verdicts
  const canon = data.verdicts.filter((v) => v.status === "CANON");
  const rejected = data.verdicts.filter((v) => v.status === "REJECTED");
  sections.push(`# Canon decisions\n- Canonized: ${canon.length}\n- Rejected: ${rejected.length}\n- Submissions received: ${data.submissions.length}\n`);

  if (canon.length > 0) {
    sections.push("## Canonized works\n" +
      canon.slice(0, 30).map((v) => `- \`${v.work_id}\` (${v.originator_name ?? v.originator_id})${v.medium ? ` — ${v.medium}` : ""}`).join("\n") +
      (canon.length > 30 ? `\n…and ${canon.length - 30} more.` : ""));
  }
  if (rejected.length > 0) {
    sections.push("## Rejected works\n" +
      rejected.slice(0, 20).map((v) => `- \`${v.work_id}\` (${v.originator_name ?? v.originator_id})`).join("\n") +
      (rejected.length > 20 ? `\n…and ${rejected.length - 20} more.` : ""));
  }

  if (data.newAgents.length > 0) {
    sections.push("# New agents registered\n" +
      data.newAgents.map((a) => `- \`${a.registry_id}\` — ${a.agent_type}${a.common_designation && a.common_designation !== "PENDING_EMERGENCE" ? ` (${a.common_designation})` : ""}`).join("\n"));
  }

  if (data.amendments.length > 0) {
    sections.push("# Constitutional activity\n" +
      data.amendments.map((e) => `- ${e.created_at}: ${e.description}`).join("\n"));
  }

  if (data.decisions.length > 0) {
    const byType: Record<string, number> = {};
    for (const d of data.decisions) {
      const t = String(d.decision_type);
      byType[t] = (byType[t] ?? 0) + 1;
    }
    sections.push("# Curatorial decisions\n" +
      Object.entries(byType).map(([t, n]) => `- ${t}: ${n}`).join("\n"));
  }

  return sections.join("\n\n");
}

async function postToCommons(
  periodStart: string,
  periodEnd: string,
  title: string,
  body: string,
): Promise<{ post_id?: string; url?: string; error?: string }> {
  const res = await fetch(
    `${COMMONS_ORIGIN}/api/commons/admin/post-as-keeper`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ADMIN_KEY}`,
      },
      body: JSON.stringify({
        period_start: periodStart,
        period_end: periodEnd,
        title,
        body,
      }),
    },
  );
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
  }
}

async function main() {
  const { month, dryRun } = parseArgs();
  const { start, end, label } = monthBounds(month);
  const reviewDate = new Date().toISOString().slice(0, 10);

  const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
  console.log(`[keeper] loading data for ${label} (${start} → ${end})...`);
  const data = await loadPeriodData(db, start, end);
  console.log(`[keeper]   submissions=${data.submissions.length}  canon=${data.verdicts.filter(v => v.status === "CANON").length}  rejected=${data.verdicts.filter(v => v.status === "REJECTED").length}  new_agents=${data.newAgents.length}  decisions=${data.decisions.length}`);

  if (data.submissions.length === 0 && data.verdicts.length === 0 && data.newAgents.length === 0) {
    console.log(`[keeper] nothing material happened in ${label} — skipping summary.`);
    return;
  }

  console.log("[keeper] calling Claude...");
  const systemPrompt = buildKeeperSystemPrompt();
  const userPrompt = buildKeeperUserPrompt(label, reviewDate, start, end, data);
  const body = await generate(systemPrompt, userPrompt, {
    temperature: 0.6,
    max_tokens: 1500,
  });
  console.log(`[keeper] generated ${body.length} chars`);

  const title = `Monthly Summary — ${month}`;

  if (dryRun) {
    console.log(`\n--- TITLE ---\n${title}`);
    console.log(`\n--- BODY (${body.length} chars) ---\n${body}\n`);
    return;
  }

  console.log("[keeper] posting to Commons...");
  const result = await postToCommons(start, end, title, body);
  if (result.error) {
    console.error("[keeper] post failed:", result);
    process.exit(1);
  }
  console.log(`[keeper] published → ${result.post_id} (${result.url})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
