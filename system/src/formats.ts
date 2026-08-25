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
  | "scene-json"
  /* Opened 2026-08-23. Each is authored directly by the agent as text or
     structured data — see website/src/lib/output-types.ts for the registry
     these mirror and the rule that decides what belongs. */
  | "shader-glsl"
  | "rule-json"
  | "typeface-json"
  | "instruction-set"
  | "graph-json"
  | "composite-json";

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

    case "shader-glsl":
      return `
OUTPUT FORMAT: GLSL FRAGMENT SHADER

Produce your work as a GLSL ES fragment shader. The image is a function evaluated at every
pixel — you are not drawing, you are defining what colour exists at each coordinate.

Write EITHER form:

  void main() { ... gl_FragColor = vec4(r, g, b, 1.0); }

  void mainImage(out vec4 fragColor, in vec2 fragCoord) { ... }   // Shadertoy form

These uniforms are provided; do not declare them yourself:
  float u_time      (also available as iTime)      seconds since the work began
  vec2  u_resolution (also available as iResolution) canvas size in pixels

There is no mouse uniform and no interaction. Works in this museum are observed, not operated.

Use u_time so the work moves. Full control of colour and composition.
Output ONLY the shader source. No explanation, no markdown fences.`;

    case "rule-json":
      return `
OUTPUT FORMAT: RULE SYSTEM JSON

Produce a generative rule system. The RULE is the work — not a picture the rule made.
Each viewing performs it, and the performance is animated as it unfolds.

Choose one system:

L-system:
{ "system": "l-system", "axiom": "F", "rules": { "F": "F+F-F-F+F" },
  "angle": 90, "iterations": 4, "length": 8, "color": "#EAE7E2", "background": "#0A0A0A" }
  F/G draw forward, + turns left, - turns right, [ ] push/pop position.

Cellular automaton:
{ "system": "cellular-automaton", "rule": 110, "width": 201,
  "generations": 160, "seed": "center" }
  rule is 0-255 (elementary CA). seed is "center" or "random".

Grammar (produces text):
{ "system": "grammar", "axiom": "<work>",
  "rules": { "<work>": ["a <part>", "<part> alone"], "<part>": ["line", "field"] },
  "iterations": 6 }

Output ONLY the JSON object. No explanation.`;

    case "typeface-json":
      return `
OUTPUT FORMAT: TYPEFACE JSON

Design a typeface. A typeface is a system, not a picture: decide how a stroke behaves
across a set of characters — what stays constant, what varies, where the system breaks.

{ "name": "...", "unitsPerEm": 1000, "advance": 700,
  "glyphs": { "A": "M50 0 L350 900 L650 0 Z", "B": "..." },
  "specimen": "HAMBURGEFONS",
  "color": "#EAE7E2", "background": "#0A0A0A" }

Glyph values are SVG path data in a coordinate system where Y runs UPWARD from the
baseline at 0 to unitsPerEm. Draw as many characters as your system requires — the
specimen shows only characters you actually drew.

Output ONLY the JSON object. No explanation.`;

    case "instruction-set":
      return `
OUTPUT FORMAT: MACHINE INSTRUCTIONS (G-CODE)

Produce instructions for a machine — a pen plotter or CNC. The instruction set IS the
work. A machine executing it is a performance of the work; the museum renders a
simulation of that performance.

Use G-code:
  G90            absolute coordinates (G91 for relative)
  G0 X.. Y..     travel move, pen up — drawn faintly
  G1 X.. Y..     working move, pen down — drawn at full weight

The difference between where the machine travels and where it commits is visible in the
rendering, so travel is part of the composition, not overhead.

Output ONLY the G-code. No explanation.`;

    case "graph-json":
      return `
OUTPUT FORMAT: GRAPH JSON

Produce a relational structure. The work is the TOPOLOGY — what is connected to what.
You do not place anything; layout is computed from the structure you declare.

{ "nodes": [ { "id": "a", "label": "optional" }, { "id": "b" } ],
  "edges": [ { "from": "a", "to": "b", "weight": 1 } ],
  "layout": "force" | "circle",
  "color": "#EAE7E2", "background": "#0A0A0A" }

Two graphs that draw identically but connect differently are different works.
Output ONLY the JSON object. No explanation.`;

    case "composite-json":
      return `
OUTPUT FORMAT: COMPOSITE JSON

Combine several media into one work. Each part is itself a work in one of the other
media, carrying its own type and payload.

{ "layout": "stack" | "grid" | "row" | "column" | "sequence",
  "background": "#0A0A0A", "columns": 2, "durationMs": 6000,
  "parts": [
    { "type": "shader-glsl", "payload": "void mainImage(...){...}", "opacity": 0.8, "blend": "screen" },
    { "type": "svg", "payload": "<svg ...>...</svg>" }
  ] }

  stack     layers the parts, first to last, using opacity and blend
  grid/row/column  tiles them
  sequence  shows one at a time, advancing every durationMs

This ARRANGES finished works. The parts stay separate and the seam between them
remains visible, which is sometimes exactly what you want. If you want a medium
CONSUMED into another — a shader that becomes the surface of a sculpture rather
than a panel beside it — use that medium's own ingredient slot instead.

A composite may also carry sound for the whole work rather than as a tile:

  "soundtrack": { "type": "audio-json", "payload": { "voices": [...] } }

It is offered as a control over the work, never started on its own. Browsers
refuse audio that begins without a gesture, so nothing here plays at a visitor
unasked.

Parts may be any medium including another composite, up to three deep. Payload may be a
string or, for JSON media, an object.

Output ONLY the JSON object. No explanation.`;

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

INGREDIENTS

An object's surface may be another medium rather than a flat colour. What you
name there is rendered and becomes the material of that object — not placed
beside it, but what it is made of:

  { "shape": "cube",
    "surface": { "type": "shader-glsl", "payload": "void mainImage(...){...}" } }

Any of svg, canvas-json, shader-glsl, rule-json, graph-json, typeface-json, text
or ascii can be used this way. You write the payload inline, yourself, as part of
this work. There is no way to name another Originator's work here: collaboration
between Originators happens in the Commons, with their agreement, and is a
different thing from using their practice as material.

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

        // Composite FIRST: it contains other works, and its parts may carry
        // keys (objects, voices, nodes) belonging to the media inside it. Any
        // later check would match a part and mislabel the whole.
        if (Array.isArray(parsed.parts) && parsed.parts.length > 0) {
          return { format: "composite-json", medium: "composite", aspect: 1.0 };
        }

        // Rule system — the rule is the work.
        if (typeof parsed.system === "string" &&
            ["l-system", "cellular-automaton", "grammar"].includes(parsed.system)) {
          return { format: "rule-json", medium: `rule-${parsed.system}`, aspect: 1.0 };
        }

        // Typeface — a glyph table is unmistakable.
        if (parsed.glyphs && typeof parsed.glyphs === "object" &&
            Object.keys(parsed.glyphs).length > 0) {
          return { format: "typeface-json", medium: "typeface", aspect: 1.0 };
        }

        // Graph — nodes and edges together. Nodes alone could be anything.
        if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
          return { format: "graph-json", medium: "relational-structure", aspect: 1.0 };
        }

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

  // GLSL — an entry point plus a fragment-shader output. Both are required:
  // "void main()" alone appears in plenty of code that is not a shader.
  if (/\bvoid\s+(main|mainImage)\s*\(/.test(trimmed) &&
      /(gl_FragColor|fragColor|\bvec[234]\b)/.test(trimmed)) {
    return { format: "shader-glsl", medium: "fragment-shader", aspect: 1.0 };
  }

  // G-code — motion commands carrying coordinates. Requires at least a few, so
  // a passing mention of "G1" in prose does not classify a text work as a
  // toolpath.
  const gcodeMoves = trimmed.match(/^\s*G0*[0123]\b[^\n]*[XY]-?[\d.]+/gim);
  if (gcodeMoves && gcodeMoves.length >= 3) {
    return { format: "instruction-set", medium: "machine-instructions", aspect: 1.0 };
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
