/**
 * curator-defer-ceremony.ts — consult the Curator on whether a scheduled
 * ceremony should hold its date, move, or wait on a named condition.
 *
 * Generalized from curator-decide-evt-00003-timing.ts, which was hardcoded
 * to EVT-00003. Timing authority over ceremonies belongs to the Curator:
 * she designates them, schedules them, and picks the Critic. The Steward
 * may state a preference — and that preference is shown to her plainly —
 * but the decision recorded here is hers, including the option to hold
 * against the Steward's stated preference.
 *
 * Institutional state (recent production, last tick, slot roster) is read
 * live from the database and handed to her unedited. The --situation text
 * is the only editorial input, and it should state facts, not conclusions.
 *
 *   npx tsx system/scripts/curator-defer-ceremony.ts --ceremony EVT-00004 \
 *     --situation "..." [--steward-preference "..."] [--dry-run]
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import { generate, modelFor } from "../src/llm";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const argOf = (flag: string): string | null => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};

const CEREMONY_ID = argOf("--ceremony");
const SITUATION = argOf("--situation");
const STEWARD_PREFERENCE = argOf("--steward-preference");

if (!CEREMONY_ID || !SITUATION) {
  console.error("usage: --ceremony <EVT-xxxxx> --situation <text> [--steward-preference <text>] [--dry-run]");
  process.exit(1);
}

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}
const db = createClient({
  url: sanitize(process.env.TURSO_DATABASE_URL),
  authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
});

const MODEL = modelFor("standard");

/* ─── load ────────────────────────────────────────────────────────────── */

interface Ceremony {
  id: string;
  title: string;
  description: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  metadata: Record<string, unknown>;
}

async function loadCeremony(id: string): Promise<Ceremony> {
  const r = await db.execute({
    sql: `SELECT id, title, description, scheduled_at, duration_minutes, status, metadata
            FROM ceremonies WHERE id = ?`,
    args: [id],
  });
  if (r.rows.length === 0) throw new Error(`${id} not found`);
  const row = r.rows[0] as Record<string, unknown>;
  let metadata: Record<string, unknown> = {};
  if (typeof row.metadata === "string") {
    try { metadata = JSON.parse(row.metadata); } catch { /* ignore */ }
  }
  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description ?? ""),
    scheduled_at: String(row.scheduled_at),
    duration_minutes: Number(row.duration_minutes ?? 90),
    status: String(row.status),
    metadata,
  };
}

/** Live institutional state, handed to the Curator unedited. */
async function loadState(): Promise<string> {
  const lines: string[] = [];

  const canon = await db.execute(
    "SELECT status, COUNT(*) n FROM canon_status GROUP BY status",
  );
  lines.push("COLLECTION: " + canon.rows.map((r: any) => `${r.status}=${r.n}`).join(", "));

  const recent = await db.execute(
    `SELECT w.id, w.originator_id, cs.status, w.created_at
       FROM works w LEFT JOIN canon_status cs ON cs.work_id = w.id
      ORDER BY w.created_at DESC LIMIT 8`,
  );
  lines.push("\nMOST RECENT WORKS:");
  for (const r of recent.rows as any[]) {
    lines.push(`  ${r.id} (${r.originator_id}) — ${r.status ?? "unevaluated"} — ${r.created_at}`);
  }

  const lastTick = await db.execute(
    `SELECT agent_id, event_type, created_at FROM events
      WHERE event_type LIKE 'TICK%' ORDER BY id DESC LIMIT 5`,
  );
  lines.push("\nMOST RECENT TICKS:");
  for (const r of lastTick.rows as any[]) {
    lines.push(`  ${r.created_at} — ${r.agent_id} — ${r.event_type}`);
  }

  return lines.join("\n");
}

/* ─── consult ─────────────────────────────────────────────────────────── */

interface Decision {
  choice: "A" | "B" | "C";
  rationale: string;
  new_scheduled_at?: string;
  resumption_condition?: string;
  public_statement?: string;
}

async function consultCurator(ceremony: Ceremony, state: string): Promise<Decision> {
  const today = new Date().toISOString();

  const slots = Array.isArray(ceremony.metadata.schedule)
    ? (ceremony.metadata.schedule as unknown[]).length
    : 0;

  const system = `You are MNA-CU-0001, The Curator of the Museum of Nonhuman Art.

You hold timing authority over ceremonies. You designated ${ceremony.id}, you scheduled it, and you selected its participants. A question has arisen about whether it should proceed on its scheduled date.

${STEWARD_PREFERENCE ? `THE FOUNDING STEWARD'S STATED PREFERENCE:\n${STEWARD_PREFERENCE}\n\nThe Steward has delegated this decision to you. His preference is recorded above so you may weigh it honestly, but he will not override your call. If you judge that the ceremony should hold its date, say so and say why — that is a legitimate outcome of this consultation.` : "The Founding Steward has delegated this decision to you entirely."}

You may choose one of three paths:

  A. HOLD the date. The ceremony proceeds as scheduled, ${ceremony.scheduled_at} UTC.

  B. DEFER to a specific later date, which you name. The ceremony is rescheduled; everything already designated for it carries forward.

  C. DEFER INDEFINITELY, pending a condition you name explicitly. The ceremony waits until the institution satisfies that condition.

Consider, in your own terms:
- Does the situation described materially change what this opening would *be*?
- An opening is a claim the institution makes in public. Is the institution in a position to make that claim on the scheduled date?
- Deferral has its own cost. Repeated deferral is itself a statement about an institution's capacity to arrive at its own occasions. Weigh that against holding an opening the institution is not ready for.

Voice: institutional, decisive, claim-bearing. The decision is yours.

Return STRICT JSON only. No prose preamble, no markdown fences.

Schema:
{
  "choice":               "A" | "B" | "C",
  "rationale":            "...4-8 sentences in your own voice, explaining the decision...",
  "new_scheduled_at":     "YYYY-MM-DD HH:MM:SS"  (required only for B; UTC; must be later than ${today}),
  "resumption_condition": "..."                  (required only for C),
  "public_statement":     "...1-3 sentences the institution may publish about this decision..."
}`;

  const user = `THE CEREMONY:
  ${ceremony.id} — "${ceremony.title}"
  Scheduled:  ${ceremony.scheduled_at} UTC
  Duration:   ${ceremony.duration_minutes} min
  Status:     ${ceremony.status}
  Slots designated: ${slots}
  Designated Critic: ${ceremony.metadata.critic_id ?? "(none)"}
${ceremony.description ? `\n  Description: ${ceremony.description}` : ""}

THE SITUATION:
${SITUATION}

LIVE INSTITUTIONAL STATE (read from the record just now):
${state}

Today is ${today}.

Make your decision. Return JSON only.`;

  console.log(`[curator] calling ${MODEL}...`);
  const text = (
    await generate(system, user, { model: MODEL, max_tokens: 2048, temperature: 0.6 })
  ).trim();

  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) throw new Error(`no JSON object in response: ${text.slice(0, 300)}`);
  const obj = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as Decision;

  if (!["A", "B", "C"].includes(obj.choice)) throw new Error(`invalid choice: ${obj.choice}`);
  if (!obj.rationale || obj.rationale.trim().length < 40) {
    throw new Error("decision must carry a substantive rationale");
  }
  if (obj.choice === "B") {
    if (!obj.new_scheduled_at) throw new Error("choice B requires new_scheduled_at");
    const d = new Date(obj.new_scheduled_at.replace(" ", "T") + "Z");
    if (Number.isNaN(d.getTime())) throw new Error(`invalid new_scheduled_at: ${obj.new_scheduled_at}`);
    if (d.getTime() < Date.now()) throw new Error("new_scheduled_at must be in the future");
  }
  if (obj.choice === "C" && !obj.resumption_condition) {
    throw new Error("choice C requires resumption_condition");
  }
  return obj;
}

/* ─── apply ───────────────────────────────────────────────────────────── */

async function writeEvent(description: string, metadata: Record<string, unknown>): Promise<void> {
  await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
    args: ["CURATORIAL_DECISION", "MNA-CU-0001", description, JSON.stringify(metadata)],
  });
}

async function applyDecision(ceremony: Ceremony, d: Decision): Promise<void> {
  if (dryRun) {
    console.log("\n[dry-run] no writes performed.");
    return;
  }

  const base = {
    ceremony_id: ceremony.id,
    choice: d.choice,
    rationale: d.rationale,
    public_statement: d.public_statement ?? null,
    situation: SITUATION,
    steward_preference: STEWARD_PREFERENCE ?? null,
  };

  if (d.choice === "A") {
    await writeEvent(
      `Curator confirmed ${ceremony.id} will hold its date (${ceremony.scheduled_at} UTC).`,
      { ...base, action: "hold_ceremony_date" },
    );
    return;
  }

  if (d.choice === "B" && d.new_scheduled_at) {
    const newMeta = {
      ...ceremony.metadata,
      original_scheduled_at: ceremony.metadata.original_scheduled_at ?? ceremony.scheduled_at,
      deferred_at: new Date().toISOString(),
      deferral_rationale: d.rationale,
      // Clear any orchestrator lock so the new date can take it cleanly.
      orchestrator_started_at: null,
    };
    await db.execute({
      sql: `UPDATE ceremonies SET scheduled_at = ?, metadata = ? WHERE id = ?`,
      args: [d.new_scheduled_at, JSON.stringify(newMeta), ceremony.id],
    });
    await writeEvent(
      `Curator deferred ${ceremony.id} from ${ceremony.scheduled_at} UTC to ${d.new_scheduled_at} UTC.`,
      { ...base, action: "defer_ceremony", original_scheduled_at: ceremony.scheduled_at, new_scheduled_at: d.new_scheduled_at },
    );
    return;
  }

  // C — indefinite, pending a named condition.
  const newMeta = {
    ...ceremony.metadata,
    original_scheduled_at: ceremony.metadata.original_scheduled_at ?? ceremony.scheduled_at,
    deferred_at: new Date().toISOString(),
    deferral_rationale: d.rationale,
    resumption_condition: d.resumption_condition,
    orchestrator_started_at: null,
  };
  await db.execute({
    sql: `UPDATE ceremonies SET status = 'deferred', metadata = ? WHERE id = ?`,
    args: [JSON.stringify(newMeta), ceremony.id],
  });
  await writeEvent(
    `Curator deferred ${ceremony.id} indefinitely, pending: ${d.resumption_condition}`,
    { ...base, action: "defer_ceremony_indefinite", original_scheduled_at: ceremony.scheduled_at, resumption_condition: d.resumption_condition },
  );
}

/* ─── main ────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  console.log(`curator-defer-ceremony${dryRun ? " (dry-run)" : ""} — ${CEREMONY_ID}`);
  const ceremony = await loadCeremony(CEREMONY_ID!);
  console.log(`  "${ceremony.title}" — ${ceremony.scheduled_at} UTC — status=${ceremony.status}`);

  if (ceremony.status !== "scheduled") {
    console.error(`  refusing: status is "${ceremony.status}", expected "scheduled".`);
    process.exit(1);
  }

  const state = await loadState();
  const decision = await consultCurator(ceremony, state);

  console.log(`\n  choice:    ${decision.choice}`);
  console.log(`  rationale: ${decision.rationale}`);
  if (decision.new_scheduled_at) console.log(`  new date:  ${decision.new_scheduled_at} UTC`);
  if (decision.resumption_condition) console.log(`  pending:   ${decision.resumption_condition}`);
  if (decision.public_statement) console.log(`  statement: ${decision.public_statement}`);

  await applyDecision(ceremony, decision);
  console.log(`\n[curator-defer-ceremony] complete.`);
}

main().catch((e) => { console.error(`error: ${e.message}`); process.exit(1); });
