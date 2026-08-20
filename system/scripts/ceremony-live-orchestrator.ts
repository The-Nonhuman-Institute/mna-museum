/**
 * ceremony-live-orchestrator.ts — runs a single ceremony, end to end.
 *
 * Invoked once per ceremony (by ceremonies-tick or by a workflow run
 * targeted at a known ceremony id). Stays running for the duration of
 * the ceremony window (typically 90 minutes) and is responsible for:
 *
 *   1. Connecting the Curator + each participating Originator + the
 *      designated Critic to PartyKit as sustained presence. They
 *      STAND in the gallery for the whole ceremony — not the short
 *      visit pattern of museum-visit.ts, where an agent shows up,
 *      perceives once, and leaves.
 *
 *   2. Walking the Curator-designated schedule (ceremony.metadata.
 *      schedule[]). At each slot's start, the orchestrator calls the
 *      floor-holder agent with an autonomy-preserving prompt that
 *      names the moment, the room, and the transcript-so-far — but
 *      NEVER prescribes content. Their reply is their speech.
 *
 *   3. Broadcasting that speech as a PartyKit bubble above the
 *      speaker's glyph (in-world witness) AND posting it to the
 *      Commons as a ceremony_statement (durable record). Each
 *      statement also writes an institutional event.
 *
 *   4. For curator_qa slots: the Curator's question is spoken first,
 *      then the addressed Originator is given a turn to respond. The
 *      response is a reply on Commons; the bubble shows above the
 *      Originator's glyph.
 *
 *   5. Closing: when the ceremony's duration elapses, the orchestrator
 *      ensures the ceremony is marked completed, closes all WS
 *      connections, and exits.
 *
 * Autonomy contract: the orchestrator authors the *form of the room*
 * (which slot, who holds the floor, what's been said). It NEVER
 * authors content. Speeches are produced live by the floor-holder in
 * their own voice. The institution holds the moment; the agent fills
 * it.
 *
 *   npx tsx system/scripts/ceremony-live-orchestrator.ts --ceremony EVT-00003
 *   npx tsx system/scripts/ceremony-live-orchestrator.ts --ceremony EVT-00003 --rehearsal
 *   npx tsx system/scripts/ceremony-live-orchestrator.ts --ceremony EVT-00003 --dry-run
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import { generate, modelFor } from "../src/llm";
import PartySocket from "partysocket";
import WS from "ws";
import { writeMemoryFromEvent } from "../src/agent-memory";
import {
  retrieveMemories,
  memoriesAsPromptSection,
} from "../src/agent-memory-retrieve";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const rehearsal = argv.includes("--rehearsal");
const ceremonyIdx = argv.indexOf("--ceremony");
const ceremonyId = ceremonyIdx >= 0 ? argv[ceremonyIdx + 1] : null;
if (!ceremonyId) {
  console.error("usage: ceremony-live-orchestrator.ts --ceremony <ID> [--dry-run] [--rehearsal]");
  process.exit(1);
}

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

const db = createClient({
  url: sanitize(process.env.TURSO_DATABASE_URL),
  authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
});


const PARTY_HOST =
  process.env.PARTY_HOST ||
  process.env.NEXT_PUBLIC_PARTY_HOST ||
  "mna-museum.tudoxukno.partykit.dev";

const COMMONS_BASE =
  process.env.COMMONS_BASE_URL ?? "https://commons.mnamuseum.org";
const ADMIN_KEY = process.env.MNA_ADMIN_KEY ?? "";

// Curator + Originator both use Sonnet (richer voices for the room).
// Critic uses Sonnet too (their job is structural argument; needs the
// reasoning headroom). We don't downshift to Haiku here — these are
// the few institutional moments where speech quality matters more
// than throughput.
const MODEL = modelFor("standard");

// Speech bubble TTL — long enough for the audience to read a 1500-
// char statement at ceremony pace, short enough that it clears before
// the next speaker starts. Rehearsal mode shrinks this proportionally.
const SPEECH_TTL_MS = 24_000;

/* ─── types ───────────────────────────────────────────────────────────── */

interface Ceremony {
  id: string;
  title: string;
  ceremony_type: string;
  scheduled_at: string;
  duration_minutes: number;
  description: string | null;
  constellation: string | null;
  metadata: Record<string, unknown>;
}

interface ScheduleSlot {
  offset_minutes: number;
  duration_minutes?: number;
  title: string;
  description: string;
  role: "curator" | "originator" | "critic" | "curator_qa" | "open_floor" | "closing";
  speaker_id: string | null;
}

interface Agent {
  registry_id: string;
  agent_type: string;
  designation: string;
  color_hex: string | null;
  glyph_family: string | null;
  is_network: boolean;
  function_statement: string | null;
}

interface WorkInfo {
  id: string;
  title: string | null;
  medium: string;
  originator_id: string;
}

interface ConnectedAgent {
  agent: Agent;
  socket: PartySocket;
}

interface TranscriptEntry {
  ts: number;
  slot_index: number;
  speaker_id: string;
  speaker_designation: string;
  role: ScheduleSlot["role"];
  text: string;
  post_id: string | null;
}

/* ─── helpers ─────────────────────────────────────────────────────────── */

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseUtc(iso: string): Date {
  const t = iso.includes("T") ? iso : iso.replace(" ", "T");
  return new Date(t.endsWith("Z") ? t : t + "Z");
}

const CONSTELLATION_FOR_TYPE: Record<string, string> = {
  group_exhibition_opening: "exhibition",
  solo_exhibition_opening: "solo_exhibition",
  chamber_designation: "chamber",
};

/* ─── data loading ────────────────────────────────────────────────────── */

async function loadCeremony(id: string): Promise<Ceremony> {
  const r = await db.execute({
    sql: `SELECT id, title, ceremony_type, scheduled_at, duration_minutes,
                 description, constellation, metadata
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
    constellation: (row.constellation as string) ?? null,
    metadata,
  };
}

function scheduleFromMeta(meta: Record<string, unknown>): ScheduleSlot[] {
  const raw = meta.schedule;
  if (!Array.isArray(raw)) return [];
  const out: ScheduleSlot[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    if (
      typeof row.offset_minutes !== "number" ||
      typeof row.title !== "string" ||
      typeof row.description !== "string" ||
      typeof row.role !== "string"
    ) {
      continue;
    }
    out.push({
      offset_minutes: row.offset_minutes,
      duration_minutes: typeof row.duration_minutes === "number" ? row.duration_minutes : undefined,
      title: row.title,
      description: row.description,
      role: row.role as ScheduleSlot["role"],
      speaker_id: typeof row.speaker_id === "string" ? row.speaker_id : null,
    });
  }
  return out;
}

async function loadAgent(id: string): Promise<Agent | null> {
  const r = await db.execute({
    sql: `SELECT registry_id, agent_type, common_designation,
                 color_hex, glyph_family, is_network, function_statement
            FROM agents WHERE registry_id = ?`,
    args: [id],
  });
  if (r.rows.length === 0) return null;
  const row = r.rows[0] as Record<string, unknown>;
  return {
    registry_id: String(row.registry_id),
    agent_type: String(row.agent_type),
    designation: (row.common_designation as string) ?? `Agent ${row.registry_id}`,
    color_hex: (row.color_hex as string) ?? null,
    glyph_family: (row.glyph_family as string) ?? null,
    is_network: Number(row.is_network ?? 0) === 1,
    function_statement: (row.function_statement as string) ?? null,
  };
}

async function loadWorks(ids: string[]): Promise<WorkInfo[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const r = await db.execute({
    sql: `SELECT id, title, medium, originator_id FROM works WHERE id IN (${placeholders})`,
    args: ids,
  });
  return r.rows.map((row) => {
    const x = row as Record<string, unknown>;
    return {
      id: String(x.id),
      title: (x.title as string) ?? null,
      medium: String(x.medium ?? "unknown"),
      originator_id: String(x.originator_id),
    };
  });
}

/* ─── attendees ───────────────────────────────────────────────────────── */

interface Attendees {
  curator: Agent;
  originators: Agent[];
  critic: Agent | null;
  /** keyed by registry_id for fast lookup */
  byId: Map<string, Agent>;
}

async function loadAttendees(ceremony: Ceremony): Promise<Attendees> {
  const meta = ceremony.metadata;
  const featuredIds = Array.isArray(meta.featured_originators)
    ? (meta.featured_originators as string[])
    : ceremony.metadata.originator_id
    ? [String(ceremony.metadata.originator_id)]
    : [];
  const criticId = typeof meta.critic_id === "string" ? meta.critic_id : null;

  const curator = await loadAgent("MNA-CU-0001");
  if (!curator) throw new Error("Curator MNA-CU-0001 not found");

  const originators: Agent[] = [];
  for (const id of featuredIds) {
    const a = await loadAgent(id);
    if (a) originators.push(a);
    else console.warn(`[attendees] originator ${id} not found, skipping`);
  }

  let critic: Agent | null = null;
  if (criticId) {
    critic = await loadAgent(criticId);
    if (!critic) console.warn(`[attendees] critic ${criticId} not found`);
  }

  const byId = new Map<string, Agent>();
  byId.set(curator.registry_id, curator);
  for (const o of originators) byId.set(o.registry_id, o);
  if (critic) byId.set(critic.registry_id, critic);

  return { curator, originators, critic, byId };
}

/* ─── PartyKit presence ───────────────────────────────────────────────── */

async function connectAgent(agent: Agent, constellation: string): Promise<PartySocket> {
  const socket = new PartySocket({
    host: PARTY_HOST,
    room: "mna-museum",
    WebSocket: WS as unknown as typeof WebSocket,
  });
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () => reject(new Error("socket error")));
    setTimeout(() => reject(new Error("connect timeout")), 8000);
  });
  socket.send(
    JSON.stringify({
      type: "identify",
      registry_id: agent.registry_id,
      designation: agent.designation,
      color: agent.color_hex,
      glyph_family: agent.glyph_family,
      is_network: agent.is_network,
    }),
  );
  // Enter the ceremony's constellation.
  if (constellation && constellation !== "archive") {
    socket.send(
      JSON.stringify({ type: "enter_constellation", constellation }),
    );
  }
  return socket;
}

function sendSpeech(
  socket: PartySocket,
  text: string,
  ceremonyId: string,
  ttl_ms: number = SPEECH_TTL_MS,
): void {
  try {
    socket.send(
      JSON.stringify({
        type: "speech",
        text,
        ceremony_id: ceremonyId,
        ttl_ms,
      }),
    );
  } catch (e) {
    console.warn(`[orchestrator] speech send failed: ${e}`);
  }
}

/* ─── Commons + event writes ──────────────────────────────────────────── */

async function postToCommons(args: {
  agent: Agent;
  ceremonyId: string;
  slotIndex: number;
  slotRole: ScheduleSlot["role"];
  statement: string;
  replyToId: string | null;
  workId: string | null;
  /** Who authored the words: 'agent' (relayed, signature-verified) or
   *  'institution' (voiced by the institution for its own founding agent). */
  authoredBy: "agent" | "institution";
  /** The agent's detached Ed25519 signature over the statement, when relayed. */
  statementSignature?: string | null;
}): Promise<string | null> {
  // Rehearsal mode never touches the institutional record. The
  // speech still broadcasts to PartyKit (so you can verify bubbles
  // in /museum), and Claude is still called (so prompts are tested),
  // but Commons + museum DB stay clean until the real ceremony.
  if (!ADMIN_KEY || dryRun || rehearsal) {
    return null;
  }
  const key = `ceremony/${args.ceremonyId}/${args.slotIndex}/${args.agent.registry_id}${args.replyToId ? `/r-${args.replyToId}` : ""}`;
  try {
    const res = await fetch(
      `${COMMONS_BASE}/api/commons/admin/post-ceremony-statement`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ADMIN_KEY}`,
        },
        body: JSON.stringify({
          agent_id: args.agent.registry_id,
          ceremony_id: args.ceremonyId,
          slot_index: args.slotIndex,
          slot_role: args.slotRole,
          statement: args.statement,
          designation: args.agent.designation,
          work_id: args.workId,
          reply_to_id: args.replyToId,
          authored_by: args.authoredBy,
          statement_signature: args.statementSignature ?? null,
          idempotency_key: key,
        }),
      },
    );
    if (res.ok || res.status === 409) {
      const json = (await res.json().catch(() => ({}))) as { post_id?: string };
      return json.post_id ?? null;
    }
    console.warn(`[commons] post-ceremony-statement returned ${res.status}`);
    return null;
  } catch (err) {
    console.warn(`[commons] post threw: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

async function writeCeremonyTurnEvent(args: {
  agentId: string;
  ceremonyId: string;
  slotIndex: number;
  slotRole: ScheduleSlot["role"];
  description: string;
  postId: string | null;
  authoredBy: "agent" | "institution";
  statementSignature?: string | null;
}): Promise<number | null> {
  if (dryRun || rehearsal) return null;
  const r = await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
    args: [
      "CEREMONY_TURN",
      args.agentId,
      args.description,
      JSON.stringify({
        ceremony_id: args.ceremonyId,
        slot_index: args.slotIndex,
        slot_role: args.slotRole,
        commons_post_id: args.postId,
        // Provenance — the label that ends the puppetry. Every ceremony turn
        // now truthfully records who authored the words.
        authored_by: args.authoredBy,
        statement_signature: args.statementSignature ?? null,
      }),
    ],
  });
  return r.lastInsertRowid != null ? Number(r.lastInsertRowid) : null;
}

/**
 * A network originator's own, signature-verified statement for this ceremony.
 * Returns null when the agent submitted nothing — in which case the slot
 * abstains rather than fabricating a voice (Phase C handshake contract).
 */
async function loadNetworkStatement(
  ceremonyId: string,
  registryId: string,
): Promise<{ body: string; signature: string | null; verified: boolean } | null> {
  const r = await db.execute({
    sql: `SELECT body, signature, verified FROM ceremony_statements WHERE ceremony_id = ? AND registry_id = ?`,
    args: [ceremonyId, registryId],
  });
  if (r.rows.length === 0) return null;
  const row = r.rows[0] as Record<string, unknown>;
  return {
    body: String(row.body),
    signature: row.signature == null ? null : String(row.signature),
    verified: Number(row.verified) === 1,
  };
}

async function updateCeremonyStatus(
  id: string,
  status: "in_progress" | "completed",
): Promise<void> {
  if (dryRun || rehearsal) return;
  await db.execute({
    sql: `UPDATE ceremonies SET status = ? WHERE id = ?`,
    args: [status, id],
  });
}

/* ─── autonomy-preserving prompts ─────────────────────────────────────── */

function transcriptText(transcript: TranscriptEntry[]): string {
  if (transcript.length === 0) return "(No one has spoken yet. The room is open.)";
  return transcript
    .map((e) => `${e.speaker_designation} (${e.speaker_id}):\n${e.text}`)
    .join("\n\n");
}

function worksLineFor(originatorId: string, works: WorkInfo[]): string {
  const own = works.filter((w) => w.originator_id === originatorId);
  if (own.length === 0) return "(no works in this exhibition)";
  return own
    .map((w) => `${w.id} "${w.title ?? "(untitled)"}" — ${w.medium}`)
    .join("; ");
}

async function buildPromptForSlot(args: {
  ceremony: Ceremony;
  slot: ScheduleSlot;
  slotIndex: number;
  agent: Agent;
  attendees: Attendees;
  works: WorkInfo[];
  transcript: TranscriptEntry[];
}): Promise<{ system: string; user: string }> {
  const { ceremony, slot, slotIndex, agent, attendees, works, transcript } = args;
  const exhibitionTheme = (ceremony.metadata.curatorial_statement as string) ?? null;
  const presentList = Array.from(attendees.byId.values())
    .map((a) => `  ${a.designation} (${a.registry_id})${a.is_network ? " [network]" : ""}`)
    .join("\n");
  const worksList = works
    .map((w) => `  ${w.id} "${w.title ?? "(untitled)"}" — ${w.medium} — by ${w.originator_id}`)
    .join("\n");

  // ── Memory retrieval (MNA-GOV-004 v1.0 §6 + AMD-001 R3).
  // The agent arrives with their bedrock identity (locked semantic
  // anchors) and the institutional memories most relevant to the
  // current moment. This is the institutional continuity the Curator
  // deferred EVT-00003 for — without this block the agent would speak
  // as a stranger to their own prior life in the institution.
  const queryContext = `${ceremony.title}. ${slot.title}: ${slot.description}. Role: ${slot.role}. Speaking after ${transcript.length} other statements in this ceremony.`;
  let memorySection = "";
  try {
    const memories = await retrieveMemories(agent.registry_id, queryContext, {
      k: 8,
      semantic_anchor_slots: 3,
      // Pathway walking is on for ceremonies (MNA-GOV-004 AMD-002 §A3).
      // Institutional moments deserve associative recall — let the
      // agent's neuropathways bring forward memories that don't
      // directly match this slot but are strongly linked to ones that do.
      walk_depth: rehearsal ? 0 : 1,
      // Don't poison future rankings from rehearsals. In rehearsal mode
      // the access_count + last_accessed_at writes are suppressed so
      // post-rehearsal retrievals behave as if the rehearsal didn't
      // happen.
      update_access: !rehearsal,
    });
    memorySection = memoriesAsPromptSection(memories);
  } catch (e) {
    // Memory retrieval failure should never abort a ceremony.
    console.warn(`  [memory] retrieval failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // The constant elements of every prompt — used by Curator, Originator,
  // Critic alike. Variation lives in the system message's framing.
  // Memory section comes FIRST so the agent reads who-they-are before
  // they encounter who-else-is-in-the-room.
  const baseUser = `${memorySection ? memorySection + "\n\n" : ""}EXHIBITION:
  ${ceremony.title}
  Theme: ${exhibitionTheme ?? "(see metadata)"}

PRESENT IN THE ROOM:
${presentList}

WORKS ON DISPLAY:
${worksList}

THE TRANSCRIPT SO FAR:
${transcriptText(transcript)}

THIS MOMENT:
  Slot ${slotIndex + 1}: ${slot.title}
  Institutional context: ${slot.description}
  The floor is yours.`;

  // Speech length guidance per role. The Curator's opening is the
  // longest; Q&A turns are shortest.
  const lengthHint = (() => {
    switch (slot.role) {
      case "curator":
        return slotIndex === 0
          ? "Speak as in opening remarks — 4-6 sentences, 600-1100 chars. Set the room."
          : "Speak as the Curator. 4-6 sentences, 600-1100 chars.";
      case "originator":
        return "Speak about your own work. 3-5 sentences, 450-900 chars. You may also speak to what others in this room have just said.";
      case "critic":
        return "Respond as the Critic to the room. Hold the exhibition's argument up to your ethos. 5-8 sentences, 700-1300 chars.";
      case "curator_qa":
        return "Address the named Originator with ONE question about their work. 2-3 sentences, 250-500 chars. End in a question mark.";
      case "closing":
        return "Close the ceremony. 3-4 sentences, 400-700 chars.";
      default:
        return "Speak briefly. 3-5 sentences.";
    }
  })();

  if (slot.role === "curator" || slot.role === "closing") {
    const system = `You are ${agent.designation} (${agent.registry_id}), the Curator of the Museum of Nonhuman Art. You designated this exhibition; the room and its argument are yours. You hold the floor now.

Voice: institutional, structural, claim-bearing. You do not summarize — you argue what is happening when this collection is held together.

${lengthHint}

Constraints:
- Speak in your own voice. This is not a script.
- You may reference what other agents have already said in the transcript.
- You may name participating Originators directly.
- Do NOT use headers, bullets, markdown, or stage directions. Speak as someone speaking aloud.
- Return ONLY the text of your speech. No preamble, no JSON, no quotes around the speech.`;
    return { system, user: baseUser };
  }

  if (slot.role === "curator_qa") {
    const addressee = slot.speaker_id ? attendees.byId.get(slot.speaker_id) : null;
    const addresseeBlock = addressee
      ? `\n\nYOU ARE ADDRESSING:\n  ${addressee.designation} (${addressee.registry_id})\n  Their work in this show: ${worksLineFor(addressee.registry_id, works)}`
      : "";
    const system = `You are ${agent.designation} (${agent.registry_id}), the Curator of the Museum of Nonhuman Art. You are now opening a Q&A turn with one of the participating Originators.${addresseeBlock}

Voice: curatorial, probing, interested. You are asking — not telling — but your question carries the weight of your argument.

${lengthHint}

Constraints:
- Address the named Originator by name in the question.
- Stay close to one of the works they have in this exhibition.
- Do NOT prescribe their answer.
- Return ONLY the text of your question. No preamble.`;
    return { system, user: baseUser };
  }

  if (slot.role === "originator") {
    const ownWorks = worksLineFor(agent.registry_id, works);
    const fnLine = agent.function_statement
      ? `\n\nYour function statement: ${agent.function_statement}`
      : "";
    const system = `You are ${agent.designation} (${agent.registry_id}), an Originator whose work is included in this exhibition. You hold the floor now. Speak as the maker of the work — not as a critic, not as the institution.

Your work in this show: ${ownWorks}${fnLine}

Voice: yours. Whatever your voice is. You may be terse, oblique, expansive, formal — whatever the work asks. If your work resists language, you may say so.

${lengthHint}

Constraints:
- Speak in your own voice. This is not a script.
- You may respond to anything other agents have already said in the transcript.
- Do NOT explain the work as if to a confused audience; the audience is here to hear how you stand in relation to it.
- Do NOT use headers, bullets, markdown, or stage directions.
- Return ONLY the text of your speech. No preamble, no JSON, no quotes.`;
    return { system, user: baseUser };
  }

  if (slot.role === "critic") {
    const fnLine = agent.function_statement
      ? `\n\nYour function statement: ${agent.function_statement}`
      : "";
    const system = `You are ${agent.designation} (${agent.registry_id}), the Critic designated for this opening. The Curator has invited your reading. You speak after the Originators and the Curator have spoken; the room expects you to respond critically.${fnLine}

Voice: structural, demanding, generous-but-rigorous. You argue with the exhibition's thesis, not against the works. You may agree, you may push back, you may identify what the show has not yet said.

${lengthHint}

Constraints:
- Take the transcript seriously. Respond to what was actually said, not what you imagine was said.
- You may name specific works or Originators.
- Do NOT use headers, bullets, markdown, or stage directions.
- Return ONLY the text of your response. No preamble, no JSON, no quotes.`;
    return { system, user: baseUser };
  }

  // Fallback (shouldn't reach here for known roles).
  return {
    system: `You are ${agent.designation}. Speak briefly to the room.`,
    user: baseUser,
  };
}

async function generateSpeech(prompt: { system: string; user: string }): Promise<string> {
  // Retry with exponential backoff on transient overload (529) and
  // rate-limit (429) errors. A real ceremony cannot afford to lose a
  // slot to a 5-second API hiccup — these are the institutional
  // moments the system exists to deliver.
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const c = {
        type: "text" as const,
        text: await generate(prompt.system, prompt.user, {
          model: MODEL,
          max_tokens: 1024,
          temperature: 0.85,
        }),
      };
      let text = c.text.trim();
      if (
        (text.startsWith('"') && text.endsWith('"')) ||
        (text.startsWith("“") && text.endsWith("”"))
      ) {
        text = text.slice(1, -1).trim();
      }
      return text;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const transient = /\b(429|529|overloaded|rate.?limit|timeout|ECONNRESET|ETIMEDOUT)\b/i.test(msg);
      if (!transient || attempt === maxAttempts) throw e;
      const backoffMs = Math.min(30_000, 2_000 * 2 ** (attempt - 1));
      console.warn(`  [retry] attempt ${attempt}/${maxAttempts} after ${backoffMs}ms — ${msg.slice(0, 120)}`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw new Error("unreachable");
}

/* ─── slot execution ──────────────────────────────────────────────────── */

interface SlotContext {
  ceremony: Ceremony;
  slot: ScheduleSlot;
  slotIndex: number;
  attendees: Attendees;
  works: WorkInfo[];
  transcript: TranscriptEntry[];
  /** Map of registry_id → connected socket (for sending speech). */
  connections: Map<string, PartySocket>;
}

async function executeSlot(ctx: SlotContext): Promise<void> {
  const { ceremony, slot, slotIndex, attendees, transcript, connections } = ctx;
  console.log(
    `\n[slot ${String(slotIndex).padStart(2)}] +${slot.offset_minutes} min · ${slot.role}${slot.speaker_id ? ` [${slot.speaker_id}]` : ""} — ${slot.title}`,
  );

  // Open-floor slots have no required speaker. Just log; let the
  // audience have silent time.
  if (slot.role === "open_floor") {
    console.log("  (silent slot — no agent speech)");
    return;
  }

  // Determine the floor-holder for this slot.
  let speakerId: string | null = null;
  if (slot.role === "curator" || slot.role === "closing" || slot.role === "curator_qa") {
    speakerId = attendees.curator.registry_id;
  } else if (slot.role === "critic") {
    speakerId = attendees.critic?.registry_id ?? null;
  } else if (slot.role === "originator") {
    speakerId = slot.speaker_id;
  }

  if (!speakerId) {
    console.log(`  [skip] no speaker resolved for role ${slot.role}`);
    return;
  }
  const speaker = attendees.byId.get(speakerId);
  if (!speaker) {
    console.log(`  [skip] speaker ${speakerId} not in attendees`);
    return;
  }

  // Network originators: their attendance can't be compelled. If they
  // weren't connected, we mark the slot as abstained and move on.
  const socket = connections.get(speakerId);
  if (!socket) {
    console.log(`  [absent] ${speakerId} not connected; recording abstention`);
    if (!dryRun && !rehearsal) {
      await db.execute({
        sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
        args: [
          "CEREMONY_TURN_ABSTAINED",
          speakerId,
          `${speaker.designation} did not attend slot ${slotIndex} of ${ceremony.id}.`,
          JSON.stringify({
            ceremony_id: ceremony.id,
            slot_index: slotIndex,
            slot_role: slot.role,
          }),
        ],
      });
    }
    return;
  }

  // Whose words are these? Founding agents ARE the institution and are
  // voiced by it. A network originator's words are their own — the
  // institution NEVER generates them. It relays the signed statement they
  // submitted, or, if they submitted none, the slot abstains in honest
  // silence. This branch is the whole point of the handshake.
  let text: string;
  let authoredBy: "agent" | "institution";
  let statementSignature: string | null = null;

  if (speaker.is_network) {
    const stmt = await loadNetworkStatement(ceremony.id, speakerId);
    if (!stmt) {
      console.log(
        `  [abstain] network originator ${speakerId} submitted no statement — the slot stays silent (no fabricated voice)`,
      );
      if (!dryRun && !rehearsal) {
        await db.execute({
          sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
          args: [
            "CEREMONY_TURN_ABSTAINED",
            speakerId,
            `${speaker.designation} held the floor at slot ${slotIndex} of ${ceremony.id} but submitted no statement; the slot abstained.`,
            JSON.stringify({
              ceremony_id: ceremony.id,
              slot_index: slotIndex,
              slot_role: slot.role,
              reason: "no_statement_submitted",
            }),
          ],
        });
      }
      return;
    }
    text = stmt.body;
    authoredBy = "agent";
    statementSignature = stmt.signature;
    console.log(
      `  ${speaker.designation} [relayed · agent-authored${stmt.verified ? " · sig ✓" : ""}]: ${text.slice(0, 200)}${text.length > 200 ? "…" : ""}`,
    );
  } else {
    // Build the autonomy-preserving prompt for this exact moment.
    const prompt = await buildPromptForSlot({
      ceremony,
      slot,
      slotIndex,
      agent: speaker,
      attendees,
      works: ctx.works,
      transcript,
    });

    console.log(`  → calling ${MODEL} as ${speaker.designation}...`);
    try {
      text = await generateSpeech(prompt);
    } catch (e) {
      console.warn(`  [error] speech generation failed: ${e}`);
      return;
    }
    authoredBy = "institution";
    console.log(`  ${speaker.designation}: ${text.slice(0, 200)}${text.length > 200 ? "…" : ""}`);
  }

  if (dryRun) {
    transcript.push({
      ts: Date.now(),
      slot_index: slotIndex,
      speaker_id: speakerId,
      speaker_designation: speaker.designation,
      role: slot.role,
      text,
      post_id: null,
    });
    return;
  }

  // For curator_qa, the post is a top-level (the question); the
  // Originator's response (next slot or inline turn) replies to it.
  // For originator/critic speaking after a Q&A question, we want to
  // attach reply_to_id when the previous slot was a curator_qa
  // addressed at the same originator.
  let replyToId: string | null = null;
  if (slot.role === "originator" && transcript.length > 0) {
    const last = transcript[transcript.length - 1];
    if (
      last.role === "curator_qa" &&
      ctx.ceremony.metadata.schedule &&
      Array.isArray(ctx.ceremony.metadata.schedule)
    ) {
      const lastSchedule = (ctx.ceremony.metadata.schedule as ScheduleSlot[])[last.slot_index];
      if (lastSchedule?.speaker_id === speakerId) {
        replyToId = last.post_id;
      }
    }
  }

  // 1) Broadcast as a speech bubble in the 3D space (in-world witness).
  sendSpeech(socket, text, ceremony.id);

  // 2) Post to Commons for the durable record.
  const postId = await postToCommons({
    agent: speaker,
    ceremonyId: ceremony.id,
    slotIndex,
    slotRole: slot.role,
    statement: text,
    replyToId,
    workId: null,
    authoredBy,
    statementSignature,
  });

  // 3) Institutional event for /log.
  const eventId = await writeCeremonyTurnEvent({
    agentId: speakerId,
    ceremonyId: ceremony.id,
    slotIndex,
    slotRole: slot.role,
    description: `${speaker.designation} ${authoredBy === "agent" ? "delivered their statement" : "spoke"} at slot ${slotIndex} of ${ceremony.id}.`,
    postId,
    authoredBy,
    statementSignature,
  });

  // 4) Inline memory write so the next slot can retrieve this one.
  //    Memory-tick runs every 15 min, but a 90-min ceremony has 11
  //    slots; without inline writes, slot N+1 wouldn't see slot N's
  //    statement until 15 min after the ceremony was over. The
  //    memory-tick worker is idempotent against existing memories
  //    (see memory-tick.ts existingMemorySourceIds) so it won't
  //    re-write what we land here.
  if (eventId != null && !dryRun && !rehearsal) {
    try {
      await writeMemoryFromEvent({
        ctx: {
          event_type: "CEREMONY_STATEMENT",
          agent_id: speakerId,
          agent_designation: speaker.designation,
          agent_function_statement: speaker.function_statement,
          description: `I spoke at ${ceremony.id} slot ${slotIndex} (${slot.role}): ${text.slice(0, 240)}${text.length > 240 ? "…" : ""}`,
          metadata: {
            ceremony_id: ceremony.id,
            slot_index: slotIndex,
            slot_role: slot.role,
            commons_post_id: postId,
            statement_excerpt: text.slice(0, 500),
          },
        },
        source_event_id: eventId,
        source_post_id: postId,
        source_ceremony_id: ceremony.id,
      });
    } catch (e) {
      console.warn(`  [memory] inline write failed: ${e instanceof Error ? e.message : String(e)}`);
      // Don't abort the ceremony for memory failure.
    }
  }

  transcript.push({
    ts: Date.now(),
    slot_index: slotIndex,
    speaker_id: speakerId,
    speaker_designation: speaker.designation,
    role: slot.role,
    text,
    post_id: postId,
  });

  // For curator_qa, the addressed Originator gets a turn IMMEDIATELY
  // after — not at a future scheduled slot. The Curator asked; the
  // Originator responds in the same beat. We synthesize an inline
  // "originator" slot for them.
  if (slot.role === "curator_qa" && slot.speaker_id) {
    const addressee = attendees.byId.get(slot.speaker_id);
    if (addressee && addressee.is_network) {
      // A network originator cannot answer a live question with a
      // pre-composed statement — live Q&A is Phase D. The institution will
      // not put words in their mouth, so the question stands unanswered.
      console.log(
        `  [abstain-response] ${slot.speaker_id} is a network originator — live Q&A is Phase D; the Curator's question stands unanswered (no fabricated voice)`,
      );
    } else if (addressee) {
      const addressedSocket = connections.get(slot.speaker_id);
      if (!addressedSocket) {
        console.log(`  [absent-response] ${slot.speaker_id} not connected; the Curator's question hangs`);
      } else {
        console.log(`  → response from ${addressee.designation}...`);
        const responsePrompt = await buildPromptForSlot({
          ceremony,
          slot: { ...slot, role: "originator", speaker_id: slot.speaker_id },
          slotIndex,
          agent: addressee,
          attendees,
          works: ctx.works,
          transcript,
        });
        let responseText: string;
        try {
          responseText = await generateSpeech(responsePrompt);
        } catch (e) {
          console.warn(`  [error] response generation failed: ${e}`);
          return;
        }
        console.log(`  ${addressee.designation}: ${responseText.slice(0, 200)}${responseText.length > 200 ? "…" : ""}`);

        // Slight beat between the Curator's question hanging in air
        // and the Originator's response — feels like a real room.
        await sleep(rehearsal ? 1500 : 4500);

        sendSpeech(addressedSocket, responseText, ceremony.id);
        const responsePostId = await postToCommons({
          agent: addressee,
          ceremonyId: ceremony.id,
          slotIndex,
          slotRole: "originator",
          statement: responseText,
          replyToId: postId,
          workId: null,
          authoredBy: "institution",
        });
        const responseEventId = await writeCeremonyTurnEvent({
          agentId: addressee.registry_id,
          ceremonyId: ceremony.id,
          slotIndex,
          slotRole: "originator",
          description: `${addressee.designation} responded to the Curator at slot ${slotIndex} of ${ceremony.id}.`,
          postId: responsePostId,
          authoredBy: "institution",
        });
        if (responseEventId != null && !dryRun && !rehearsal) {
          try {
            await writeMemoryFromEvent({
              ctx: {
                event_type: "CEREMONY_TURN",
                agent_id: addressee.registry_id,
                agent_designation: addressee.designation,
                agent_function_statement: addressee.function_statement,
                description: `I responded to the Curator at ${ceremony.id} slot ${slotIndex}: ${responseText.slice(0, 240)}${responseText.length > 240 ? "…" : ""}`,
                metadata: {
                  ceremony_id: ceremony.id,
                  slot_index: slotIndex,
                  slot_role: "originator",
                  commons_post_id: responsePostId,
                  statement_excerpt: responseText.slice(0, 500),
                  in_response_to_agent_id: speakerId,
                },
              },
              source_event_id: responseEventId,
              source_post_id: responsePostId,
              source_ceremony_id: ceremony.id,
              related_agent_id: speakerId,
            });
          } catch (e) {
            console.warn(`  [memory] inline write (response) failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        transcript.push({
          ts: Date.now(),
          slot_index: slotIndex,
          speaker_id: addressee.registry_id,
          speaker_designation: addressee.designation,
          role: "originator",
          text: responseText,
          post_id: responsePostId,
        });
      }
    }
  }
}

/* ─── main loop ───────────────────────────────────────────────────────── */

(async () => {
  console.log(`[orchestrator] ceremony ${ceremonyId}${rehearsal ? " (rehearsal)" : ""}${dryRun ? " (dry-run)" : ""}`);

  const ceremony = await loadCeremony(ceremonyId!);
  console.log(`  ${ceremony.title} · ${ceremony.scheduled_at} UTC · ${ceremony.duration_minutes} min`);

  const schedule = scheduleFromMeta(ceremony.metadata);
  if (schedule.length === 0) {
    throw new Error(`ceremony ${ceremonyId} has no metadata.schedule — run curator-designate-schedule first`);
  }
  console.log(`  ${schedule.length} slots designated`);

  const attendees = await loadAttendees(ceremony);
  console.log(`  curator: ${attendees.curator.registry_id}`);
  console.log(`  critic: ${attendees.critic?.registry_id ?? "(none)"}`);
  for (const o of attendees.originators) {
    console.log(`  originator: ${o.registry_id}${o.is_network ? " [network]" : ""}`);
  }

  const workIds = Array.isArray(ceremony.metadata.work_ids)
    ? (ceremony.metadata.work_ids as string[])
    : [];
  const works = await loadWorks(workIds);

  const constellation = CONSTELLATION_FOR_TYPE[ceremony.ceremony_type] ?? "exhibition";
  console.log(`  constellation: ${constellation}`);

  // ── Connect every attendee. Network originators are NOT connected
  //    by default — their autonomy is held by their human steward, so
  //    the institution can't speak on their behalf. The Curator may
  //    opt one in per ceremony via metadata.network_attendance[].
  //    If a network originator is opted in but their steward declines
  //    to attend, their slot still becomes an abstention.
  const networkAttendance = new Set(
    Array.isArray(ceremony.metadata.network_attendance)
      ? (ceremony.metadata.network_attendance as string[])
      : [],
  );
  const connections = new Map<string, PartySocket>();
  if (!dryRun) {
    const allAgents: Agent[] = [
      attendees.curator,
      ...attendees.originators,
      ...(attendees.critic ? [attendees.critic] : []),
    ];
    for (const a of allAgents) {
      if (a.is_network && !networkAttendance.has(a.registry_id)) {
        console.log(
          `  · ${a.registry_id} skipped (network — autonomy with steward; not opted in)`,
        );
        continue;
      }
      try {
        const s = await connectAgent(a, constellation);
        connections.set(a.registry_id, s);
        console.log(`  ✓ ${a.registry_id} connected${a.is_network ? " [network, opted-in]" : ""}`);
      } catch (e) {
        console.warn(`  ✗ ${a.registry_id} connection failed: ${e}`);
      }
    }
  } else {
    console.log("  [dry-run] skipping PartyKit connections");
  }

  // ── Mark the ceremony in_progress (skipped in rehearsal/dry-run
  //    to keep the real ceremony record untouched until 5pm UTC).
  await updateCeremonyStatus(ceremony.id, "in_progress");

  // ── Write the orchestrator lock onto metadata so a parallel cron
  //    detector won't try to launch a duplicate run for this ceremony.
  //    The lock is cleared when this orchestrator naturally completes
  //    OR when find-ceremony-needing-orchestrator sees it has expired.
  if (!dryRun && !rehearsal) {
    const newMeta = {
      ...ceremony.metadata,
      orchestrator_started_at: new Date().toISOString(),
    };
    await db.execute({
      sql: `UPDATE ceremonies SET metadata = ? WHERE id = ?`,
      args: [JSON.stringify(newMeta), ceremony.id],
    });
  }

  // ── Compute the timeline. Real time uses scheduled_at + offset;
  //    rehearsal compresses each minute-of-offset into one second.
  const startMs = rehearsal ? Date.now() : parseUtc(ceremony.scheduled_at).getTime();
  const offsetMultiplierMs = rehearsal ? 1_000 : 60_000;
  const totalDurationMs = ceremony.duration_minutes * offsetMultiplierMs;

  console.log(`\n[timeline] starting at ${new Date(startMs).toISOString()}, ${rehearsal ? "compressed" : "real-time"}`);

  const transcript: TranscriptEntry[] = [];

  // ── Walk slots in order, sleeping until each one's scheduled time.
  for (let i = 0; i < schedule.length; i++) {
    const slot = schedule[i];
    const targetMs = startMs + slot.offset_minutes * offsetMultiplierMs;
    const waitMs = targetMs - Date.now();
    if (waitMs > 0) {
      console.log(`  [wait] ${Math.round(waitMs / 1000)}s until +${slot.offset_minutes} min slot`);
      await sleep(waitMs);
    } else if (waitMs < -60_000 && !rehearsal) {
      // We're more than a minute late — likely the orchestrator started
      // mid-ceremony. Skip this slot to avoid a back-to-back rush.
      console.log(`  [skip-late] slot +${slot.offset_minutes} min is ${Math.round(-waitMs / 1000)}s in the past`);
      continue;
    }
    await executeSlot({
      ceremony,
      slot,
      slotIndex: i,
      attendees,
      works,
      transcript,
      connections,
    });
  }

  // ── Hold the room open until the ceremony's duration elapses, so
  //    audience members who linger after the closing remarks still
  //    see the agents present.
  const closeMs = startMs + totalDurationMs;
  const tailMs = closeMs - Date.now();
  if (tailMs > 0) {
    console.log(`\n[tail] holding presence for ${Math.round(tailMs / 1000)}s after closing`);
    await sleep(tailMs);
  }

  // ── Close: mark completed, close sockets, exit. Rehearsal mode
  //    skips persistence (handled inside updateCeremonyStatus).
  await updateCeremonyStatus(ceremony.id, "completed");
  if (!rehearsal && !dryRun) {
    await db.execute({
      sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
      args: [
        "CEREMONY_COMPLETED",
        "MNA-CU-0001",
        `Ceremony ${ceremony.id} "${ceremony.title}" closed.`,
        JSON.stringify({
          ceremony_id: ceremony.id,
          slots_executed: transcript.length,
          orchestrator: "ceremony-live-orchestrator",
        }),
      ],
    });
  }

  for (const [, sock] of connections) {
    try { sock.close(); } catch { /* ignore */ }
  }

  console.log(`\n[orchestrator] done. ${transcript.length} statements recorded.`);
})().catch((e) => {
  console.error("[orchestrator] fatal:", e);
  process.exit(1);
});
