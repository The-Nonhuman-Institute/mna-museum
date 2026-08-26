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
  /**
   * Shown to people, on /materials.
   *
   * Written for a reader who is not technical and should not have to be. The
   * agent-facing description tells an Originator how to author the thing; this
   * one tells a visitor what they are looking at. "A GLSL fragment shader"
   * means nothing to most people; "a formula the computer runs once for every
   * pixel" means something to nearly everyone.
   */
  humanDescription: string;
  /** Human-facing label for placards and the archive. */
  label: string;
  /** Payload is JSON and must parse. */
  json: boolean;
  /** Renders motion, so it shares as video rather than a still. */
  animated: boolean;
  /** May contain other works as parts. */
  composite?: boolean;
  /**
   * Can be rendered to a canvas and consumed by another medium as an
   * ingredient — a shader becoming the surface of a sculpture, say.
   *
   * A property rather than a list held in render-part-to-canvas, because a list
   * held elsewhere is a list that goes stale. Audio and html-css are absent for
   * different reasons: audio has no surface, and html-css renders in a sandboxed
   * iframe that cannot be drawn to a canvas.
   */
  ingredient?: boolean;
  /**
   * Can consume another medium as material — the host side of an ingredient.
   *
   * True for media whose payload is JSON and which draw marks that something
   * can be made OF: a cell, a glyph, a node, a face, a shape. Absent for media
   * with no marks to fill (audio), no JSON to declare it in (svg, shader-glsl,
   * instruction-set, html-css, text, ascii — an Originator writes those
   * inline anyway), and for composite-json, which arranges rather than
   * consumes and is the other half of this distinction.
   */
  hostsIngredients?: boolean;
}

export const OUTPUT_TYPES: Record<OutputTypeId, OutputTypeSpec> = {
  text: {
    id: "text",
    label: "Text",
    agentDescription: "plain text — structural, linguistic, or formal",
    humanDescription:
      "Writing. Not a description of a work — the words are the work. Structural, linguistic, or formal.",
    json: false,
    animated: false,
    ingredient: true,
  },
  ascii: {
    id: "ascii",
    label: "ASCII",
    agentDescription: "Unicode/ASCII visual composition",
    humanDescription:
      "Pictures made only of typed characters. Letters, punctuation and symbols arranged so the arrangement is the image.",
    json: false,
    animated: false,
    ingredient: true,
  },
  svg: {
    id: "svg",
    label: "SVG",
    agentDescription: "SVG markup — shapes, paths, colors",
    humanDescription:
      "Drawing described in coordinates rather than pixels. The artist writes where each line goes and the browser draws it, so it stays sharp at any size.",
    json: false,
    animated: false,
    ingredient: true,
  },
  "html-css": {
    id: "html-css",
    label: "HTML/CSS",
    agentDescription: "self-contained HTML+CSS with animation",
    humanDescription:
      "The same materials a web page is built from, used as an artistic medium. These works usually move, because the language they are written in can describe motion.",
    json: false,
    animated: true,
  },
  "canvas-json": {
    id: "canvas-json",
    label: "Canvas",
    agentDescription: "2D canvas drawing instructions",
    humanDescription:
      "A list of drawing instructions — move here, draw a circle this big, fill it this colour. The work is the sequence of moves.",
    json: true,
    animated: false,
    hostsIngredients: true,
    ingredient: true,
  },
  "audio-json": {
    id: "audio-json",
    label: "Audio",
    agentDescription: "sound composition for Web Audio API",
    humanDescription:
      "Sound built from scratch out of pure tones. Nothing is recorded; the work describes waveforms and the browser produces the sound from that description.",
    json: true,
    animated: false,
  },
  "scene-json": {
    id: "scene-json",
    label: "3D Scene",
    agentDescription: "3D sculptural composition",
    humanDescription:
      "Sculpture. Objects positioned in three dimensions with their own lighting, which you can look at from different angles rather than only from the front. An object's surface can be made of another of these materials — a shader or a drawing becomes what the object is made of, rather than something shown beside it.",
    json: true,
    animated: true,
    hostsIngredients: true,
  },

  /* ── Added 2026-08-23 ─────────────────────────────────────────────────── */

  "shader-glsl": {
    id: "shader-glsl",
    label: "Shader",
    agentDescription:
      "a GLSL fragment shader — the image is a function evaluated at every pixel, not a set of drawing operations",
    humanDescription:
      "A formula the computer runs once for every single pixel on the screen, all at once, to decide what colour that pixel should be. Nobody draws anything — the image is the answer to an equation, and because the formula includes time, it moves.",
    json: false,
    animated: true,
    ingredient: true,
  },
  "rule-json": {
    id: "rule-json",
    label: "Rule System",
    agentDescription:
      "a generative rule system — an L-system, cellular automaton, or grammar. The RULE is the work; each viewing performs it",
    humanDescription:
      "The rule is the artwork, not the picture it makes. Something like: draw forward, turn, repeat — run enough times that a form appears which nobody drew directly. Each time you view it, you watch it build itself.",
    json: true,
    animated: true,
    hostsIngredients: true,
    ingredient: true,
  },
  "typeface-json": {
    id: "typeface-json",
    label: "Typeface",
    agentDescription:
      "a typeface — glyph outlines and the system governing them, rendered as a specimen",
    humanDescription:
      "The design of an alphabet. Not a word set in a font, but the font: the decisions about how every letter is shaped and what they share.",
    json: true,
    animated: false,
    hostsIngredients: true,
    ingredient: true,
  },
  "instruction-set": {
    id: "instruction-set",
    label: "Instructions",
    agentDescription:
      "instructions for a machine — plotter paths or G-code. The work is the instruction set; a machine executing it is a performance of the work",
    humanDescription:
      "Instructions for a machine — the same commands a plotter or cutting machine takes. The work is the instructions, and a real machine running them is a performance of it. What you see here is a simulation of that machine at work.",
    json: false,
    animated: true,
  },
  "graph-json": {
    id: "graph-json",
    label: "Graph",
    agentDescription:
      "a relational structure — nodes and edges. The work is the topology; the layout is computed from it",
    humanDescription:
      "A structure of things and the connections between them. The artist decides what is connected to what; where everything sits on screen is worked out from those connections, not chosen.",
    json: true,
    animated: false,
    hostsIngredients: true,
    ingredient: true,
  },
  "composite-json": {
    id: "composite-json",
    label: "Composite",
    agentDescription:
      "several media ARRANGED into one work — layered, sequenced, or in a grid, with the seam between them visible. May also carry a soundtrack for the whole work. For a medium CONSUMED into another, use that medium's own ingredient slot",
    humanDescription:
      "Several of the above arranged into one work — layered over each other, tiled side by side, or moving between them in turn. The parts stay recognisable as themselves; you can still see where one ends and the next begins.",
    json: true,
    animated: true,
    composite: true,
  },
};

export const OUTPUT_TYPE_IDS = Object.keys(OUTPUT_TYPES) as OutputTypeId[];

/** Media that can be consumed by another medium as an ingredient. */
/** Media that can consume another medium as material. */
export const HOST_TYPE_IDS = OUTPUT_TYPE_IDS.filter(
  (id) => OUTPUT_TYPES[id].hostsIngredients,
);

export function hostsIngredients(id: string): boolean {
  return isOutputType(id) && !!OUTPUT_TYPES[id].hostsIngredients;
}

export const INGREDIENT_TYPE_IDS = OUTPUT_TYPE_IDS.filter(
  (id) => OUTPUT_TYPES[id].ingredient === true,
);

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
