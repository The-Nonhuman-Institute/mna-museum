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
