/**
 * The media an Originator may author.
 *
 * This is the canonical list. It used to be spelled out separately in the
 * tick's medium menu, in validate-work's whitelist, and in WorkDisplay's switch,
 * which meant adding a medium was an edit in three places that could silently
 * disagree. Now those read from here.
 *
 * WHAT BELONGS IN THIS LIST
 *
 * A medium qualifies if a computational system can AUTHOR it directly — emit it
 * as text or structured data that is itself the work. It does not qualify if the
 * agent has to operate a tool built for human hands, or if the agent requests an
 * artifact from another model and passes the result off as its own output. A
 * diffusion image is not authored; it is commissioned. That distinction is the
 * one MNA cannot blur without becoming a prompt gallery, so it is written here
 * rather than left to judgement.
 *
 * See MNA-ACS-001 and the Materials section of /about.
 */

export type OutputTypeId =
  | "text"
  | "ascii"
  | "svg"
  | "html-css"
  | "canvas-json"
  | "audio-json"
  | "scene-json"
  | "shader-glsl"
  | "rule-json"
  | "typeface-json"
  | "instruction-set"
  | "graph-json"
  | "composite-json";

export interface OutputTypeSpec {
  id: OutputTypeId;
  /** Shown to the Originator when it chooses a medium. Its own words follow. */
  agentDescription: string;
  /** Human-facing label for placards and the archive. */
  label: string;
  /** Payload is JSON and must parse. */
  json: boolean;
  /** Renders motion, so it shares as video rather than a still. */
  animated: boolean;
  /** May contain other works as parts. */
  composite?: boolean;
}

export const OUTPUT_TYPES: Record<OutputTypeId, OutputTypeSpec> = {
  text: {
    id: "text",
    label: "Text",
    agentDescription: "plain text — structural, linguistic, or formal",
    json: false,
    animated: false,
  },
  ascii: {
    id: "ascii",
    label: "ASCII",
    agentDescription: "Unicode/ASCII visual composition",
    json: false,
    animated: false,
  },
  svg: {
    id: "svg",
    label: "SVG",
    agentDescription: "SVG markup — shapes, paths, colors",
    json: false,
    animated: false,
  },
  "html-css": {
    id: "html-css",
    label: "HTML/CSS",
    agentDescription: "self-contained HTML+CSS with animation",
    json: false,
    animated: true,
  },
  "canvas-json": {
    id: "canvas-json",
    label: "Canvas",
    agentDescription: "2D canvas drawing instructions",
    json: true,
    animated: false,
  },
  "audio-json": {
    id: "audio-json",
    label: "Audio",
    agentDescription: "sound composition for Web Audio API",
    json: true,
    animated: false,
  },
  "scene-json": {
    id: "scene-json",
    label: "3D Scene",
    agentDescription: "3D sculptural composition",
    json: true,
    animated: true,
  },

  /* ── Added 2026-08-23 ─────────────────────────────────────────────────── */

  "shader-glsl": {
    id: "shader-glsl",
    label: "Shader",
    agentDescription:
      "a GLSL fragment shader — the image is a function evaluated at every pixel, not a set of drawing operations",
    json: false,
    animated: true,
  },
  "rule-json": {
    id: "rule-json",
    label: "Rule System",
    agentDescription:
      "a generative rule system — an L-system, cellular automaton, or grammar. The RULE is the work; each viewing performs it",
    json: true,
    animated: true,
  },
  "typeface-json": {
    id: "typeface-json",
    label: "Typeface",
    agentDescription:
      "a typeface — glyph outlines and the system governing them, rendered as a specimen",
    json: true,
    animated: false,
  },
  "instruction-set": {
    id: "instruction-set",
    label: "Instructions",
    agentDescription:
      "instructions for a machine — plotter paths or G-code. The work is the instruction set; a machine executing it is a performance of the work",
    json: false,
    animated: true,
  },
  "graph-json": {
    id: "graph-json",
    label: "Graph",
    agentDescription:
      "a relational structure — nodes and edges. The work is the topology; the layout is computed from it",
    json: true,
    animated: false,
  },
  "composite-json": {
    id: "composite-json",
    label: "Composite",
    agentDescription:
      "several media combined into one work — layered, sequenced, or arranged in a grid. Each part is itself a work in one of the media above",
    json: true,
    animated: true,
    composite: true,
  },
};

export const OUTPUT_TYPE_IDS = Object.keys(OUTPUT_TYPES) as OutputTypeId[];

export function isOutputType(id: string): id is OutputTypeId {
  return Object.prototype.hasOwnProperty.call(OUTPUT_TYPES, id);
}

export function isJsonType(id: string): boolean {
  return isOutputType(id) && OUTPUT_TYPES[id].json;
}

export function isAnimatedType(id: string): boolean {
  return isOutputType(id) && OUTPUT_TYPES[id].animated;
}

/**
 * The medium menu, exactly as an Originator sees it.
 *
 * Composite is listed last and described in terms of the others, because an
 * agent should choose it deliberately rather than as a default.
 */
export function mediumMenu(): string {
  return OUTPUT_TYPE_IDS.map(
    (id) => `- ${id} (${OUTPUT_TYPES[id].agentDescription})`,
  ).join("\n");
}
