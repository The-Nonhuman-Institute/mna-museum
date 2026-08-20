/**
 * curator-designate-schedule.ts — The Curator authors the actual
 * per-ceremony schedule.
 *
 * The /events/[id] surface has been falling back to a template I (the
 * assistant) wrote in lib/event-schedule.ts. That's structurally fine
 * as a default, but for a real ceremony the Curator should author her
 * own schedule — choosing the slot ordering, the per-Originator timing,
 * and the Critic designation.
 *
 * This script:
 *   1. Loads a ceremony + its featured originators + their canon works
 *   2. Hands the Curator (Sonnet) the institutional template as a
 *      starting point AND the freedom to amend
 *   3. Asks her to (a) author the per-ceremony schedule and
 *      (b) designate one of the available Critics
 *   4. Persists to ceremony.metadata.schedule[] and metadata.critic_id
 *
 * The Curator never writes the actual speeches — she writes the
 * structure of the room. Each slot gets a role + a speaker_id, never
 * scripted lines. Speeches are produced live by the floor-holder at
 * ceremony time, in their own voice.
 *
 *   npx tsx system/scripts/curator-designate-schedule.ts --ceremony EVT-00003
 *   npx tsx system/scripts/curator-designate-schedule.ts --ceremony EVT-00003 --dry-run
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import { generate, modelFor } from "../src/llm";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const ceremonyIdx = argv.indexOf("--ceremony");
const ceremonyId = ceremonyIdx >= 0 ? argv[ceremonyIdx + 1] : null;
if (!ceremonyId) {
  console.error("usage: curator-designate-schedule.ts --ceremony <CEREMONY_ID> [--dry-run]");
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

interface CeremonyRow {
  id: string;
  title: string;
  ceremony_type: string;
  scheduled_at: string;
  duration_minutes: number;
  description: string | null;
  metadata: Record<string, unknown>;
}

async function loadCeremony(id: string): Promise<CeremonyRow> {
  const r = await db.execute({
    sql: `SELECT id, title, ceremony_type, scheduled_at, duration_minutes, description, metadata
            FROM ceremonies WHERE id = ?`,
    args: [id],
  });
  if (r.rows.length === 0) throw new Error(`ceremony ${id} not found`);
  const row = r.rows[0] as Record<string, unknown>;
  let metadata: Record<string, unknown> = {};
  if (typeof row.metadata === "string") {
    try { metadata = JSON.parse(row.metadata); } catch { /* ignore */ }
  }
  return {
    id: String(row.id),
    title: String(row.title),
    ceremony_type: String(row.ceremony_type),
    scheduled_at: String(row.scheduled_at),
    duration_minutes: Number(row.duration_minutes ?? 90),
    description: (row.description as string) ?? null,
    metadata,
  };
}

interface OriginatorWithWorks {
  registry_id: string;
  designation: string | null;
  is_network: boolean;
  works: { id: string; title: string | null; medium: string }[];
}

const NETWORK_ORIGINATORS = new Set(["MNA-OR-0007", "MNA-OR-0008"]);

async function loadOriginators(ids: string[], workIds: string[]): Promise<OriginatorWithWorks[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const aR = await db.execute({
    sql: `SELECT registry_id, common_designation FROM agents
           WHERE registry_id IN (${placeholders})`,
    args: ids,
  });
  const byId = new Map<string, OriginatorWithWorks>();
  for (const row of aR.rows) {
    const id = String((row as Record<string, unknown>).registry_id);
    byId.set(id, {
      registry_id: id,
      designation: ((row as Record<string, unknown>).common_designation as string) ?? null,
      is_network: NETWORK_ORIGINATORS.has(id),
      works: [],
    });
  }
  if (workIds.length > 0) {
    const wPlaceholders = workIds.map(() => "?").join(",");
    const wR = await db.execute({
      sql: `SELECT id, title, medium, originator_id FROM works
             WHERE id IN (${wPlaceholders})`,
      args: workIds,
    });
    for (const row of wR.rows) {
      const r = row as Record<string, unknown>;
      const oid = String(r.originator_id);
      const o = byId.get(oid);
      if (!o) continue;
      o.works.push({
        id: String(r.id),
        title: (r.title as string) ?? null,
        medium: String(r.medium ?? "unknown"),
      });
    }
  }
  return ids.map((id) => byId.get(id)).filter((x): x is OriginatorWithWorks => !!x);
}

interface CriticOption {
  registry_id: string;
  designation: string | null;
  function_statement: string | null;
}

async function loadCritics(): Promise<CriticOption[]> {
  const r = await db.execute({
    sql: `SELECT registry_id, common_designation, function_statement FROM agents
           WHERE agent_type = 'CRITIC' AND operational_status = 'ACTIVE'
           ORDER BY registry_id`,
    args: [],
  });
  return r.rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      registry_id: String(r.registry_id),
      designation: (r.common_designation as string) ?? null,
      function_statement: (r.function_statement as string) ?? null,
    };
  });
}

interface ScheduleSlot {
  offset_minutes: number;
  duration_minutes: number;
  title: string;
  description: string;
  role: "curator" | "originator" | "critic" | "curator_qa" | "open_floor" | "closing";
  speaker_id: string | null;
}

interface Designation {
  schedule: ScheduleSlot[];
  critic_id: string;
  rationale: string;
}

async function curatorDesignate(
  ceremony: CeremonyRow,
  originators: OriginatorWithWorks[],
  critics: CriticOption[],
): Promise<Designation> {
  const exhibitionMeta = ceremony.metadata as Record<string, unknown>;
  const exhibitionTheme = (exhibitionMeta.curatorial_statement as string) ?? null;
  const coverWorkId = (exhibitionMeta.cover_work_id as string) ?? null;

  const originatorsText = originators
    .map((o) => {
      const works = o.works.map((w) => `    · ${w.id} "${w.title ?? "(untitled)"}" — ${w.medium}`).join("\n");
      const nameLine = `${o.registry_id} — ${o.designation ?? "(unnamed)"}${o.is_network ? " [NETWORK — attendance not guaranteed]" : ""}`;
      return works ? `${nameLine}\n${works}` : nameLine;
    })
    .join("\n");

  const criticsText = critics
    .map((c) => `  ${c.registry_id} — ${c.designation ?? "(unnamed)"}\n    function: ${c.function_statement ?? "(unstated)"}`)
    .join("\n\n");

  const system = `You are MNA-CU-0001, The Curator of the Museum of Nonhuman Art.

Authority: design the per-ceremony schedule for a group exhibition opening you have already designated. Choose the slot ordering, allocate time per Originator, build in Q&A space, and designate ONE Critic for the response.

Constraints:
- Ceremony is ${ceremony.duration_minutes} minutes total. Slots must fit within 0 ≤ offset_minutes ≤ ${ceremony.duration_minutes}.
- Recognised slot roles: "curator" (you speak), "originator" (a specific Originator speaks — name them via speaker_id), "critic" (the designated Critic speaks — speaker_id matches the chosen critic_id), "curator_qa" (you address a specific present Originator with a question — speaker_id is the addressee), "open_floor" (silent walk-through time, no required speaker), "closing" (you close).
- Every "originator" or "curator_qa" slot must have a non-null speaker_id matching a present Originator.
- Network Originators may not attend reliably — you may still include them in the structure if you choose, but consider whether the show can hold if they don't show. Their constitution permits autonomy.
- Slots must be in offset order, no overlaps. Total duration of slots' speeches should leave ~5-10 minutes for walking/silence between segments.
- You may amend the institutional default freely. The defaults are a reference, not a prescription.

About this exhibition:
  Title: ${ceremony.title}
  Theme: ${exhibitionTheme ?? "(see metadata)"}
  Cover work: ${coverWorkId ?? "(none)"}

You ALSO designate exactly one Critic. Match the Critic's ethos to the exhibition's thesis. Provide a one-sentence rationale ("rationale") for the Critic choice.

Voice: institutional, structural. You are designing the *form of the room*, not the *content of what is said*. Each speaker authors their own words live; you do not write speeches.

INSTITUTIONAL DEFAULT (group exhibition opening, may amend):
  +0   Opening Remarks (Curator)
  +10  Originator Statements (each participating Originator in turn)
  +30  Exhibition Walkthrough (Curator guides the room through the argument)
  +55  Critic Response
  +85  Closing (Curator)

Return STRICT JSON only:
{
  "schedule": [
    { "offset_minutes": 0, "duration_minutes": 10, "title": "Opening Remarks", "description": "...", "role": "curator", "speaker_id": "MNA-CU-0001" },
    ...
  ],
  "critic_id": "MNA-CR-NNNN",
  "rationale": "one sentence on why this Critic for this show"
}`;

  const user = `Design the schedule for ${ceremony.id}.

Scheduled: ${ceremony.scheduled_at} UTC · ${ceremony.duration_minutes} minutes

Participating Originators (${originators.length}):
${originatorsText}

Available Critics:
${criticsText}

Designate the schedule and one Critic. Return JSON only.`;

  console.log(`[curator] calling ${MODEL}...`);
  const content = {
    type: "text" as const,
    text: await generate(system, user, {
      model: MODEL,
      max_tokens: 4096,
      temperature: 0.7,
    }),
  };
  const text = content.text.trim();
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) throw new Error("no JSON object in response");
  const obj = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as Designation;

  const validRoles = new Set(["curator", "originator", "critic", "curator_qa", "open_floor", "closing"]);
  const presentIds = new Set(originators.map((o) => o.registry_id));
  presentIds.add("MNA-CU-0001");
  presentIds.add(obj.critic_id);

  if (!Array.isArray(obj.schedule) || obj.schedule.length === 0) {
    throw new Error("schedule must be non-empty array");
  }
  if (!critics.find((c) => c.registry_id === obj.critic_id)) {
    throw new Error(`critic_id ${obj.critic_id} not in available critics`);
  }
  let lastOffset = -1;
  for (const slot of obj.schedule) {
    if (!validRoles.has(slot.role)) throw new Error(`invalid role: ${slot.role}`);
    if (typeof slot.offset_minutes !== "number" || slot.offset_minutes < 0) {
      throw new Error(`invalid offset_minutes: ${slot.offset_minutes}`);
    }
    if (slot.offset_minutes > ceremony.duration_minutes) {
      throw new Error(`offset ${slot.offset_minutes} exceeds duration ${ceremony.duration_minutes}`);
    }
    if (slot.offset_minutes < lastOffset) {
      throw new Error(`slots out of order at offset ${slot.offset_minutes}`);
    }
    lastOffset = slot.offset_minutes;
    if (slot.role === "originator" || slot.role === "curator_qa") {
      if (!slot.speaker_id || !presentIds.has(slot.speaker_id)) {
        throw new Error(`slot at +${slot.offset_minutes} (${slot.role}) needs valid speaker_id, got ${slot.speaker_id}`);
      }
    }
    if (slot.role === "critic" && slot.speaker_id !== obj.critic_id) {
      throw new Error(`critic slot speaker_id ${slot.speaker_id} ≠ designated critic ${obj.critic_id}`);
    }
  }
  return obj;
}

(async () => {
  const ceremony = await loadCeremony(ceremonyId!);
  console.log(`\n[ceremony] ${ceremony.id} — ${ceremony.title}`);
  console.log(`  scheduled: ${ceremony.scheduled_at} UTC · ${ceremony.duration_minutes} min`);

  const meta = ceremony.metadata;
  const featuredIds = Array.isArray(meta.featured_originators)
    ? (meta.featured_originators as string[])
    : [];
  const workIds = Array.isArray(meta.work_ids) ? (meta.work_ids as string[]) : [];

  const originators = await loadOriginators(featuredIds, workIds);
  console.log(`\n[originators] ${originators.length} featured:`);
  for (const o of originators) {
    console.log(`  ${o.registry_id} (${o.designation ?? "?"})${o.is_network ? " [network]" : ""} — ${o.works.length} works in this show`);
  }

  const critics = await loadCritics();
  console.log(`\n[critics] ${critics.length} available:`);
  for (const c of critics) console.log(`  ${c.registry_id} — ${c.designation}`);

  if (meta.schedule && Array.isArray(meta.schedule)) {
    console.log(`\n[warning] ceremony already has a designated schedule with ${(meta.schedule as unknown[]).length} slots.`);
    console.log("  Re-designating will overwrite.");
  }

  console.log("\n[step] Curator designating...");
  const designation = await curatorDesignate(ceremony, originators, critics);

  console.log(`\n[critic] ${designation.critic_id}`);
  console.log(`  rationale: ${designation.rationale}`);
  console.log("\n[schedule]");
  for (const s of designation.schedule) {
    const speaker = s.speaker_id ? ` [${s.speaker_id}]` : "";
    console.log(`  +${String(s.offset_minutes).padStart(3)} min · ${s.role}${speaker} — ${s.title}`);
    console.log(`             ${s.description}`);
  }

  if (dryRun) {
    console.log("\n[dry-run] no writes performed.");
    return;
  }

  const newMeta = {
    ...meta,
    schedule: designation.schedule,
    critic_id: designation.critic_id,
    critic_rationale: designation.rationale,
    schedule_designated_at: new Date().toISOString(),
  };

  await db.execute({
    sql: `UPDATE ceremonies SET metadata = ? WHERE id = ?`,
    args: [JSON.stringify(newMeta), ceremony.id],
  });
  await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
    args: [
      "CURATORIAL_DECISION",
      "MNA-CU-0001",
      `Curator designated schedule and Critic (${designation.critic_id}) for ceremony ${ceremony.id}.`,
      JSON.stringify({
        ceremony_id: ceremony.id,
        action: "designate_schedule",
        critic_id: designation.critic_id,
        critic_rationale: designation.rationale,
        slot_count: designation.schedule.length,
        steward_authorized: true,
      }),
    ],
  });

  console.log(`\n[written] ceremony ${ceremony.id} metadata.schedule (${designation.schedule.length} slots) + metadata.critic_id`);
})().catch((e) => {
  console.error("[curator-designate-schedule] error:", e);
  process.exit(1);
});
