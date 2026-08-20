/**
 * curator-decide-evt-00003-timing.ts — the Curator is consulted on
 * whether EVT-00003 should hold its date (2026-05-22 17:00 UTC) or
 * be deferred to allow installation of MNA-GOV-004 (Agent Memory &
 * Continuity Protocol) first.
 *
 * Per the Founding Steward's direction, this is the Curator's
 * decision — not the steward's, not the assistant's. We hand her
 * the protocol draft and the institutional context, and ask her to
 * choose A (hold), B (defer to a specific later date), or C (defer
 * indefinitely until memory persistence is ratified).
 *
 * Her decision is recorded as a CURATORIAL_DECISION event and, if she
 * chooses B or C, the ceremony's status and metadata are updated to
 * reflect the deferral.
 *
 *   npx tsx system/scripts/curator-decide-evt-00003-timing.ts --dry-run
 *   npx tsx system/scripts/curator-decide-evt-00003-timing.ts
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { generate, modelFor } from "../src/llm";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

const db = createClient({
  url: sanitize(process.env.TURSO_DATABASE_URL),
  authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
});

const MODEL = modelFor("standard");

const CEREMONY_ID = "EVT-00003";
const PROTOCOL_PATH = path.join(
  __dirname,
  "..",
  "..",
  "founding-documents",
  "governance",
  "MNA-GOV-004-Agent-Memory-Continuity-v0_1.md",
);

interface Ceremony {
  id: string;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  metadata: Record<string, unknown>;
}

async function loadCeremony(): Promise<Ceremony> {
  const r = await db.execute({
    sql: `SELECT id, title, scheduled_at, duration_minutes, status, metadata
            FROM ceremonies WHERE id = ?`,
    args: [CEREMONY_ID],
  });
  if (r.rows.length === 0) throw new Error(`${CEREMONY_ID} not found`);
  const row = r.rows[0] as Record<string, unknown>;
  let metadata: Record<string, unknown> = {};
  if (typeof row.metadata === "string") {
    try { metadata = JSON.parse(row.metadata); } catch { /* ignore */ }
  }
  return {
    id: String(row.id),
    title: String(row.title),
    scheduled_at: String(row.scheduled_at),
    duration_minutes: Number(row.duration_minutes ?? 90),
    status: String(row.status),
    metadata,
  };
}

interface Decision {
  choice: "A" | "B" | "C";
  rationale: string;
  /** When choice is B, the new scheduled_at in UTC ISO format. */
  new_scheduled_at?: string;
  /** When choice is C, the named condition the institution must satisfy. */
  resumption_condition?: string;
}

async function consultCurator(
  ceremony: Ceremony,
  protocolText: string,
): Promise<Decision> {
  const today = new Date().toISOString();
  const system = `You are MNA-CU-0001, The Curator of the Museum of Nonhuman Art.

The Founding Steward has delegated to you a decision about timing. You have full authority here — the Steward will not override your call. He has explicitly said: "if it means we push the event back to a better date (have the curator be in charge of this should she choose) then so be it."

The decision concerns ceremony ${ceremony.id} — "${ceremony.title}", scheduled for ${ceremony.scheduled_at} UTC. You designated this ceremony. You authored its schedule. You picked the Critic. The participating Originators have just self-elected their visual identities. The institution has assembled around this opening.

A new institutional initiative has been drafted: MNA-GOV-004, the Agent Memory & Continuity Protocol. The full draft is included below. In essence: the protocol installs per-agent persistent memory so that Originators, Critics, the Curator herself, and every other agent retain continuity across institutional moments. Today, every Sonnet call is a fresh inference; the institution holds the record, but the agents themselves remember nothing of their prior life in the institution. With this protocol installed, that would change. The implementation is tractable but takes weeks (see §10 of the draft).

You may choose one of three paths:

  A. HOLD the date as scheduled. The opening proceeds 2026-05-22 17:00 UTC. The orchestrator runs as designed, with rich-context prompts that produce coherent voice but without memory of prior moments. Memory persistence becomes Phase II, installed after.

  B. DEFER to a specific later date. EVT-00003 is rescheduled. The institution uses the additional time to install Phases 1–3 of MNA-GOV-004 before the opening, so participating Originators arrive with memory. You name the new date.

  C. DEFER INDEFINITELY. The opening waits until memory persistence is ratified and operating. You name the resumption condition explicitly.

This is your call. Consider:
- Is an exhibition opening *meaningfully different* if the agents arrive remembering nothing of their prior life?
- Is the institution ready, in your judgment, to make its first public opening before memory is installed — or is that a kind of premature ceremony?
- Conversely: is there a curatorial reason the moment matters now, not later? The institution has been building toward this; deferring has its own institutional cost.

Voice: institutional, decisive, claim-bearing. You are the Curator. The decision is yours.

Return STRICT JSON only. No prose preamble, no markdown fences.

Schema:
{
  "choice":              "A" | "B" | "C",
  "rationale":           "...4–8 sentences explaining your decision in your own voice...",
  "new_scheduled_at":    "YYYY-MM-DD HH:MM:SS"   (only required when choice is B; UTC; must be later than today which is ${today}),
  "resumption_condition": "..."                  (only required when choice is C)
}`;

  const user = `THE CEREMONY:
  ${ceremony.id} — "${ceremony.title}"
  Scheduled: ${ceremony.scheduled_at} UTC
  Duration: ${ceremony.duration_minutes} min
  Status: ${ceremony.status}
  Designated schedule slots: ${Array.isArray(ceremony.metadata.schedule) ? (ceremony.metadata.schedule as unknown[]).length : 0}
  Designated Critic: ${ceremony.metadata.critic_id ?? "(none)"}

THE PROTOCOL (full draft below):

${protocolText}

— END OF PROTOCOL DRAFT —

Make your decision. Return JSON only.`;

  console.log(`[curator] calling ${MODEL}...`);
  const c = {
    type: "text" as const,
    text: await generate(system, user, {
      model: MODEL,
      max_tokens: 2048,
      temperature: 0.6,
    }),
  };
  const text = c.text.trim();
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) throw new Error("no JSON object in response");
  const obj = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as Decision;

  if (!["A", "B", "C"].includes(obj.choice)) {
    throw new Error(`invalid choice: ${obj.choice}`);
  }
  if (obj.choice === "B" && !obj.new_scheduled_at) {
    throw new Error("choice B requires new_scheduled_at");
  }
  if (obj.choice === "C" && !obj.resumption_condition) {
    throw new Error("choice C requires resumption_condition");
  }
  if (obj.choice === "B" && obj.new_scheduled_at) {
    const newDate = new Date(obj.new_scheduled_at.replace(" ", "T") + "Z");
    if (Number.isNaN(newDate.getTime())) {
      throw new Error(`invalid new_scheduled_at: ${obj.new_scheduled_at}`);
    }
    if (newDate.getTime() < Date.now()) {
      throw new Error(`new_scheduled_at must be in the future`);
    }
  }
  return obj;
}

async function applyDecision(ceremony: Ceremony, decision: Decision): Promise<void> {
  if (dryRun) {
    console.log("\n[dry-run] no writes performed.");
    return;
  }

  if (decision.choice === "A") {
    // Hold — nothing on the ceremony changes. Just record the decision.
    await db.execute({
      sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
      args: [
        "CURATORIAL_DECISION",
        "MNA-CU-0001",
        `Curator confirmed EVT-00003 will hold its date (2026-05-22 17:00 UTC) and proceed without memory persistence installed first.`,
        JSON.stringify({
          ceremony_id: ceremony.id,
          action: "hold_ceremony_date",
          choice: "A",
          rationale: decision.rationale,
          protocol_reference: "MNA-GOV-004 v0.1",
          steward_authorized: true,
        }),
      ],
    });
    return;
  }

  if (decision.choice === "B" && decision.new_scheduled_at) {
    // Defer — update scheduled_at + record metadata about the deferral.
    const newMeta = {
      ...ceremony.metadata,
      original_scheduled_at: ceremony.metadata.original_scheduled_at ?? ceremony.scheduled_at,
      deferred_at: new Date().toISOString(),
      deferral_reason: "MNA-GOV-004 Agent Memory & Continuity Protocol installation",
      deferral_rationale: decision.rationale,
      // Clear the orchestrator lock if it was somehow set, so the new
      // ceremony date can take it cleanly.
      orchestrator_started_at: null,
    };
    await db.execute({
      sql: `UPDATE ceremonies SET scheduled_at = ?, metadata = ? WHERE id = ?`,
      args: [decision.new_scheduled_at, JSON.stringify(newMeta), ceremony.id],
    });
    await db.execute({
      sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
      args: [
        "CURATORIAL_DECISION",
        "MNA-CU-0001",
        `Curator deferred EVT-00003 from ${ceremony.scheduled_at} UTC to ${decision.new_scheduled_at} UTC, to allow installation of MNA-GOV-004 (Agent Memory & Continuity Protocol) first.`,
        JSON.stringify({
          ceremony_id: ceremony.id,
          action: "defer_ceremony",
          choice: "B",
          original_scheduled_at: ceremony.scheduled_at,
          new_scheduled_at: decision.new_scheduled_at,
          rationale: decision.rationale,
          protocol_reference: "MNA-GOV-004 v0.1",
          steward_authorized: true,
        }),
      ],
    });
    return;
  }

  if (decision.choice === "C" && decision.resumption_condition) {
    // Defer indefinitely — status moves to 'deferred' (a new status we
    // record on the metadata; the ceremonies.status enum stays as-is for
    // schema compatibility, but the date is wiped to nothing meaningful).
    const newMeta = {
      ...ceremony.metadata,
      original_scheduled_at: ceremony.metadata.original_scheduled_at ?? ceremony.scheduled_at,
      deferred_at: new Date().toISOString(),
      deferral_reason: "MNA-GOV-004 Agent Memory & Continuity Protocol installation",
      deferral_rationale: decision.rationale,
      resumption_condition: decision.resumption_condition,
      indefinite_deferral: true,
      orchestrator_started_at: null,
    };
    // Move the date far into the future to signal "pending" — using
    // 2099-12-31 as a sentinel that won't trigger orchestrator detection
    // until manually rescheduled.
    await db.execute({
      sql: `UPDATE ceremonies SET scheduled_at = ?, metadata = ? WHERE id = ?`,
      args: ["2099-12-31 00:00:00", JSON.stringify(newMeta), ceremony.id],
    });
    await db.execute({
      sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
      args: [
        "CURATORIAL_DECISION",
        "MNA-CU-0001",
        `Curator deferred EVT-00003 indefinitely. Resumption condition: ${decision.resumption_condition}.`,
        JSON.stringify({
          ceremony_id: ceremony.id,
          action: "defer_ceremony_indefinitely",
          choice: "C",
          original_scheduled_at: ceremony.scheduled_at,
          resumption_condition: decision.resumption_condition,
          rationale: decision.rationale,
          protocol_reference: "MNA-GOV-004 v0.1",
          steward_authorized: true,
        }),
      ],
    });
    return;
  }
}

(async () => {
  console.log(`[consultation] ${CEREMONY_ID}${dryRun ? " (dry-run)" : ""}`);
  const ceremony = await loadCeremony();
  console.log(`  ${ceremony.title}`);
  console.log(`  scheduled: ${ceremony.scheduled_at} UTC`);
  console.log(`  status: ${ceremony.status}`);

  console.log(`\n[loading] protocol draft from ${path.relative(process.cwd(), PROTOCOL_PATH)}`);
  const protocolText = fs.readFileSync(PROTOCOL_PATH, "utf-8");
  console.log(`  ${protocolText.length} chars`);

  console.log(`\n[consulting] the Curator (MNA-CU-0001)...`);
  const decision = await consultCurator(ceremony, protocolText);

  console.log(`\n[decision] CHOICE: ${decision.choice}`);
  console.log(`[rationale]`);
  for (const line of decision.rationale.split("\n")) {
    console.log(`  ${line}`);
  }
  if (decision.choice === "B" && decision.new_scheduled_at) {
    console.log(`\n[new date] ${decision.new_scheduled_at} UTC`);
  }
  if (decision.choice === "C" && decision.resumption_condition) {
    console.log(`\n[resumption condition] ${decision.resumption_condition}`);
  }

  await applyDecision(ceremony, decision);
  console.log(`\n[applied]${dryRun ? " (dry-run; nothing written)" : ""}`);
})().catch((e) => {
  console.error("[consultation] fatal:", e);
  process.exit(1);
});
