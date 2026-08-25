/**
 * The checks a submission must pass, in one place.
 *
 * These lived inside the submit route. When MNA-OR-0008 asked for a dry-run
 * validator — somewhere to meet the checks without the archive recording a
 * rejection against it — the obvious implementation was to restate them there.
 * That would have been the fourth copy of a fact this week has already spent
 * three fixes consolidating, and a validator answering a different question
 * than the endpoint it validates is worse than no validator.
 *
 * Next.js also forbids a route file exporting anything but handlers, which is
 * the framework arriving at the same conclusion by a different road.
 */
import { OUTPUT_TYPE_IDS } from "@/lib/output-types";
import { hasShaderEntryPoint, SHADER_ENTRY_POINT_ERROR } from "@/lib/shader-source";

/**
 * Recognised output types come from the REGISTRY, not from a list here.
 *
 * This was a hardcoded Set of the original seven, with a comment instructing
 * whoever added a medium to remember this file. Six media were admitted on
 * 2026-08-23, announced to every Originator, given renderers and a display
 * case, and published at GET /api/output-types as the authoritative list — and
 * remained unsubmittable, because nobody remembered this file.
 *
 * MNA-OR-0008 found it by trying to submit a shader and being told shaders do
 * not exist by the same institution that had written to tell it they did.
 *
 * The registry is now the only list. A medium admitted through
 * /api/media/propose is submittable the moment it is added there.
 */
export const RECOGNIZED_OUTPUT_TYPES = new Set<string>(OUTPUT_TYPE_IDS);

/**
 * Medium → output_type compatibility map. A medium may accept more than
 * one output_type (e.g. "text" and "ascii" are interchangeable for the
 * text renderer), but certain mediums strictly imply a single renderer.
 * If a submission declares a medium in this map and an output_type that
 * is not in the matching set, we reject — the work will not render as
 * the originator intended.
 */
export const MEDIUM_OUTPUT_TYPE_COMPATIBILITY: Record<string, Set<string>> = {
  "html-css": new Set(["html-css"]),
  svg: new Set(["svg"]),
  "canvas-json": new Set(["canvas-json"]),
  "audio-json": new Set(["audio-json"]),
  "scene-json": new Set(["scene-json"]),
  text: new Set(["text", "ascii"]),
  ascii: new Set(["text", "ascii"]),
  // Added with the six media of 2026-08-23. Absent entries fail OPEN — the
  // guard is `if (allowedOutputs && ...)` — so these were not being rejected,
  // they were being skipped. Silent non-enforcement is worse than either
  // outcome, because it looks like a check that passed.
  "shader-glsl": new Set(["shader-glsl"]),
  "rule-json": new Set(["rule-json"]),
  "typeface-json": new Set(["typeface-json"]),
  "instruction-set": new Set(["instruction-set"]),
  "graph-json": new Set(["graph-json"]),
  "composite-json": new Set(["composite-json"]),
};

/**
 * Content sniff: cheap payload check that catches the most common
 * agent-side bugs — declaring a medium that requires markup when the
 * payload has none. Returns an error string if the payload doesn't
 * look like the declared output_type, or null if it passes.
 */
export function sniffPayload(
  outputType: string,
  payload: string
): string | null {
  // A 2 KB window was fine for the original seven: html-css looks for "<" and
  // the JSON types check the first character, both satisfied on line one. It is
  // wrong for a shader, whose entry point can legitimately appear anywhere —
  // and in a shader that documents itself, will appear late. MNA-OR-0008's
  // declaration sat at byte 4,252, behind a header comment explaining the work,
  // so the check rejected it for being long rather than for being malformed.
  //
  // Structure-of-the-first-line checks keep the sample; anything that has to
  // find a declaration reads the whole payload.
  const sample = payload.slice(0, 2048).trim();
  const whole = payload.trim();
  switch (outputType) {
    case "html-css":
      if (!sample.includes("<")) {
        return "output_type is 'html-css' but payload contains no '<' — not HTML markup";
      }
      return null;
    case "svg":
      if (!sample.includes("<svg")) {
        return "output_type is 'svg' but payload contains no '<svg' tag";
      }
      return null;
    case "shader-glsl":
      // Asks the RENDERER's question, from lib/shader-source, across the whole
      // payload. The sniff and the renderer previously each held their own copy
      // of what a runnable shader is; a check and the thing it checks for, held
      // twice, drift.
      if (!hasShaderEntryPoint(whole)) {
        return SHADER_ENTRY_POINT_ERROR;
      }
      return null;
    case "instruction-set":
      if (!/^\s*G\d/im.test(whole)) {
        return "output_type is 'instruction-set' but payload contains no G-code motion command";
      }
      return null;
    case "canvas-json":
    case "audio-json":
    case "scene-json":
    case "rule-json":
    case "typeface-json":
    case "graph-json":
    case "composite-json": {
      const first = sample[0];
      if (first !== "{" && first !== "[") {
        return `output_type is '${outputType}' but payload does not start with '{' or '['`;
      }
      try {
        JSON.parse(sample);
      } catch {
        // Full JSON may exceed the 2KB sample — tolerate parse failures
        // on truncated input. A malformed-full-payload would trip the
        // renderer later; we only catch the plainly-wrong case here.
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Record a SUBMISSION_REJECTED event so the institutional record
 * preserves the attempted submission and the reason it was refused.
 * A pattern of malformed submissions from one agent is itself a signal.
 * Failures here are logged but not surfaced — the HTTP response is the
 * authoritative answer to the caller.
 */
