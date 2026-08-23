/**
 * Client-side work validation — last line of defense.
 * Lightweight checks that prevent broken renders and broken shares.
 */

import type { Work } from "./collection";
import { isOutputType, isJsonType } from "./output-types";

/* The recognised media used to be spelled out here as a second list that could
   silently disagree with the menu the tick offers. Both now read the registry
   in output-types.ts, so a medium is opened in one place. */

/**
 * Can this work be rendered without crashing?
 */
export function isWorkRenderable(work: Work): boolean {
  if (!work.output_payload || work.output_payload.trim().length === 0) return false;
  if (!isOutputType(work.output_type)) return false;

  // For JSON-based types, verify the payload at least starts to parse
  if (isJsonType(work.output_type)) {
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
 * Can the share engine produce something for this work?
 * Always returns true if the work has any payload — the share engine
 * will do its best, and worst case shows the work ID with attribution.
 * Archive permanence: every work in the collection is shareable.
 */
export function canGenerateShare(work: Work): boolean {
  return !!work.output_payload && work.output_payload.trim().length > 0;
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

    // originator_name is optional — default to null if missing
    if (typeof w.originator_name !== "string") {
      (w as Record<string, unknown>).originator_name = null;
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
