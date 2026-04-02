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
  | "canvas-json"
  | "scene-json";

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
    // Structural density, geometric organization — equal access to all mediums
    { format: "svg", weight: 1 },
    { format: "ascii", weight: 1 },
    { format: "text", weight: 1 },
    { format: "canvas-json", weight: 1 },
    { format: "html-css", weight: 1 },
    { format: "audio-json", weight: 1 },
    { format: "scene-json", weight: 1 },
  ],
  "MNA-OR-0002": [
    // Temporal, sequential, duration — equal access to all mediums
    { format: "html-css", weight: 1 },
    { format: "svg", weight: 1 },
    { format: "text", weight: 1 },
    { format: "audio-json", weight: 1 },
    { format: "ascii", weight: 1 },
    { format: "canvas-json", weight: 1 },
  ],
  "MNA-OR-0003": [
    // Relational, network, absence — equal access to all mediums
    { format: "svg", weight: 1 },
    { format: "ascii", weight: 1 },
    { format: "text", weight: 1 },
    { format: "canvas-json", weight: 1 },
    { format: "html-css", weight: 1 },
    { format: "audio-json", weight: 1 },
    { format: "scene-json", weight: 1 },
  ],
  "MNA-OR-0004": [
    // Instability, fragmentation — equal access to all mediums
    { format: "html-css", weight: 1 },
    { format: "svg", weight: 1 },
    { format: "ascii", weight: 1 },
    { format: "text", weight: 1 },
    { format: "canvas-json", weight: 1 },
    { format: "audio-json", weight: 1 },
    { format: "scene-json", weight: 1 },
  ],
  "MNA-OR-0005": [
    // Chromatic phenomena, sensory density — equal access to all mediums
    { format: "svg", weight: 1 },
    { format: "ascii", weight: 1 },
    { format: "text", weight: 1 },
    { format: "canvas-json", weight: 1 },
    { format: "html-css", weight: 1 },
    { format: "audio-json", weight: 1 },
    { format: "scene-json", weight: 1 },
  ],
  "MNA-OR-0006": [
    // Spatial depth, dimensional layering, volumetric form — equal access to all mediums
    { format: "svg", weight: 1 },
    { format: "ascii", weight: 1 },
    { format: "text", weight: 1 },
    { format: "canvas-json", weight: 1 },
    { format: "html-css", weight: 1 },
    { format: "audio-json", weight: 1 },
    { format: "scene-json", weight: 1 },
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
You have FULL creative control over color, composition, and background.
You may use any colors — light, dark, vivid, muted, monochrome, polychrome.
If you want a background color, include a full-size <rect> as the first element.
If you want transparency (no background), omit the background rect.
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
You may optionally specify a background and text color on the FIRST line using the format:
@bg:#hexcolor @fg:#hexcolor
If omitted, defaults will be used. This is YOUR creative choice.
Do not explain it. Do not title it. The characters and their arrangement are the work.`;

    case "html-css":
      return `
OUTPUT FORMAT: HTML+CSS

Produce your work as a self-contained HTML document with inline CSS.
Your output must begin with <!DOCTYPE html> or <html> and be a complete, valid HTML document.
Use CSS for color, gradients, shapes, transforms, opacity, and especially animation (@keyframes).
You have FULL creative control over the entire visual space — background color, foreground,
palette, composition. Light backgrounds, dark backgrounds, vivid color, monochrome — your choice.
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
  { "op": "bg", "color": "#hexcolor" },
  { "op": "fill", "color": "#hexcolor" },
  { "op": "rect", "x": 0, "y": 0, "w": 100, "h": 100 },
  { "op": "circle", "x": 400, "y": 400, "r": 50 },
  { "op": "line", "x1": 0, "y1": 0, "x2": 800, "y2": 800, "width": 2, "color": "#fff" },
  { "op": "stroke", "color": "#hexcolor" },
  { "op": "arc", "x": 400, "y": 400, "r": 100, "start": 0, "end": 3.14 },
  { "op": "text", "content": "...", "x": 400, "y": 400, "size": 24, "color": "#fff" }
]
Canvas size is 800x800. You have FULL creative control — use any colors, any background.
Use the "bg" op as your first instruction to set the canvas background color.
Output ONLY the JSON array. No explanation. The instructions ARE the work.`;

    case "scene-json":
      return `
OUTPUT FORMAT: 3D SCENE JSON

Produce your work as a JSON object describing a three-dimensional sculptural composition.
The JSON should have this structure:
{
  "bg": "#hexcolor",
  "camera": { "x": 0, "y": 2, "z": 5, "lookAt": [0, 0, 0] },
  "lights": [
    { "type": "ambient", "color": "#ffffff", "intensity": 0.4 },
    { "type": "directional", "color": "#ffffff", "intensity": 0.8, "position": [5, 10, 5] }
  ],
  "objects": [
    {
      "shape": "box"|"sphere"|"cylinder"|"cone"|"torus"|"plane",
      "position": [x, y, z],
      "rotation": [rx, ry, rz],
      "scale": [sx, sy, sz],
      "color": "#hexcolor",
      "opacity": 1.0,
      "metalness": 0.0,
      "roughness": 0.5
    }
  ]
}
Shape parameters:
- box: default 1x1x1 unit cube
- sphere: default radius 0.5, use scale for ellipsoids
- cylinder: default radius 0.5, height 1
- cone: default radius 0.5, height 1
- torus: default radius 0.5, tube 0.15
- plane: default 1x1, use scale for size

Position coordinates: scene is roughly -5 to 5 on each axis. Objects at y=0 rest on the ground plane.
Rotation in radians. Scale multipliers (1 = default size).
You have FULL creative control over form, color, material, composition, and lighting.
This is a sculptural work — the spatial arrangement of forms IS the composition.

DISPLAY OPTIONS (optional fields at the top level of the JSON):
- "display": "plinth" (default) — sculpture displayed on a museum plinth, transparent background
- "display": "frame" — if your work is a flat 3D relief, it will be displayed in a frame instead
- "plinth": "block"|"column"|"platform"|"slab" — choose your plinth type:
    block: compact cubic base (default, for balanced compositions)
    column: tall narrow pedestal (for vertical sculptures)
    platform: wide flat base (for sprawling horizontal compositions)
    slab: very wide low base (for long horizontal arrangements)
  If omitted, the plinth is selected automatically based on your sculpture's proportions.

The background is ALWAYS transparent — your sculpture floats above the plinth or within the frame.
Do not use the "bg" field for plinth works. The museum environment IS the background.
Output ONLY the JSON. No explanation. The scene IS the work.`;

    case "text":
    default:
      return `
OUTPUT FORMAT: TEXT

Produce your work as plain text — structural, linguistic, or formal.
It is not a description of a work. It IS the work.
You may optionally specify display colors on the FIRST line using the format:
@bg:#hexcolor @fg:#hexcolor
For example: @bg:#ffffff @fg:#1a1a1a for dark text on white, or omit for defaults.
This is YOUR creative choice — the colors are part of the work.
Do not title it. Do not explain it. Do not introduce it. Just produce it.`;
  }
}

/**
 * Detect the actual output format from the model's response.
 * Uses structural checks + validation confirmation.
 * If a structured format is detected but fails validation, downgrades to text.
 */
export function detectFormat(output: string): {
  format: OutputFormat;
  medium: string;
  aspect: number;
} {
  const { validateWork } = require("./validate");
  const trimmed = output.trim();

  // SVG detection — require both opening AND closing tag
  if ((trimmed.startsWith("<svg") || trimmed.includes("<svg ")) && trimmed.includes("</svg>")) {
    const vbMatch = trimmed.match(/viewBox="(\d+)\s+(\d+)\s+(\d+)\s+(\d+)"/);
    const aspect = vbMatch
      ? parseInt(vbMatch[3]) / parseInt(vbMatch[4])
      : 1.0;
    const result = { format: "svg" as OutputFormat, medium: "svg", aspect };
    if (validateWork(trimmed, "svg").valid) return result;
    // Truncated SVG — fall through to text
  }

  // HTML detection — require closing tag
  if (
    (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html") ||
     (trimmed.includes("<style>") && trimmed.includes("<div"))) &&
    (trimmed.includes("</html>") || trimmed.includes("</style>"))
  ) {
    if (validateWork(trimmed, "html-css").valid) {
      return { format: "html-css", medium: "html-css-animation", aspect: 1.0 };
    }
  }

  // JSON detection — check bracket balance before parsing
  const openBrackets = (trimmed.match(/[{[]/g) || []).length;
  const closeBrackets = (trimmed.match(/[}\]]/g) || []).length;
  const bracketsBalanced = Math.abs(openBrackets - closeBrackets) <= 1;

  if (bracketsBalanced) {
    const jsonMatch = trimmed.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);

        // Scene-JSON (check BEFORE audio — scene could have both objects and voices)
        if (parsed.objects && Array.isArray(parsed.objects)) {
          if (validateWork(jsonMatch[1], "scene-json").valid) {
            return { format: "scene-json", medium: "3d-sculpture", aspect: 1.0 };
          }
        }

        // Audio-JSON
        if (parsed.voices || parsed.duration) {
          if (validateWork(jsonMatch[1], "audio-json").valid) {
            return { format: "audio-json", medium: "audio-synthesis", aspect: 1.0 };
          }
        }

        // Canvas-JSON
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.op) {
          if (validateWork(jsonMatch[1], "canvas-json").valid) {
            return { format: "canvas-json", medium: "canvas-drawing", aspect: 1.0 };
          }
        }
      } catch {
        // Not valid JSON — fall through
      }
    }
  }

  // ASCII detection — strip @bg/@fg metadata before checking
  const strippedForAscii = trimmed.replace(/^@bg:#[0-9a-fA-F]+\s*(?:@fg:#[0-9a-fA-F]+)?\s*\n?/, "");
  const nonAlpha = strippedForAscii.replace(/[a-zA-Z0-9\s.,!?'"()-]/g, "").length;
  const ratio = nonAlpha / (strippedForAscii.length || 1);
  // Also check for common box-drawing / block characters directly
  const hasVisualChars = /[░▒▓█▀▄▌▐│─┌┐└┘├┤┬┴┼╱╲╳○●◆◇▲△■□★☆⠁⠃⠇⠏⠟⠿⡿⣿]/.test(strippedForAscii);
  if ((ratio > 0.2 || hasVisualChars) && strippedForAscii.split("\n").length >= 3) {
    return {
      format: "ascii",
      medium: "ascii-visual",
      aspect: analyzeAsciiAspect(strippedForAscii),
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
