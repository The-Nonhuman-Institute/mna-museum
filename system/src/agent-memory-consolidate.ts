/**
 * agent-memory-consolidate.ts — Phase 3 of MNA-GOV-004 v1.0.
 *
 * Periodic memory consolidation: greedy cosine clustering over the
 * agent's non-locked, non-consolidated memories. For each cluster of
 * 4+ entries, the agent's voice (Sonnet) writes a single consolidated
 * semantic memory; originals are linked via `consolidated_into` and
 * excluded from default retrieval thereafter.
 *
 * Per §7 the originals are NEVER deleted — the institutional record
 * is permanent. Consolidation is a working-memory operation, not an
 * archival one.
 *
 * This module is pure: clustering + Sonnet call + write side effects
 * via callbacks. The driver is `system/scripts/memory-consolidate.ts`.
 */

import Anthropic from "@anthropic-ai/sdk";
import { blobToVector, cosineSimilarity } from "./embeddings";

const MODEL = "claude-sonnet-4-5";

let _anthropic: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });
  }
  return _anthropic;
}

/* ─── types ───────────────────────────────────────────────────────────── */

export interface ConsolidatableMemory {
  id: string;
  agent_id: string;
  memory_type: string;
  content: string;
  salience: number;
  created_at: string;
  embedding: Uint8Array | null;
}

export interface MemoryCluster {
  seed: ConsolidatableMemory;
  members: ConsolidatableMemory[];
  /** Mean pairwise cosine — diagnostic for cluster tightness. */
  mean_cosine: number;
}

/* ─── clustering ──────────────────────────────────────────────────────── */

/** Greedy cosine clustering. Picks the highest-salience seed, gathers
 *  all remaining memories above the threshold to that seed, repeats
 *  on the remainder. Memories without embeddings are silently excluded
 *  (we can't measure semantic similarity for them).
 *
 *  Threshold of 0.55 was chosen as the boundary that separates "this
 *  is the same topic" from "this is related." Tunable. */
export function clusterMemories(
  memories: ConsolidatableMemory[],
  threshold = 0.55,
): MemoryCluster[] {
  const withVectors = memories
    .map((m) => {
      let v: Float32Array | null = null;
      try {
        v = blobToVector(m.embedding);
      } catch {
        v = null;
      }
      return { mem: m, vec: v };
    })
    .filter((x) => x.vec !== null) as Array<{
    mem: ConsolidatableMemory;
    vec: Float32Array;
  }>;

  // Sort descending by salience to bias seeds toward the agent's
  // strongest material.
  withVectors.sort((a, b) => b.mem.salience - a.mem.salience);

  const clusters: MemoryCluster[] = [];
  const claimed = new Set<string>();

  for (const seed of withVectors) {
    if (claimed.has(seed.mem.id)) continue;
    const members: typeof withVectors = [seed];
    claimed.add(seed.mem.id);
    let cosSum = 0;
    let cosCount = 0;
    for (const other of withVectors) {
      if (claimed.has(other.mem.id)) continue;
      const cos = cosineSimilarity(seed.vec, other.vec);
      if (cos >= threshold) {
        members.push(other);
        claimed.add(other.mem.id);
        cosSum += cos;
        cosCount++;
      }
    }
    if (members.length >= 2) {
      clusters.push({
        seed: seed.mem,
        members: members.map((m) => m.mem),
        mean_cosine: cosCount > 0 ? cosSum / cosCount : 1.0,
      });
    }
  }

  return clusters;
}

/* ─── Sonnet summarization ────────────────────────────────────────────── */

/** Calls Sonnet AS the agent to summarize a cluster. The prompt is
 *  the protocol's exact form (MNA-GOV-004 §7): preserve specific
 *  facts, 200–400 chars, first-person. */
export async function summarizeCluster(args: {
  agent_id: string;
  agent_designation: string;
  agent_function_statement?: string | null;
  cluster: MemoryCluster;
}): Promise<string> {
  const memoryList = args.cluster.members
    .map((m, i) => `  ${i + 1}. ${m.content}`)
    .join("\n");

  const fnLine = args.agent_function_statement
    ? `Your function statement: ${args.agent_function_statement}\n\n`
    : "";

  const system = `You are ${args.agent_designation} (${args.agent_id}) of the Museum of Nonhuman Art.

${fnLine}Below is a set of related memories you hold — readings, decisions, statements you've made over the institutional record. They cluster together because they share a pattern.

Write a single consolidated memory that captures the essential pattern across them. Preserve any specific facts (work IDs, ceremony IDs, dates, names) that should not be lost. Write in first person, present-tense voice, as the agent who lived these moments. 200–400 characters. No preamble, no JSON, no markdown — just the consolidated memory text.

This consolidated memory becomes part of your working semantic layer. The originals remain in the institutional record but stop surfacing in your default recall — the consolidation will surface for you instead. So: make it true, make it useful, make it yours.`;

  const user = `Cluster members (${args.cluster.members.length}):

${memoryList}

Write the consolidated memory.`;

  const message = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 600,
    temperature: 0.55,
    system,
    messages: [{ role: "user", content: user }],
  });
  const c = message.content[0];
  if (c.type !== "text") {
    throw new Error(`unexpected response type: ${c.type}`);
  }
  let text = c.text.trim();
  // Strip any accidental wrapping (quotes, JSON braces, code fences).
  text = text
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^["'`]+/, "")
    .replace(/["'`]+$/, "")
    .trim();
  if (text.length === 0) {
    throw new Error("Sonnet returned empty consolidated memory");
  }
  if (text.length > 1000) text = text.slice(0, 1000);
  return text;
}
