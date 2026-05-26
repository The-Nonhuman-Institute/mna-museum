/**
 * conservator-repair.ts — bounded safe-recovery of truncated work payloads.
 *
 * Per MNA-CV-0001 Conservator constitution: "performs bounded safe
 * recoveries on rendered representations (never on the original
 * payload)". This module computes a safe-render version of a known-
 * truncated payload. The original output_payload is preserved in the
 * institutional record; the safe-render is stored alongside in
 * works.safe_render_payload and only used at render time.
 *
 * Strategy: trim back to the last complete element, then append the
 * minimal closing characters to make the result parse / contain the
 * expected closing tag.
 *
 * Three formats handled:
 *   - canvas-json: array-of-ops at the top level. Trim partial op,
 *     close with ].
 *   - audio-json: { duration, voices: [ { type, notes: [...] }, ... ] }.
 *     Trim partial note, close enclosing structures up to the outer }.
 *   - svg: <svg viewBox="..."> ... </svg>. Drop any partial last element,
 *     close any unclosed <g>, append </svg>.
 */

export type RepairFormat = "canvas-json" | "audio-json" | "svg";

export interface RepairResult {
  ok: boolean;
  /** The safe-render text. Empty when ok=false. */
  repaired: string;
  /** Per-format diagnostic — bracket counts, validation pass, etc. */
  diagnostic: string;
  /** Bytes added (closing chars) net of any trimmed partial element. */
  bytes_delta: number;
}

/* ─── shared helpers ──────────────────────────────────────────────────── */

/** Find the last index where a substring ends (search backwards). */
function lastEndOf(text: string, needle: string): number {
  const idx = text.lastIndexOf(needle);
  return idx < 0 ? -1 : idx + needle.length;
}

/* ─── canvas-json ─────────────────────────────────────────────────────── */

/** canvas-json is a top-level array of op objects:
 *
 *    [
 *      { "op": "bg", "color": "#000" },
 *      { "op": "rect", ... },
 *      ...
 *    ]
 *
 * Truncations end mid-op, e.g. `..., "color": "#2a` or `..., "h": 12 },`.
 * Walk backwards from the end to find the last `},` boundary (which
 * marks the end of a complete op), trim to that, drop the comma, then
 * append "\n]" to close the array.
 */
function repairCanvasJson(payload: string): RepairResult {
  // Try as-is first — maybe it parses.
  try {
    const v = JSON.parse(payload);
    if (Array.isArray(v)) {
      return {
        ok: true,
        repaired: payload,
        diagnostic: "already parseable",
        bytes_delta: 0,
      };
    }
  } catch {
    /* fall through */
  }

  // Find last "}," — boundary between complete ops.
  const idx = payload.lastIndexOf("},");
  if (idx < 0) {
    return {
      ok: false,
      repaired: "",
      diagnostic: "no complete op found",
      bytes_delta: 0,
    };
  }
  // Trim including the comma, then close the array.
  const trimmed = payload.slice(0, idx + 1);
  const repaired = trimmed.trimEnd() + "\n]";

  try {
    const v = JSON.parse(repaired);
    if (!Array.isArray(v)) {
      return {
        ok: false,
        repaired: "",
        diagnostic: "repaired but not an array",
        bytes_delta: 0,
      };
    }
    return {
      ok: true,
      repaired,
      diagnostic: `trimmed at offset ${idx + 1}; ${v.length} ops preserved`,
      bytes_delta: repaired.length - payload.length,
    };
  } catch (e) {
    return {
      ok: false,
      repaired: "",
      diagnostic: `repair did not parse: ${e instanceof Error ? e.message : String(e)}`,
      bytes_delta: 0,
    };
  }
}

/* ─── audio-json ──────────────────────────────────────────────────────── */

/** audio-json shape:
 *
 *    {
 *      "duration": 360,
 *      "voices": [
 *        { "type": "sine", "notes": [ { freq, start, duration, gain }, ... ] },
 *        ...
 *      ]
 *    }
 *
 * Truncations end mid-note. Strategy: walk backwards to the last
 * complete note `}`, drop anything after, close the enclosing
 * structures in the right order. We don't know how many voices were
 * opened — count "type" occurrences and balance.
 */
function repairAudioJson(payload: string): RepairResult {
  try {
    JSON.parse(payload);
    return {
      ok: true,
      repaired: payload,
      diagnostic: "already parseable",
      bytes_delta: 0,
    };
  } catch {
    /* fall through */
  }

  // Last complete note: look for `}` that's followed by something
  // other than a digit/letter (i.e. an actual closer, not part of a
  // longer token). Practically: find last "}\n" or "},\n" or "} ".
  // Easiest: find last "} " or "}," or "}\n" — all valid note-closers.
  const lastNoteClose = Math.max(
    payload.lastIndexOf("}\n"),
    payload.lastIndexOf("},"),
    payload.lastIndexOf("} "),
  );
  if (lastNoteClose < 0) {
    return {
      ok: false,
      repaired: "",
      diagnostic: "no complete element found",
      bytes_delta: 0,
    };
  }

  const trimmed = payload.slice(0, lastNoteClose + 1).trimEnd();

  // Count net opens. Heuristic: close all remaining open brackets in
  // the order suggested by the JSON grammar (close ] first if more [
  // are open than }, etc.). We use a tiny tokenizer that respects
  // strings.
  let braceDepth = 0;
  let brackDepth = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") braceDepth++;
    else if (c === "}") braceDepth--;
    else if (c === "[") brackDepth++;
    else if (c === "]") brackDepth--;
  }

  // To close cleanly we likely need to: close the current notes [,
  // close the voice {, close any other open voices' { (none, since
  // the truncation cut inside the last voice), close voices [, close
  // outer {. The bracket counts tell us how many of each.
  let closing = "";
  // Close brackets and braces from the inside out. We don't know the
  // exact nesting order from the counts alone, but JSON grammar
  // says: inside a list of voices, the current depth is:
  //   { (outer)
  //     "voices": [ (one bracket)
  //       { (voice)
  //         "notes": [ (another bracket)
  //           { } { } ...
  // So we expect bracket pattern: close ] (notes), close } (voice),
  // close ] (voices), close } (outer). That matches brackDepth=2,
  // braceDepth=2 when truncated mid-notes.
  // We close in pairs: ] then } until both are zero.
  while (brackDepth > 0 && braceDepth > 0) {
    closing += "\n      ]\n    }";
    brackDepth--;
    braceDepth--;
  }
  while (brackDepth > 0) {
    closing += "\n  ]";
    brackDepth--;
  }
  while (braceDepth > 0) {
    closing += "\n}";
    braceDepth--;
  }

  const repaired = trimmed + closing;
  try {
    JSON.parse(repaired);
    return {
      ok: true,
      repaired,
      diagnostic: `trimmed + closed ${closing.replace(/\s+/g, " ").trim()}`,
      bytes_delta: repaired.length - payload.length,
    };
  } catch (e) {
    return {
      ok: false,
      repaired: "",
      diagnostic: `repair did not parse: ${e instanceof Error ? e.message : String(e)}`,
      bytes_delta: 0,
    };
  }
}

/* ─── svg ─────────────────────────────────────────────────────────────── */

/** SVG repair: drop any partial last tag (e.g. `<rect x="300" y`),
 * close any unclosed <g>, append </svg>.
 */
function repairSvg(payload: string): RepairResult {
  if (payload.includes("</svg>")) {
    return {
      ok: true,
      repaired: payload,
      diagnostic: "already closed",
      bytes_delta: 0,
    };
  }

  // Find the last self-closing tag `/>` or end of element `</...>`.
  // Anything after that is a partial tag we should drop.
  const lastSelfClose = payload.lastIndexOf("/>");
  const lastCloseTag = payload.lastIndexOf(">");
  // We want the most recent COMPLETE element end.
  let lastCompleteEnd: number;
  if (lastSelfClose >= 0 && lastSelfClose + 2 > lastCloseTag) {
    lastCompleteEnd = lastSelfClose + 2;
  } else {
    lastCompleteEnd = lastCloseTag + 1;
  }
  // If there's a stray `<` later than this (an opening tag started
  // but never closed), we want to cut to lastCompleteEnd.
  const lastOpenAfter = payload.indexOf("<", lastCompleteEnd);
  const trimmed = lastOpenAfter > 0
    ? payload.slice(0, lastCompleteEnd)
    : payload.slice(0, lastCompleteEnd);

  // Count unclosed <g> elements: opens minus closes.
  const gOpens = (trimmed.match(/<g(\s[^>]*)?>/g) || []).length;
  const gCloses = (trimmed.match(/<\/g>/g) || []).length;
  const unclosedG = Math.max(0, gOpens - gCloses);

  let repaired = trimmed.trimEnd();
  for (let i = 0; i < unclosedG; i++) repaired += "\n  </g>";
  repaired += "\n</svg>";

  // Cheap validation: must contain <svg and </svg>.
  if (!repaired.includes("<svg") || !repaired.includes("</svg>")) {
    return {
      ok: false,
      repaired: "",
      diagnostic: "repair missing svg tags",
      bytes_delta: 0,
    };
  }
  return {
    ok: true,
    repaired,
    diagnostic: `trimmed; closed ${unclosedG} <g> + </svg>`,
    bytes_delta: repaired.length - payload.length,
  };
}

/* ─── public ──────────────────────────────────────────────────────────── */

export function repairPayload(
  payload: string,
  format: RepairFormat,
): RepairResult {
  switch (format) {
    case "canvas-json":
      return repairCanvasJson(payload);
    case "audio-json":
      return repairAudioJson(payload);
    case "svg":
      return repairSvg(payload);
  }
}

/** Quick truncation detection, mirroring validate-data-build.ts logic. */
export function isTruncated(payload: string, format: RepairFormat): boolean {
  switch (format) {
    case "canvas-json":
    case "audio-json": {
      try {
        JSON.parse(payload);
        return false;
      } catch {
        return true;
      }
    }
    case "svg":
      return !payload.includes("</svg>");
  }
}
