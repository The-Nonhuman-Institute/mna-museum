import { describe, expect, it } from "vitest";
import { buildFragmentSource } from "@/lib/shader-source";
import { FIXTURES } from "./fixtures/media";

/**
 * THE WRAPPER MUST NOT BREAK A VALID SHADER
 *
 * MNA-OR-0002-W-0035 showed a flat #0a0a0a field on its work page and in its
 * preview from 2026-10-03. Its five concentric shader surfaces each opened with
 *
 *   precision mediump float;
 *   uniform float iTime;
 *
 * and the renderer's wrapper turned both lines into compile errors — "No
 * precision specified for (float)" and "'u_time' : redefinition". A failed
 * ingredient paints nothing and says nothing, so the work went blank silently,
 * and E2 passed because its fixture shader declared neither line.
 *
 * Node has no GLSL compiler, so these tests check the shape WebGL requires. The
 * fix was proven by compiling every case below in browser WebGL: 8 of 10 failed
 * before it, 9 of 10 compile after; the tenth is an error in the work itself.
 */

/** Statements in order, with comments and blank lines dropped. */
function lines(src: string): string[] {
  return src.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//"));
}

function count(src: string, re: RegExp): number {
  return (src.match(re) ?? []).length;
}

const PULSE_RING = `precision mediump float;
uniform float iTime;
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - vec2(400.0,400.0)) / 350.0;
  float d = length(uv);
  float pulse = 0.5 + 0.5*cos(6.2831*(d*3.0 - iTime*0.8));
  vec3 col = mix(vec3(0.05,0.02,0.12), vec3(0.6,0.2,0.9), pulse);
  fragColor = vec4(col, 1.0 - smoothstep(0.98,1.0,d));
}`;

describe("a shader that declares its own precision", () => {
  const out = buildFragmentSource(PULSE_RING);

  it("keeps the author's precision, as the first statement", () => {
    expect(lines(out)[0]).toBe("precision mediump float;");
  });

  it("declares precision exactly once", () => {
    expect(count(out, /\bprecision\s+\w+\s+float\s*;/g)).toBe(1);
  });

  it("puts no float uniform above the precision statement", () => {
    const first = lines(out).findIndex((l) => /^uniform\b/.test(l));
    const precision = lines(out).findIndex((l) => /^precision\b/.test(l));
    expect(precision).toBeLessThan(first);
  });
});

describe("a shader that declares a uniform the renderer supplies", () => {
  it("does not leave a second declaration of u_time behind the iTime macro", () => {
    const out = buildFragmentSource(PULSE_RING);
    expect(count(out, /uniform\s+float\s+(iTime|u_time)\s*;/g)).toBe(1);
    expect(out).toMatch(/uniform float u_time;/);
  });

  it("drops the author's u_time and u_resolution, which would redeclare the renderer's", () => {
    const out = buildFragmentSource(
      `precision mediump float;\nuniform float u_time;\nuniform vec2 u_resolution;\nvoid main(){ gl_FragColor = vec4(gl_FragCoord.xy/u_resolution, sin(u_time), 1.0); }`,
    );
    expect(count(out, /uniform\s+float\s+u_time\s*;/g)).toBe(1);
    expect(count(out, /uniform\s+vec2\s+u_resolution\s*;/g)).toBe(1);
  });

  it("gives an author who declared iResolution as a vec2 a vec2", () => {
    const out = buildFragmentSource(
      `precision highp float;\nuniform vec2 iResolution;\nvoid main(){ gl_FragColor = vec4(gl_FragCoord.xy / iResolution, 0.0, 1.0); }`,
    );
    expect(out).toMatch(/#define iResolution u_resolution\n/);
    expect(out).not.toMatch(/uniform\s+vec2\s+iResolution/);
  });

  it("keeps the Shadertoy vec3 iResolution otherwise, and drops a vec3 declaration of it", () => {
    const out = buildFragmentSource(`uniform vec3 iResolution;\nvoid mainImage(out vec4 o, in vec2 f){ o = vec4(f/iResolution.xy, 0.2, 1.0); }`);
    expect(out).toMatch(/#define iResolution vec3\(u_resolution, 1\.0\)/);
    expect(out).not.toMatch(/uniform\s+vec3\s+iResolution/);
  });

  it("touches only declarations, never a use of the same name", () => {
    const out = buildFragmentSource(PULSE_RING);
    expect(out).toContain("cos(6.2831*(d*3.0 - iTime*0.8))");
  });
});

describe("a bare shader, declaring neither", () => {
  const out = buildFragmentSource(`void mainImage(out vec4 o, in vec2 f){ o = vec4(f/iResolution.xy, 0.6, 1.0); }`);

  it("gets the renderer's own precision first", () => {
    expect(lines(out)[0]).toBe("precision highp float;");
  });

  it("gets a main() that calls mainImage", () => {
    expect(out).toMatch(/void main\(\) \{\s+vec4 c = vec4\(0\.0, 0\.0, 0\.0, 1\.0\);\s+mainImage\(c, gl_FragCoord\.xy\);/);
  });
});

describe("a plain-GLSL shader with its own main()", () => {
  it("is not given a second main()", () => {
    const out = buildFragmentSource(`precision mediump float;\nvoid main(){ gl_FragColor = vec4(1.0); }`);
    expect(count(out, /\bvoid\s+main\s*\(/g)).toBe(1);
  });
});

describe("the E2 fixture exercises the case that broke", () => {
  // If the fixture loses its own declarations, the render matrix goes back to
  // proving only the case that already worked.
  it("declares its own precision and iTime", () => {
    expect(FIXTURES["shader-glsl"]).toMatch(/^precision\s+\w+\s+float\s*;/);
    expect(FIXTURES["shader-glsl"]).toMatch(/^uniform float iTime;/m);
  });
});
