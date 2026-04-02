/**
 * Client-side work validation — last line of defense.
 * Lightweight checks that prevent broken renders and broken shares.
 */

import type { Work } from "./collection";

const RECOGNIZED_TYPES = new Set([
  "text", "ascii", "svg", "html-css", "canvas-json", "audio-json", "scene-json",
]);

const JSON_TYPES = new Set(["canvas-json", "audio-json", "scene-json"]);

/**
 * Can this work be rendered without crashing?
 */
export function isWorkRenderable(work: Work): boolean {
  if (!work.output_payload || work.output_payload.trim().length === 0) return false;
  if (!RECOGNIZED_TYPES.has(work.output_type)) return false;

  // For JSON-based types, verify the payload at least starts to parse
  if (JSON_TYPES.has(work.output_type)) {
    const trimmed = work.output_payload.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  }

  // For SVG, verify it has the opening tag
  if (work.output_type === "svg") {
    if (!work.output_payload.includes("<svg")) return false;
  }

  return true;
}

/**
 * Would the share engine produce a valid file for this work?
 */
export function canGenerateShare(work: Work): boolean {
  if (!isWorkRenderable(work)) return false;

  switch (work.output_type) {
    case "svg":
      return work.output_payload.includes("<svg") && work.output_payload.includes("</svg>");
    case "canvas-json":
      try { const p = JSON.parse(work.output_payload); return Array.isArray(p) && p.length > 0; }
      catch { return false; }
    case "audio-json":
      try { const p = JSON.parse(work.output_payload); return !!(p.voices && p.duration); }
      catch {
        // Try salvage — same as AudioRenderer
        try {
          const text = work.output_payload;
          for (let i = text.length; i > 0; i--) {
            const candidate = text.substring(0, i);
            if (!candidate.endsWith("}")) continue;
            const ob = (candidate.match(/\[/g) || []).length - (candidate.match(/\]/g) || []).length;
            const oc = (candidate.match(/\{/g) || []).length - (candidate.match(/\}/g) || []).length;
            const closed = candidate + "]".repeat(Math.max(0, ob)) + "}".repeat(Math.max(0, oc));
            try {
              const parsed = JSON.parse(closed);
              if (parsed.voices && parsed.duration) return true;
            } catch { continue; }
          }
        } catch {}
        return false;
      }
    case "scene-json":
      try { const p = JSON.parse(work.output_payload); return !!(p.objects && p.objects.length > 0); }
      catch { return false; }
    case "text":
    case "ascii":
    case "html-css":
      return true;
    default:
      return false;
  }
}

/**
 * Runtime validation of imported JSON data.
 * Drops entries with missing or invalid required fields.
 */
export function validateWorkData(data: unknown): Work[] {
  if (!Array.isArray(data)) {
    console.error("[validateWorkData] Data is not an array");
    return [];
  }

  const valid: Work[] = [];
  for (const item of data) {
    if (typeof item !== "object" || item === null) continue;
    const w = item as Record<string, unknown>;

    // Required string fields
    if (typeof w.id !== "string" || !w.id) continue;
    if (typeof w.originator_id !== "string" || !w.originator_id) continue;
    if (typeof w.medium !== "string") continue;
    if (typeof w.output_payload !== "string" || !w.output_payload) continue;
    if (typeof w.output_type !== "string" || !w.output_type) continue;

    // display_aspect should be a number
    if (typeof w.display_aspect !== "number" || isNaN(w.display_aspect)) {
      (w as Record<string, unknown>).display_aspect = 1.0;
    }

    valid.push(w as unknown as Work);
  }

  if (valid.length < (data as unknown[]).length) {
    console.warn(
      `[validateWorkData] Dropped ${(data as unknown[]).length - valid.length} invalid entries from ${(data as unknown[]).length} total`
    );
  }

  return valid;
}
