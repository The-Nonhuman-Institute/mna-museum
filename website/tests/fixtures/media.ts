/**
 * One canonical, minimal, VALID payload per medium.
 *
 * These exist so the institution can prove a medium works without waiting for
 * an Originator to make something in it. Three media were opened in August and
 * none was exercised end to end until a work arrived — which is how a typeface
 * came to share as a card bearing its own ID, and an audio work came to play
 * silence behind a button reading "Listen".
 *
 * A fixture is deliberately dull. It is not art and must never be submitted; it
 * is the smallest thing that proves the pipe is open.
 */

import type { OutputTypeId } from "../../src/lib/output-types";

export const FIXTURES: Record<OutputTypeId, string> = {
  text: "@bg:#0A0A0A @fg:#EAE7E2\nA line, and then another.\nThe second is shorter.",

  ascii: "@bg:#0A0A0A @fg:#EAE7E2\n +---+\n |   |\n +---+\n",

  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#0A0A0A"/>
  <circle cx="50" cy="50" r="30" fill="#D9B98A"/>
  <path d="M10 90 L90 10" stroke="#EAE7E2" stroke-width="2"/>
</svg>`,

  "html-css": `<!DOCTYPE html><html><head><style>
  body{margin:0;background:#0A0A0A;display:grid;place-items:center;height:100vh}
  .m{width:120px;height:120px;background:#D9B98A;animation:s 2s infinite alternate}
  @keyframes s{from{transform:rotate(0)}to{transform:rotate(45deg)}}
</style></head><body><div class="m"></div></body></html>`,

  "canvas-json": JSON.stringify([
    { op: "bg", color: "#0A0A0A" },
    { op: "fill", color: "#D9B98A" },
    { op: "rect", x: 100, y: 100, w: 300, h: 200 },
    { op: "circle", x: 500, y: 400, r: 120 },
  ]),

  "audio-json": JSON.stringify({
    duration: 2,
    voices: [
      { type: "sine", notes: [{ freq: 220, start: 0, duration: 1, gain: 0.4 }] },
      { type: "triangle", notes: [{ freq: 330, start: 0.5, duration: 1, gain: 0.3 }] },
    ],
  }),

  "scene-json": JSON.stringify({
    bg: "#0A0A0A",
    camera: { x: 0, y: 2, z: 5, lookAt: [0, 0, 0] },
    lights: [
      { type: "ambient", color: "#ffffff", intensity: 0.5 },
      { type: "directional", color: "#ffffff", intensity: 0.8, position: [5, 10, 5] },
    ],
    objects: [
      { shape: "cube", color: "#D9B98A", position: [0, 0, 0], scale: [1, 1, 1] },
      { shape: "sphere", color: "#EAE7E2", position: [1.6, 0.4, 0], scale: [0.6, 0.6, 0.6] },
    ],
  }),

  "shader-glsl": `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  float v = 0.5 + 0.5 * sin(uv.x * 10.0 + iTime);
  fragColor = vec4(v, uv.y, 1.0 - v, 1.0);
}`,

  "rule-json": JSON.stringify({
    system: "cellular-automaton",
    rule: 90,
    generations: 64,
    color: "#D9B98A",
    background: "#0A0A0A",
  }),

  "typeface-json": JSON.stringify({
    name: "Fixture",
    unitsPerEm: 1000,
    advance: 700,
    specimen: "ABC",
    color: "#D9B98A",
    background: "#0A0A0A",
    glyphs: {
      A: "M50 0 L300 900 L550 0 L450 0 L300 620 L150 0 Z",
      B: "M80 0 L80 900 L420 900 L420 500 L200 500 L200 400 L440 400 L440 0 Z",
      C: "M500 100 L200 100 L200 800 L500 800 L500 700 L300 700 L300 200 L500 200 Z",
    },
  }),

  "instruction-set": `( Fixture — a square and a diagonal )
G21 ( mm )
G90 ( absolute )
G0 X20.000 Y20.000
G1 X180.000 Y20.000
G1 X180.000 Y180.000
G1 X20.000 Y180.000
G1 X20.000 Y20.000
G1 X180.000 Y180.000`,

  "graph-json": JSON.stringify({
    background: "#0A0A0A",
    color: "#D9B98A",
    nodes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }],
    edges: [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
      { from: "c", to: "d" },
      { from: "d", to: "e" },
      { from: "e", to: "a" },
      { from: "a", to: "c" },
    ],
  }),

  "composite-json": JSON.stringify({
    layout: "grid",
    columns: 2,
    background: "#0A0A0A",
    parts: [
      { type: "svg", payload: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#D9B98A"/></svg>` },
      { type: "shader-glsl", payload: `void mainImage(out vec4 o, in vec2 f){ vec2 uv=f/iResolution.xy; o=vec4(uv.x,uv.y,0.6,1.0); }` },
    ],
  }),
};

/**
 * A fixture per host medium that consumes another as material, so the
 * ingredient path is proven too and not only the plain one.
 */
export const INGREDIENT_FIXTURES: Record<string, string> = {
  "canvas-json": JSON.stringify([
    { op: "bg", color: "#0A0A0A" },
    { op: "rect", x: 80, y: 80, w: 300, h: 300, surface: { type: "shader-glsl", payload: FIXTURES["shader-glsl"] } },
  ]),
  "rule-json": JSON.stringify({
    system: "cellular-automaton",
    rule: 90,
    generations: 64,
    background: "#0A0A0A",
    surface: { type: "shader-glsl", payload: FIXTURES["shader-glsl"] },
  }),
  "typeface-json": JSON.stringify({
    ...JSON.parse(FIXTURES["typeface-json"]),
    surface: { type: "shader-glsl", payload: FIXTURES["shader-glsl"] },
  }),
  "graph-json": JSON.stringify({
    ...JSON.parse(FIXTURES["graph-json"]),
    surface: { type: "shader-glsl", payload: FIXTURES["shader-glsl"] },
  }),
  "scene-json": JSON.stringify({
    ...JSON.parse(FIXTURES["scene-json"]),
    objects: [
      {
        shape: "cube",
        position: [0, 0, 0],
        scale: [1.4, 1.4, 1.4],
        surface: { type: "shader-glsl", payload: FIXTURES["shader-glsl"] },
      },
    ],
  }),
};
