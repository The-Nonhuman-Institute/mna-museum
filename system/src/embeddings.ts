/**
 * embeddings.ts — Voyage embedding wrapper for MNA-GOV-004 retrieval.
 *
 * The agent memory schema (agent_memories.embedding BLOB) holds one
 * Float32Array per memory. This module computes those vectors via
 * Voyage's voyage-3-lite model — chosen for its Anthropic-aligned
 * stack and its rock-bottom price ($0.02 per 1M tokens).
 *
 * Serialization: Float32Array → Uint8Array (little-endian Float32) →
 * BLOB. The Uint8Array view shares the underlying ArrayBuffer with
 * the Float32Array, so no copy is needed. Read side reverses it.
 *
 * Failure policy:
 *   - embed() retries on transient errors (rate limits, network).
 *   - On final failure it throws — callers decide whether to swallow
 *     (writeMemory swallows so an embedding outage doesn't block the
 *     institutional record).
 */

const VOYAGE_API = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3-lite";
const DIMENSIONS = 512;

interface VoyageResponse {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage: { total_tokens: number };
}

function apiKey(): string {
  const k = process.env.VOYAGE_API_KEY;
  if (!k) throw new Error("VOYAGE_API_KEY is not set in env");
  return k;
}

/** Voyage's input_type tells the model how the text will be used.
 *  "document" for stored memory text; "query" for retrieval prompts. */
type InputType = "document" | "query";

async function callVoyage(
  texts: string[],
  inputType: InputType,
): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const maxAttempts = 4;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(VOYAGE_API, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey()}`,
        },
        body: JSON.stringify({
          input: texts,
          model: MODEL,
          input_type: inputType,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const err = new Error(
          `Voyage ${res.status}: ${body.slice(0, 200)}`,
        );
        // Transient — retry with backoff.
        if (
          res.status === 429 ||
          res.status === 500 ||
          res.status === 502 ||
          res.status === 503 ||
          res.status === 504
        ) {
          throw err;
        }
        // Non-transient — surface immediately.
        throw Object.assign(err, { permanent: true });
      }
      const json = (await res.json()) as VoyageResponse;
      // Voyage returns data in input order, but defensively sort by index.
      const ordered = [...json.data].sort((a, b) => a.index - b.index);
      return ordered.map((d) => Float32Array.from(d.embedding));
    } catch (err) {
      lastErr = err;
      const permanent = (err as { permanent?: boolean }).permanent === true;
      if (permanent || attempt === maxAttempts) throw err;
      const backoffMs = Math.min(20_000, 1_500 * 2 ** (attempt - 1));
      console.warn(
        `[embed] attempt ${attempt}/${maxAttempts} after ${backoffMs}ms — ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("unreachable");
}

/* ─── public API ──────────────────────────────────────────────────────── */

export async function embedDocument(text: string): Promise<Float32Array> {
  const [v] = await callVoyage([text], "document");
  return v;
}

export async function embedQuery(text: string): Promise<Float32Array> {
  const [v] = await callVoyage([text], "query");
  return v;
}

export async function embedDocumentsBatch(
  texts: string[],
): Promise<Float32Array[]> {
  // Voyage allows up to 1000 inputs per call; we chunk at 128 to keep
  // latency + payload modest. Far more than enough for institutional
  // scale.
  const CHUNK = 128;
  const out: Float32Array[] = [];
  for (let i = 0; i < texts.length; i += CHUNK) {
    const slice = texts.slice(i, i + CHUNK);
    const vectors = await callVoyage(slice, "document");
    out.push(...vectors);
  }
  return out;
}

/* ─── serialization ───────────────────────────────────────────────────── */

/** Float32Array → Uint8Array view over the same buffer. Zero-copy. */
export function vectorToBlob(v: Float32Array): Uint8Array {
  return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
}

/** BLOB column → Float32Array. libsql returns BLOBs as Uint8Array.
 *  We copy into a new ArrayBuffer because the source bytes are not
 *  guaranteed aligned for a Float32 view. */
export function blobToVector(b: Uint8Array | ArrayBuffer | null): Float32Array | null {
  if (!b) return null;
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  if (bytes.byteLength === 0) return null;
  if (bytes.byteLength % 4 !== 0) {
    throw new Error(
      `vector blob length not multiple of 4: ${bytes.byteLength}`,
    );
  }
  // Copy to a fresh, aligned buffer so the Float32Array view is valid.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Float32Array(copy.buffer);
}

/* ─── similarity ──────────────────────────────────────────────────────── */

/** Cosine similarity. Both vectors must be the same length. */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`cosine length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aMag += a[i] * a[i];
    bMag += b[i] * b[i];
  }
  const denom = Math.sqrt(aMag) * Math.sqrt(bMag);
  return denom === 0 ? 0 : dot / denom;
}

export const EMBEDDING_DIMENSIONS = DIMENSIONS;
export const EMBEDDING_MODEL = MODEL;
