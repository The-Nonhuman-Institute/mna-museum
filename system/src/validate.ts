import { playableNotes } from "../../website/src/lib/audio-voices";

/**
 * MNA Output Validation System
 *
 * Centralized validators for every output format.
 * Used by:
 *   - pipeline.ts (gate between LLM output and DB insert)
 *   - export.ts (gate between DB and website JSON)
 *   - formats.ts (confirmation after detection)
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

type OutputFormat = "text" | "ascii" | "svg" | "html-css" | "audio-json" | "canvas-json" | "scene-json";

const VALID_CANVAS_OPS = new Set(["bg", "fill", "stroke", "rect", "circle", "line", "arc", "text"]);
const VALID_OSCILLATOR_TYPES = new Set(["sine", "square", "sawtooth", "triangle"]);
const VALID_3D_SHAPES = new Set(["box", "sphere", "cylinder", "cone", "torus", "plane"]);

// ─── Per-format validators ────────────────────────────────────────────────────

function validateText(payload: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Strip color metadata before checking
  const stripped = payload.replace(/^@bg:#[0-9a-fA-F]+\s*(?:@fg:#[0-9a-fA-F]+)?\s*\n?/, "").trim();

  if (!stripped || stripped.length < 5) {
    errors.push("Text payload is empty or too short (< 5 chars after stripping metadata)");
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateAscii(payload: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const stripped = payload.replace(/^@bg:#[0-9a-fA-F]+\s*(?:@fg:#[0-9a-fA-F]+)?\s*\n?/, "").trim();

  if (!stripped || stripped.length < 5) {
    errors.push("ASCII payload is empty or too short");
  }

  const lines = stripped.split("\n");
  if (lines.length < 2) {
    warnings.push("ASCII work has fewer than 2 lines — may not be a visual composition");
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateSvg(payload: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const trimmed = payload.trim();

  if (!trimmed.includes("<svg")) {
    errors.push("SVG payload does not contain <svg tag");
    return { valid: false, errors, warnings };
  }

  if (!trimmed.includes("</svg>")) {
    errors.push("SVG payload is truncated — missing </svg> closing tag");
    return { valid: false, errors, warnings };
  }

  // Extract SVG content
  const svgStart = trimmed.indexOf("<svg");
  const svgEnd = trimmed.lastIndexOf("</svg>") + 6;
  const svgContent = trimmed.substring(svgStart, svgEnd);

  if (svgContent.length < 20) {
    errors.push("SVG content is too short to be a valid work");
  }

  // Check for viewBox
  if (!svgContent.includes("viewBox")) {
    warnings.push("SVG has no viewBox — aspect ratio may be incorrect");
  }

  // Check for XSS vectors
  if (/<script/i.test(svgContent)) {
    warnings.push("SVG contains <script> tag — will be stripped during rendering");
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateHtmlCss(payload: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const trimmed = payload.trim();

  const hasDoctype = trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<!doctype");
  const hasHtml = trimmed.includes("<html");
  const hasStyle = trimmed.includes("<style");

  if (!hasDoctype && !hasHtml && !hasStyle) {
    errors.push("HTML-CSS payload does not look like an HTML document");
    return { valid: false, errors, warnings };
  }

  if (!trimmed.includes("</html>") && !trimmed.includes("</style>")) {
    errors.push("HTML-CSS payload is truncated — missing closing tags");
    return { valid: false, errors, warnings };
  }

  if (trimmed.length < 50) {
    errors.push("HTML-CSS content is too short to be a valid work");
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateCanvasJson(payload: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let ops: unknown[];
  try {
    const parsed = JSON.parse(payload);
    if (!Array.isArray(parsed)) {
      errors.push("Canvas-JSON payload is not a JSON array");
      return { valid: false, errors, warnings };
    }
    ops = parsed;
  } catch (e) {
    errors.push(`Canvas-JSON parse failed: ${(e as Error).message}`);
    return { valid: false, errors, warnings };
  }

  if (ops.length === 0) {
    errors.push("Canvas-JSON has no drawing operations");
    return { valid: false, errors, warnings };
  }

  let validOps = 0;
  for (const op of ops) {
    if (typeof op === "object" && op !== null && "op" in op) {
      const opObj = op as { op: string };
      if (VALID_CANVAS_OPS.has(opObj.op)) {
        validOps++;
      } else {
        warnings.push(`Unknown canvas op: "${opObj.op}"`);
      }
    }
  }

  if (validOps < 2) {
    errors.push(`Canvas-JSON has only ${validOps} valid operations — too few for a work`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateAudioJson(payload: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let data: { duration?: unknown; voices?: unknown[] };
  try {
    data = JSON.parse(payload);
  } catch (e) {
    errors.push(`Audio-JSON parse failed: ${(e as Error).message}`);
    return { valid: false, errors, warnings };
  }

  if (typeof data.duration !== "number" || data.duration <= 0) {
    errors.push("Audio-JSON missing or invalid duration");
  }

  if (!Array.isArray(data.voices) || data.voices.length === 0) {
    errors.push("Audio-JSON missing or empty voices array");
    return { valid: errors.length === 0, errors, warnings };
  }

  // Read through the shared reader rather than walking voice.notes here. This
  // insisted every voice carry a notes array, so a payload whose voices ARE
  // notes was called invalid while the player, the share path and the museum
  // each disagreed differently about the same file. One reader, one answer.
  const notes = playableNotes(data);
  if (notes.length === 0) {
    errors.push(
      "Audio-JSON has no playable notes — expected voices: [{ type, notes: [...] }], " +
        "or voices carrying freq/start/duration directly",
    );
  }

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    if (!VALID_OSCILLATOR_TYPES.has(note.type)) {
      warnings.push(`Note ${i}: invalid oscillator type "${note.type}"`);
    }
    if (note.freq < 1 || note.freq > 25000) {
      warnings.push(`Note ${i}: freq ${note.freq} outside safe range`);
    }
    if (note.gain < 0 || note.gain > 1) {
      warnings.push(`Note ${i}: gain ${note.gain} outside 0-1 range`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateSceneJson(payload: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let data: { objects?: unknown[] };
  try {
    data = JSON.parse(payload);
  } catch (e) {
    errors.push(`Scene-JSON parse failed: ${(e as Error).message}`);
    return { valid: false, errors, warnings };
  }

  if (!Array.isArray(data.objects) || data.objects.length === 0) {
    errors.push("Scene-JSON missing or empty objects array");
    return { valid: false, errors, warnings };
  }

  if (data.objects.length > 500) {
    errors.push(`Scene-JSON has ${data.objects.length} objects — exceeds 500 limit`);
  }

  for (let i = 0; i < data.objects.length; i++) {
    const obj = data.objects[i] as { shape?: string; position?: unknown; color?: string };
    if (!obj.shape || !VALID_3D_SHAPES.has(obj.shape)) {
      warnings.push(`Object ${i}: unknown shape "${obj.shape}" — will default to box`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── Truncation detection ─────────────────────────────────────────────────────

export function detectTruncation(payload: string, format: string): boolean {
  const trimmed = payload.trim();

  switch (format) {
    case "svg":
      return trimmed.includes("<svg") && !trimmed.includes("</svg>");
    case "html-css":
      return (trimmed.includes("<html") || trimmed.includes("<style")) &&
        !trimmed.includes("</html>") && !trimmed.includes("</style>");
    case "canvas-json":
    case "audio-json":
    case "scene-json": {
      const opens = (trimmed.match(/[{[]/g) || []).length;
      const closes = (trimmed.match(/[}\]]/g) || []).length;
      return opens > closes;
    }
    default:
      return false;
  }
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

export function validateWork(payload: string, format: string): ValidationResult {
  if (!payload || payload.trim().length === 0) {
    return { valid: false, errors: ["Payload is empty"], warnings: [] };
  }

  switch (format) {
    case "text": return validateText(payload);
    case "ascii": return validateAscii(payload);
    case "svg": return validateSvg(payload);
    case "html-css": return validateHtmlCss(payload);
    case "canvas-json": return validateCanvasJson(payload);
    case "audio-json": return validateAudioJson(payload);
    case "scene-json": return validateSceneJson(payload);
    default:
      return { valid: false, errors: [`Unknown format: ${format}`], warnings: [] };
  }
}
