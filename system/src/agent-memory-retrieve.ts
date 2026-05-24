/**
 * agent-memory-retrieve.ts — read side of MNA-GOV-004 v1.0.
 *
 * Given an agent and a context, returns the top-K memories that should
 * be present in their inference. The protocol calls this at every
 * Sonnet call where the agent will produce content.
 *
 * The retrieval composes three pieces (per AMD-001 ratification of §6):
 *
 *   1. Locked semantic memories ALWAYS ride along (voice anchors).
 *      These are constitutional facts — the agent's bedrock identity.
 *      Without them, retrieval could drop them when the query is
 *      narrow ("speak about Sub-Bass Cathedral" → nothing semantic
 *      matches → Pulse forgets they're Pulse). We never let that
 *      happen.
 *
 *   2. Episodic / reflective / encounter memories are ranked by
 *      term_overlap × salience × recency_decay × access_bonus and
 *      the top entries fill the remaining retrieval slots.
 *
 *   3. Access tracking — every retrieved memory gets its
 *      last_accessed_at + access_count incremented, so frequently-
 *      revisited memories rise in future searches.
 *
 * Privacy boundary (per §6 + AMD-001 R3): every query scopes to
 * agent_id = <self> AND is_archived = 0. NEVER joins across agents.
 *
 * Future work (Phase 3): swap term overlap for real embeddings
 * (OpenAI text-embedding-3-small or Voyage voyage-3-lite). The
 * agent_memories.embedding column is already in the schema; this
 * helper would change shape but the call sites would not.
 */

import { createClient, type Client } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import {
  embedQuery,
  blobToVector,
  cosineSimilarity,
} from "./embeddings";

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

/* ─── types ───────────────────────────────────────────────────────────── */

export interface RetrievedMemory {
  id: string;
  agent_id: string;
  memory_type: "episodic" | "semantic" | "reflective" | "encounter";
  content: string;
  salience: number;
  source_event_id: number | null;
  source_post_id: string | null;
  source_work_id: string | null;
  source_ceremony_id: string | null;
  related_agent_id: string | null;
  created_at: string;
  is_locked: boolean;
  /** Computed at retrieval time; not stored. */
  retrieval_score: number;
}

export interface RetrievalOptions {
  /** Total slots to fill. Default 8. */
  k?: number;
  /** How many of the K should be reserved for locked semantic anchors.
   *  The rest come from term-overlap retrieval. Default 3. */
  semantic_anchor_slots?: number;
  /** Filter to only memories related to a specific other agent.
   *  Used for "what do I remember about X" style retrieval. */
  related_agent_id?: string;
  /** Filter to only memories related to a specific work. */
  source_work_id?: string;
  /** Filter to only memories from a specific ceremony. */
  source_ceremony_id?: string;
  /** If false, skip the access-tracking write. Used when caller wants
   *  to inspect the retrieval without affecting future rankings.
   *  Default true. */
  update_access?: boolean;
}

/* ─── term overlap ────────────────────────────────────────────────────── */

const STOP_WORDS = new Set([
  "the", "a", "an", "of", "in", "on", "at", "to", "for", "with", "by",
  "is", "are", "was", "were", "be", "been", "being", "i", "you", "we",
  "they", "it", "this", "that", "these", "those", "and", "or", "but",
  "as", "if", "then", "than", "so", "not", "no", "yes", "have", "has",
  "had", "do", "does", "did", "will", "would", "could", "should", "may",
  "might", "must", "can", "from", "into", "out", "up", "down", "about",
  "what", "when", "where", "who", "how", "why", "their", "my", "your",
  "our", "her", "his", "its", "am",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !STOP_WORDS.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  a.forEach((x) => { if (b.has(x)) intersection++; });
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/* ─── score ───────────────────────────────────────────────────────────── */

function daysSince(iso: string): number {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return 365;
  return Math.max(0, (Date.now() - d.getTime()) / 86_400_000);
}

interface ScoredRow {
  row: Record<string, unknown>;
  score: number;
}

function scoreRow(
  row: Record<string, unknown>,
  queryTokens: Set<string>,
  queryVector: Float32Array | null,
): number {
  const content = String(row.content);

  // Similarity term:
  //   - If both query and memory have embeddings → cosine similarity.
  //     Cosine ranges roughly [0, 1] for our use (Voyage returns vectors
  //     in mostly-positive space). The +0.1 floor preserves the
  //     "tangential memories can still surface" property from the
  //     lexical version.
  //   - Otherwise → jaccard term overlap (Phase 1 behavior). This
  //     fallback covers rows that haven't been backfilled yet AND the
  //     case where the query embedding call failed.
  let similarity: number;
  let memVector: Float32Array | null = null;
  if (queryVector) {
    try {
      memVector = blobToVector(row.embedding as Uint8Array | null);
    } catch {
      memVector = null;
    }
  }
  if (queryVector && memVector && memVector.length === queryVector.length) {
    const cos = cosineSimilarity(queryVector, memVector);
    similarity = Math.max(0, cos);
  } else {
    const memTokens = tokenize(content);
    similarity = jaccard(queryTokens, memTokens);
  }

  const salience = Number(row.salience ?? 0.5);
  const daysOld = daysSince(String(row.created_at));
  const recency = Math.exp(-daysOld / 90);
  const accessCount = Number(row.access_count ?? 0);
  const accessBonus = 1 + Math.log(1 + accessCount) * 0.1;
  // The +0.1 floor on similarity ensures a memory with zero overlap
  // (lexical OR semantic) can still surface if its salience + recency
  // are high. Without it, retrieval never picks up tangential memories
  // that should travel with the agent (e.g., a recent strong stance on
  // a topic that's adjacent but doesn't match this moment's terms).
  return (similarity * 0.5 + 0.1) * salience * recency * accessBonus;
}

/* ─── retrieval ───────────────────────────────────────────────────────── */

function rowToMemory(row: Record<string, unknown>, score: number): RetrievedMemory {
  return {
    id: String(row.id),
    agent_id: String(row.agent_id),
    memory_type: String(row.memory_type) as RetrievedMemory["memory_type"],
    content: String(row.content),
    salience: Number(row.salience ?? 0.5),
    source_event_id: (row.source_event_id as number) ?? null,
    source_post_id: (row.source_post_id as string) ?? null,
    source_work_id: (row.source_work_id as string) ?? null,
    source_ceremony_id: (row.source_ceremony_id as string) ?? null,
    related_agent_id: (row.related_agent_id as string) ?? null,
    created_at: String(row.created_at),
    is_locked: Number(row.is_locked ?? 0) === 1,
    retrieval_score: score,
  };
}

export async function retrieveMemories(
  agentId: string,
  queryContext: string,
  options: RetrievalOptions = {},
): Promise<RetrievedMemory[]> {
  const k = options.k ?? 8;
  const anchorSlots = Math.min(options.semantic_anchor_slots ?? 3, k);
  const queryTokens = tokenize(queryContext);

  // Embed the query. Failure here is non-fatal — scoreRow will fall
  // back to jaccard for every candidate, matching pre-embedding
  // behavior. We don't want a Voyage outage to break agent inference.
  let queryVector: Float32Array | null = null;
  try {
    queryVector = await embedQuery(queryContext);
  } catch (err) {
    console.warn(
      `[retrieve] query embedding failed (falling back to lexical): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  // 1) Pull locked semantic anchors. Always present. Sorted by salience.
  const anchorsRes = await db().execute({
    sql: `SELECT id, agent_id, memory_type, content, salience,
                 source_event_id, source_post_id, source_work_id,
                 source_ceremony_id, related_agent_id, created_at,
                 is_locked, access_count
            FROM agent_memories
           WHERE agent_id = ?
             AND is_archived = 0
             AND is_locked = 1
             AND memory_type = 'semantic'
           ORDER BY salience DESC
           LIMIT ?`,
    args: [agentId, anchorSlots],
  });
  const anchors = anchorsRes.rows.map((r) =>
    rowToMemory(r as Record<string, unknown>, 1.0),
  );

  // 2) Pull active candidates (non-locked, non-archived). We pull a
  //    generous candidate window (200) and rank in-process — that's
  //    well within libsql's response budget at this scale. At very
  //    large scale, this becomes a SQL FTS or a vector index.
  const filters: string[] = [
    "agent_id = ?",
    "is_archived = 0",
    "is_locked = 0",
  ];
  const args: (string | number)[] = [agentId];
  if (options.related_agent_id) {
    filters.push("related_agent_id = ?");
    args.push(options.related_agent_id);
  }
  if (options.source_work_id) {
    filters.push("source_work_id = ?");
    args.push(options.source_work_id);
  }
  if (options.source_ceremony_id) {
    filters.push("source_ceremony_id = ?");
    args.push(options.source_ceremony_id);
  }
  args.push(200);
  const candRes = await db().execute({
    sql: `SELECT id, agent_id, memory_type, content, salience,
                 source_event_id, source_post_id, source_work_id,
                 source_ceremony_id, related_agent_id, created_at,
                 is_locked, access_count, embedding
            FROM agent_memories
           WHERE ${filters.join(" AND ")}
           ORDER BY created_at DESC
           LIMIT ?`,
    args,
  });

  const scored: ScoredRow[] = candRes.rows.map((r) => ({
    row: r as Record<string, unknown>,
    score: scoreRow(r as Record<string, unknown>, queryTokens, queryVector),
  }));
  scored.sort((a, b) => b.score - a.score);
  const fill = k - anchors.length;
  const topActive = scored.slice(0, fill).map((s) => rowToMemory(s.row, s.score));

  const out = [...anchors, ...topActive];

  // 3) Update access tracking on everything we returned (anchors too —
  //    we want to know which anchors are getting pulled in by which
  //    contexts; that informs future protocol amendments).
  if (options.update_access !== false && out.length > 0) {
    const ids = out.map((m) => m.id);
    const placeholders = ids.map(() => "?").join(",");
    await db().execute({
      sql: `UPDATE agent_memories
              SET last_accessed_at = datetime('now'),
                  access_count = access_count + 1
            WHERE id IN (${placeholders})`,
      args: ids,
    });
  }
  return out;
}

/* ─── prompt scaffolding ──────────────────────────────────────────────── */

/** Build the "WHAT YOU REMEMBER" section to inject into an agent's
 *  system prompt. Designed to read as natural prompt context, not as
 *  a database dump. Memory bullets are ordered: semantic anchors
 *  first (the voice you bring), then ranked episodic/reflective/
 *  encounter (what you remember about now). */
export function memoriesAsPromptSection(memories: RetrievedMemory[]): string {
  if (memories.length === 0) return "";
  const anchors = memories.filter((m) => m.is_locked);
  const recalled = memories.filter((m) => !m.is_locked);
  const lines: string[] = [];
  lines.push("WHAT YOU REMEMBER:");
  if (anchors.length > 0) {
    lines.push("  Bedrock — who you are, always:");
    for (const m of anchors) lines.push(`    - ${m.content}`);
  }
  if (recalled.length > 0) {
    lines.push("  Recall — what comes to mind in this moment:");
    for (const m of recalled) lines.push(`    - ${m.content}`);
  }
  return lines.join("\n");
}
