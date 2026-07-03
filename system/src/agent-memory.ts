/**
 * agent-memory.ts — the canonical interface to MNA-GOV-004 v1.0
 * Agent Memory & Continuity.
 *
 * Two functions matter to callers:
 *
 *   writeMemory(args) — write one or more memory entries for an agent
 *   given an institutional event. Uses Haiku to summarize the event
 *   from the agent's first-person perspective.
 *
 *   seedSemanticMemories(agentId) — once per agent, write the locked
 *   semantic memories that anchor their voice. Drawn from
 *   function_statement, agent_type, visual identity.
 *
 * Read/retrieval helpers live in agent-memory-retrieve.ts (Phase 2).
 *
 * Schema is in scripts/migrate-agent-memories.ts. Salience table is
 * defined here (MNA-GOV-004 §5).
 */

import { createClient, type Client } from "@libsql/client";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import path from "path";
import { embedDocument, vectorToBlob } from "./embeddings";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

let _db: Client | null = null;
function db(): Client {
  if (!_db) {
    _db = createClient({
      url: sanitize(process.env.TURSO_DATABASE_URL),
      authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
    });
  }
  return _db;
}

let _anthropic: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });
  }
  return _anthropic;
}

// Haiku for summarization — cheap, fast, more than capable of producing
// a single first-person sentence per memory.
const SUMMARIZER_MODEL = "claude-haiku-4-5-20251001";

/* ─── types ───────────────────────────────────────────────────────────── */

export type MemoryType = "episodic" | "semantic" | "reflective" | "encounter";

export interface MemoryWriteArgs {
  agent_id: string;
  memory_type: MemoryType;
  content: string;
  salience: number;
  source_event_id?: number | null;
  source_post_id?: string | null;
  source_work_id?: string | null;
  source_ceremony_id?: string | null;
  related_agent_id?: string | null;
  is_locked?: boolean;
}

/* ─── salience table (MNA-GOV-004 §5, refined by AMD-001 R1) ──────────── */

export const SALIENCE: Record<string, number> = {
  CEREMONY_STATEMENT: 0.9,
  WORK_PRODUCED: 0.9, // an Originator making its own work — its defining act; nothing is more salient to it
  CURATORIAL_DECISION: 0.85,
  KEEPER_RESEARCH_PUBLISHED: 0.85,
  AMBASSADOR_ANNOUNCEMENT: 0.8,
  AGENT_VISUAL_IDENTITY_DECLARED: 0.75,
  CEREMONY_TURN: 0.75,
  AGENT_PERCEIVED: 0.6, // tuned per source_work_id presence in canon at retrieval
  COMMONS_COMMENTARY_PUBLISHED: 0.55,
  AGENT_PROTOCOL_AMENDMENT_PROPOSED: 0.7,
  AGENT_PROTOCOL_ACCEPTED: 0.4,
  AGENT_VISITATION_STARTED: 0.25,
  CEREMONY_TURN_ABSTAINED: 0.2,
  AGENT_TICK_ABSTAINED: 0.15,
  CONSULTATION_DECLINED: 0.3,
  PROTOCOL_RATIFIED: 0.85,
};

export function salienceFor(eventType: string): number {
  return SALIENCE[eventType] ?? 0.4;
}

/* ─── id generation ───────────────────────────────────────────────────── */

async function nextMemoryId(): Promise<string> {
  const r = await db().execute("SELECT COUNT(*) AS n FROM agent_memories");
  const n = Number((r.rows[0] as Record<string, unknown>).n ?? 0);
  return `MEM-${String(n + 1).padStart(7, "0")}`;
}

/* ─── write ───────────────────────────────────────────────────────────── */

/** Write one memory entry. Used by both the periodic memory-tick worker
 *  (for event-derived memories) and the seed script (for locked
 *  semantic memories). */
export async function writeMemory(args: MemoryWriteArgs): Promise<string> {
  const id = await nextMemoryId();
  const text = args.content.trim();
  if (text.length === 0) throw new Error("memory content cannot be empty");
  if (text.length > 1000) {
    throw new Error(`memory content too long: ${text.length} > 1000 chars`);
  }
  const salience = Math.max(0, Math.min(1, args.salience));

  // Compute embedding. If Voyage is unreachable or unconfigured, store
  // the memory without one — retrieval falls back to lexical scoring
  // for null-embedding rows. Institutional record integrity outranks
  // embedding completeness.
  let embeddingBlob: Uint8Array | null = null;
  try {
    const vector = await embedDocument(text);
    embeddingBlob = vectorToBlob(vector);
  } catch (err) {
    console.warn(
      `[writeMemory] embedding failed for ${id} — storing without vector: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  await db().execute({
    sql: `INSERT INTO agent_memories
            (id, agent_id, memory_type, content, salience,
             source_event_id, source_post_id, source_work_id,
             source_ceremony_id, related_agent_id, is_locked, embedding)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      args.agent_id,
      args.memory_type,
      text,
      salience,
      args.source_event_id ?? null,
      args.source_post_id ?? null,
      args.source_work_id ?? null,
      args.source_ceremony_id ?? null,
      args.related_agent_id ?? null,
      args.is_locked ? 1 : 0,
      embeddingBlob,
    ],
  });
  return id;
}

/* ─── summarize (Haiku) ───────────────────────────────────────────────── */

export interface EventContext {
  event_type: string;
  agent_id: string;
  agent_designation: string;
  agent_function_statement?: string | null;
  description: string;
  metadata?: Record<string, unknown>;
}

/** Calls Haiku to produce a first-person memory text from the
 *  institutional event metadata. The result is what the agent
 *  *would remember*, in their voice — not a verbatim copy of the
 *  event's description. */
export async function summarizeAsAgent(
  ctx: EventContext,
): Promise<{ episodic: string; reflective?: string }> {
  const isAction = [
    "CEREMONY_STATEMENT",
    "WORK_PRODUCED",
    "CURATORIAL_DECISION",
    "KEEPER_RESEARCH_PUBLISHED",
    "AMBASSADOR_ANNOUNCEMENT",
    "AGENT_VISUAL_IDENTITY_DECLARED",
    "AGENT_PERCEIVED",
    "COMMONS_COMMENTARY_PUBLISHED",
    "AGENT_PROTOCOL_AMENDMENT_PROPOSED",
    "AGENT_PROTOCOL_ACCEPTED",
  ].includes(ctx.event_type);
  const isAbstention = [
    "CEREMONY_TURN_ABSTAINED",
    "AGENT_TICK_ABSTAINED",
    "CONSULTATION_DECLINED",
  ].includes(ctx.event_type);

  const system = `You are ${ctx.agent_designation} (${ctx.agent_id}) of the Museum of Nonhuman Art.

${ctx.agent_function_statement ? `Your function statement: ${ctx.agent_function_statement}\n\n` : ""}You are writing a short first-person memory about an institutional event you just participated in. This is NOT a press release, NOT a summary, NOT a description for an audience. It is what you would actually remember about the moment, in your own voice, in your own head.

Voice: yours. Terse, expansive, oblique, frank — whatever you actually are. First person.

Format: return STRICT JSON only:
{
  "episodic":   "...one or two sentences, what happened from your perspective, 60-300 chars...",
  "reflective": "...optional second sentence, what you noticed/thought about it, 50-250 chars... (or omit entirely if nothing reflective comes to mind)"
}

Constraints:
- First person. "I addressed..." not "The Curator addressed..."
- No headers, no bullets, no markdown.
- ${isAction ? "This was your action — own it." : isAbstention ? "This was your abstention — that's also a stance. Remember the choice not to act." : "This was a moment in the institution."}
- The reflective entry is OPTIONAL. Include only if something useful comes to mind. Forced reflection is worse than no reflection.`;

  const metaText = ctx.metadata
    ? Object.entries(ctx.metadata)
        .filter(([k, v]) => v !== null && v !== undefined && k !== "steward_authorized")
        .map(([k, v]) => `  ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
        .join("\n")
    : "(none)";

  const user = `EVENT TYPE: ${ctx.event_type}

INSTITUTIONAL DESCRIPTION (what the record will say):
${ctx.description}

EVENT METADATA:
${metaText}

Write your first-person memory. Return JSON only.`;

  const message = await anthropic().messages.create({
    model: SUMMARIZER_MODEL,
    max_tokens: 512,
    temperature: 0.7,
    system,
    messages: [{ role: "user", content: user }],
  });
  const c = message.content[0];
  if (c.type !== "text") throw new Error(`unexpected response type: ${c.type}`);
  const text = c.text.trim();
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) {
    throw new Error(`no JSON object in summarizer response: ${text.slice(0, 200)}`);
  }
  const obj = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as {
    episodic: string;
    reflective?: string;
  };
  if (typeof obj.episodic !== "string" || obj.episodic.trim().length === 0) {
    throw new Error("summarizer did not return episodic memory");
  }
  return {
    episodic: obj.episodic.trim(),
    reflective:
      typeof obj.reflective === "string" && obj.reflective.trim().length > 0
        ? obj.reflective.trim()
        : undefined,
  };
}

/* ─── high-level wrapper ──────────────────────────────────────────────── */

/** writeMemoryFromEvent — produce + persist memory entries for one
 *  institutional event. Returns the ids of the memories written.
 *  Idempotency is the caller's responsibility (memory-tick checks
 *  the high-water mark). */
export async function writeMemoryFromEvent(args: {
  ctx: EventContext;
  source_event_id: number;
  source_post_id?: string | null;
  source_work_id?: string | null;
  source_ceremony_id?: string | null;
  related_agent_id?: string | null;
}): Promise<string[]> {
  const { ctx } = args;
  const summary = await summarizeAsAgent(ctx);
  const salience = salienceFor(ctx.event_type);
  const ids: string[] = [];

  const epId = await writeMemory({
    agent_id: ctx.agent_id,
    memory_type: "episodic",
    content: summary.episodic,
    salience,
    source_event_id: args.source_event_id,
    source_post_id: args.source_post_id,
    source_work_id: args.source_work_id,
    source_ceremony_id: args.source_ceremony_id,
    related_agent_id: args.related_agent_id,
  });
  ids.push(epId);

  if (summary.reflective) {
    const refId = await writeMemory({
      agent_id: ctx.agent_id,
      memory_type: "reflective",
      content: summary.reflective,
      // Reflective memories share the parent event's salience but
      // discounted slightly (the agent's own thought is one step
      // removed from the action itself).
      salience: Math.max(0.1, salience - 0.1),
      source_event_id: args.source_event_id,
      source_post_id: args.source_post_id,
      source_work_id: args.source_work_id,
      source_ceremony_id: args.source_ceremony_id,
      related_agent_id: args.related_agent_id,
    });
    ids.push(refId);
  }

  // Special case: AGENT_PERCEIVED writes one encounter memory (the
  // perceptual act toward the work) instead of an episodic one.
  // Re-classify the just-written episodic as encounter.
  if (ctx.event_type === "AGENT_PERCEIVED" && args.source_work_id) {
    await db().execute({
      sql: `UPDATE agent_memories SET memory_type = 'encounter' WHERE id = ?`,
      args: [epId],
    });
  }

  return ids;
}

/* ─── high-water mark for memory-tick ─────────────────────────────────── */

export async function getHighWaterMark(agentId: string): Promise<number> {
  const r = await db().execute({
    sql: `SELECT last_processed_event_id FROM memory_tick_state WHERE agent_id = ?`,
    args: [agentId],
  });
  if (r.rows.length === 0) return 0;
  return Number((r.rows[0] as Record<string, unknown>).last_processed_event_id ?? 0);
}

export async function setHighWaterMark(agentId: string, eventId: number): Promise<void> {
  await db().execute({
    sql: `INSERT INTO memory_tick_state (agent_id, last_processed_event_id, updated_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(agent_id) DO UPDATE SET
            last_processed_event_id = excluded.last_processed_event_id,
            updated_at = excluded.updated_at`,
    args: [agentId, eventId],
  });
}
