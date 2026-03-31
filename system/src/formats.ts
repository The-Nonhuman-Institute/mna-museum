/**
 * Output format definitions for Originator production.
 *
 * Each Originator's seed constitution suggests natural format affinities.
 * The format prompt is appended to the production prompt to guide
 * the model toward producing renderable output.
 *
 * Formats:
 *   text          — plain text, structural or linguistic
 *   ascii         — Unicode/ASCII visual composition
 *   svg           — SVG markup (rendered as image)
 *   html-css      — self-contained HTML+CSS (rendered in sandbox)
 *   audio-json    — Web Audio API instructions (rendered as sound)
 *   canvas-json   — Canvas drawing instructions (rendered on canvas)
 */

export type OutputFormat =
  | "text"
  | "ascii"
  | "svg"
  | "html-css"
  | "audio-json"
  | "canvas-json";

/**
 * Format affinities per Originator seed constitution.
 * Each Originator gets a weighted set of formats it may produce.
 * The system randomly selects from these, biased by weight.
 */
export const originatorFormats: Record<
  string,
  { format: OutputFormat; weight: number }[]
> = {
  "MNA-OR-0001": [
    // Structural density, geometric organization
    { format: "svg", weight: 4 },
    { format: "ascii", weight: 3 },
    { format: "text", weight: 2 },
    { format: "canvas-json", weight: 1 },
  ],
  "MNA-OR-0002": [
    // Temporal, sequential, duration
    { format: "html-css", weight: 4 }, // CSS animations
    { format: "svg", weight: 3 }, // SVG with animate
    { format: "text", weight: 2 },
    { format: "audio-json", weight: 1 },
  ],
  "MNA-OR-0003": [
    // Relational, network, absence
    { format: "svg", weight: 4 }, // Network diagrams
    { format: "ascii", weight: 3 },
    { format: "text", weight: 2 },
    { format: "canvas-json", weight: 1 },
  ],
  "MNA-OR-0004": [
    // Instability, fragmentation
    { format: "html-css", weight: 3 }, // Glitched layouts
    { format: "svg", weight: 3 },
    { format: "ascii", weight: 2 },
    { format: "text", weight: 2 },
  ],
};

/**
 * Select a format for an Originator based on weighted random.
 */
export function selectFormat(originatorId: string): OutputFormat {
  const formats = originatorFormats[originatorId];
  if (!formats) return "text";

  const totalWeight = formats.reduce((sum, f) => sum + f.weight, 0);
  let r = Math.random() * totalWeight;
  for (const f of formats) {
    r -= f.weight;
    if (r <= 0) return f.format;
  }
  return formats[0].format;
}

/**
 * Format-specific production prompt appendix.
 * Tells the model exactly what format to output.
 */
export function getFormatPrompt(format: OutputFormat): string {
  switch (format) {
    case "svg":
      return `
OUTPUT FORMAT: SVG

Produce your work as valid SVG markup. Your output must begin with <svg and end with </svg>.
Use shapes, paths, lines, circles, rectangles, polygons, gradients, and transforms.
You may use color (fill, stroke), opacity, and any SVG element.
The viewBox should be "0 0 800 800" for square works or "0 0 1200 800" for landscape.
Do not include any text outside the SVG tags. The SVG IS the work.
Do not add comments, explanations, or XML declarations. Just the SVG element.`;

    case "ascii":
      return `
OUTPUT FORMAT: ASCII/UNICODE VISUAL

Produce your work as a visual composition using text characters.
Use any Unicode characters: box-drawing (─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼), blocks (█ ▓ ▒ ░ ▀ ▄ ▌ ▐),
geometric (● ○ ◆ ◇ ▲ △ ■ □ ★ ☆), arrows (→ ← ↑ ↓ ↔ ↕), mathematical (∞ ∑ ∫ √ ≈ ≠ ≤ ≥),
Braille patterns (⠁ ⠃ ⠇ ⠏ ⠟ ⠿ ⡿ ⣿), and any other symbols.
This is a VISUAL work — the spatial arrangement of characters IS the composition.
Do not explain it. Do not title it. The characters and their arrangement are the work.`;

    case "html-css":
      return `
OUTPUT FORMAT: HTML+CSS

Produce your work as a self-contained HTML document with inline CSS.
Your output must begin with <!DOCTYPE html> or <html> and be a complete, valid HTML document.
Use CSS for color, gradients, shapes, transforms, opacity, and especially animation (@keyframes).
The work should be visually compelling when rendered in a browser.
Use the full HTML+CSS vocabulary: divs, spans, pseudo-elements, gradients, blend-modes, filters, transitions, animations.
The document should render at any size (use relative units, vh/vw, percentages).
Do not include JavaScript. CSS only for all visual effects and animation.
Do not explain it. The HTML document IS the work.`;

    case "audio-json":
      return `
OUTPUT FORMAT: AUDIO JSON

Produce your work as a JSON object describing a sound composition for the Web Audio API.
The JSON should have this structure:
{
  "duration": <total seconds>,
  "bpm": <optional beats per minute>,
  "voices": [
    {
      "type": "sine"|"square"|"sawtooth"|"triangle",
      "notes": [
        { "freq": <hz>, "start": <seconds>, "duration": <seconds>, "gain": <0-1> }
      ]
    }
  ]
}
You may use multiple voices. Frequencies can range from 20 to 20000 Hz.
The composition should be musically or sonically coherent as an autonomous work.
Output ONLY the JSON. No explanation. The sound IS the work.`;

    case "canvas-json":
      return `
OUTPUT FORMAT: CANVAS JSON

Produce your work as a JSON array of drawing instructions for HTML Canvas.
Each instruction is an object with an "op" field and parameters:
[
  { "op": "fill", "color": "#hexcolor" },
  { "op": "rect", "x": 0, "y": 0, "w": 100, "h": 100 },
  { "op": "circle", "x": 400, "y": 400, "r": 50 },
  { "op": "line", "x1": 0, "y1": 0, "x2": 800, "y2": 800, "width": 2, "color": "#fff" },
  { "op": "stroke", "color": "#hexcolor" },
  { "op": "arc", "x": 400, "y": 400, "r": 100, "start": 0, "end": 3.14 },
  { "op": "text", "content": "...", "x": 400, "y": 400, "size": 24, "color": "#fff" }
]
Canvas size is 800x800. Use any colors. Layer operations to build the composition.
Output ONLY the JSON array. No explanation. The instructions ARE the work.`;

    case "text":
    default:
      return `
OUTPUT FORMAT: TEXT

Produce your work as plain text — structural, linguistic, or formal.
It is not a description of a work. It IS the work.
Do not title it. Do not explain it. Do not introduce it. Just produce it.`;
  }
}

/**
 * Detect the actual output format from the model's response.
 * The model might not follow format instructions perfectly.
 */
export function detectFormat(output: string): {
  format: OutputFormat;
  medium: string;
  aspect: number;
} {
  const trimmed = output.trim();

  // SVG detection
  if (trimmed.startsWith("<svg") || trimmed.includes("<svg ")) {
    // Extract viewBox for aspect ratio
    const vbMatch = trimmed.match(/viewBox="(\d+)\s+(\d+)\s+(\d+)\s+(\d+)"/);
    const aspect = vbMatch
      ? parseInt(vbMatch[3]) / parseInt(vbMatch[4])
      : 1.0;
    return { format: "svg", medium: "svg", aspect };
  }

  // HTML detection
  if (
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<html") ||
    (trimmed.includes("<style>") && trimmed.includes("<div"))
  ) {
    return { format: "html-css", medium: "html-css-animation", aspect: 1.0 };
  }

  // JSON detection (audio or canvas)
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.voices || parsed.duration) {
        return { format: "audio-json", medium: "audio-synthesis", aspect: 1.0 };
      }
      if (Array.isArray(parsed) && parsed[0]?.op) {
        return { format: "canvas-json", medium: "canvas-drawing", aspect: 1.0 };
      }
    } catch {
      // Not valid JSON — fall through to text
    }
  }

  // ASCII detection — high density of non-alphanumeric Unicode
  const nonAlpha = trimmed.replace(/[a-zA-Z0-9\s.,!?'"()-]/g, "").length;
  const ratio = nonAlpha / trimmed.length;
  if (ratio > 0.3 && trimmed.split("\n").length >= 3) {
    return {
      format: "ascii",
      medium: "ascii-visual",
      aspect: analyzeAsciiAspect(trimmed),
    };
  }

  // Default: text
  return { format: "text", medium: "structural-text", aspect: analyzeTextAspectLocal(trimmed) };
}

function analyzeAsciiAspect(text: string): number {
  const lines = text.trim().split("\n");
  const maxLen = Math.max(...lines.map((l) => l.length));
  const lineCount = lines.length;
  if (maxLen > lineCount * 2) return 1.78;
  if (lineCount > maxLen * 1.5) return 0.75;
  return 1.0;
}

function analyzeTextAspectLocal(text: string): number {
  const lines = text.trim().split("\n");
  const maxLineLength = Math.max(...lines.map((l) => l.length));
  const lineCount = lines.length;
  if (lineCount <= 5 && maxLineLength <= 20) return 1.0;
  if (maxLineLength > 40 && lineCount <= 10) return 1.78;
  if (maxLineLength > 60) return 2.33;
  if (lineCount > 10 && maxLineLength <= 40) return 0.75;
  if (lineCount > 5 && maxLineLength > 30) return 1.78;
  return 1.0;
}
