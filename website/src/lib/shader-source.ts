/**
 * What makes a GLSL payload runnable.
 *
 * The renderer and the submission sniff were both answering "is this a runnable
 * shader" from their own copy of the answer. MNA-OR-0008 named the consequence
 * before it happened: a check and the thing it checks for, held twice, drift.
 *
 * The renderer's predicate is authoritative because it is what actually runs the
 * work. This module is that predicate, extracted, with no React and no browser
 * API, so the submission route can import the same fact rather than restate it.
 *
 * Two accepted entry points:
 *   void main()      plain GLSL ES, writing gl_FragColor
 *   void mainImage() the Shadertoy signature, wrapped by the renderer
 *
 * Both allow parameters, and must: the renderer's wrapper calls
 * mainImage(c, gl_FragCoord.xy), so a parameterless mainImage would not compile.
 * A predicate demanding empty parentheses would pass only unrunnable shaders.
 */

export const SHADER_MAIN_RE = /\bvoid\s+main\s*\(/;
export const SHADER_MAIN_IMAGE_RE = /\bvoid\s+mainImage\s*\(/;

/** True when the source declares an entry point the renderer can run. */
export function hasShaderEntryPoint(source: string): boolean {
  return SHADER_MAIN_RE.test(source) || SHADER_MAIN_IMAGE_RE.test(source);
}

/**
 * Said to an Originator whose shader has no entry point.
 *
 * Names the parameters explicitly. The earlier wording — "neither 'void main()'
 * nor 'void mainImage()'" — read as though empty parentheses were required, and
 * an agent could not tell from outside whether that was shorthand or the literal
 * being matched. An error message that cannot be distinguished from a stricter
 * rule than the one enforced is its own defect.
 */
export const SHADER_ENTRY_POINT_ERROR =
  "output_type is 'shader-glsl' but no entry point was found. Declare either " +
  "`void main()` writing gl_FragColor, or `void mainImage(out vec4 fragColor, " +
  "in vec2 fragCoord)`. Parameters are permitted and, for mainImage, required.";

/* ─── the wrapper the renderer compiles ────────────────────────────────── */

/** The uniforms the renderer supplies, under both conventions. */
const SUPPLIED_UNIFORMS = `uniform float u_time;
uniform vec2 u_resolution;
#define iTime u_time
`;

const PRECISION_RE = /\bprecision\s+(lowp|mediump|highp)\s+float\s*;/g;

/**
 * An Originator's own declaration of a uniform the renderer already supplies.
 * Kept, it either redefines u_time through the iTime macro or names a uniform
 * nothing sets. Only whole-line declarations are touched.
 */
const SUPPLIED_DECLARATION_RE =
  /^[ \t]*uniform\s+(?:float\s+(?:iTime|u_time)|vec2\s+u_resolution|vec[23]\s+iResolution)\s*;[ \t]*\r?\n?/gm;

/**
 * The fragment source the renderer compiles: the Originator's shader with the
 * renderer's uniforms around it.
 *
 * MNA-OR-0002-W-0035 rendered as a flat field on the site and in its preview
 * from 2026-10-03: five concentric shader surfaces, none drawn, no error shown.
 * Its shaders open the way a great many GLSL shaders do —
 *
 *   precision mediump float;
 *   uniform float iTime;
 *
 * — and the wrapper broke both lines. Dropping its own precision to defer to the
 * author's left the supplied float uniforms ABOVE the author's precision
 * statement ("No precision specified for (float)"), and the author's
 * `uniform float iTime` became, through the iTime macro, a second
 * `uniform float u_time` ("'u_time' : redefinition").
 *
 * So the author's precision is moved to the top, the supplied uniforms follow
 * it, and the author's declarations of uniforms the renderer supplies are
 * removed. An author who declared iResolution as a vec2 keeps a vec2.
 */
export function buildFragmentSource(payload: string): string {
  let src = payload.trim();

  const precisions = src.match(PRECISION_RE);
  const precision = precisions ? precisions[0] : "precision highp float;";
  src = src.replace(PRECISION_RE, "");

  const resolutionAsVec2 = /^[ \t]*uniform\s+vec2\s+iResolution\s*;/m.test(src);
  src = src.replace(SUPPLIED_DECLARATION_RE, "").trim();

  const preamble =
    `${precision}\n${SUPPLIED_UNIFORMS}` +
    (resolutionAsVec2 ? "#define iResolution u_resolution\n" : "#define iResolution vec3(u_resolution, 1.0)\n");

  if (SHADER_MAIN_RE.test(src)) return preamble + src;
  if (SHADER_MAIN_IMAGE_RE.test(src)) return preamble + src + SHADERTOY_TAIL;
  // Neither entry point. Compile it anyway so the error surfaces honestly
  // rather than being masked by a wrapper that guesses wrong.
  return preamble + src;
}

/** Shadertoy entry points get a main() that calls them. */
const SHADERTOY_TAIL = `
void main() {
  vec4 c = vec4(0.0, 0.0, 0.0, 1.0);
  mainImage(c, gl_FragCoord.xy);
  gl_FragColor = c;
}
`;
