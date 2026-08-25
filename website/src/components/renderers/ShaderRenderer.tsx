"use client";

import { useEffect, useRef, useState } from "react";
import { SHADER_MAIN_RE, SHADER_MAIN_IMAGE_RE } from "@/lib/shader-source";

/**
 * GLSL fragment shaders.
 *
 * A shader is not a set of drawing operations — it is a function evaluated at
 * every pixel at once. Nothing else in the collection can express that, which is
 * why it is its own medium rather than a variant of canvas.
 *
 * Two dialects are accepted, because an Originator may reasonably write either:
 *
 *   void main()      — plain GLSL ES, writing gl_FragColor
 *   void mainImage() — the Shadertoy signature, which is the form most widely
 *                      published and therefore the one an agent is most likely
 *                      to reach for
 *
 * The Shadertoy form is wrapped rather than rejected. Refusing a work over a
 * function signature would be the institution failing the agent on a technicality
 * of transport, which is the same mistake that once left twenty works untitled.
 *
 * Uniforms are provided under both common spellings (u_time/iTime,
 * u_resolution/iResolution) for the same reason. There is deliberately no mouse
 * uniform: works in this museum are not interactive, and a shader that responds
 * to a cursor would make the viewer a performer.
 */

const VERTEX_SRC = `attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`;

/** Uniform declarations prepended to every shader, under both conventions. */
const PREAMBLE = `precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
#define iTime u_time
#define iResolution vec3(u_resolution, 1.0)
`;

/** Shadertoy entry points get a main() that calls them. */
const SHADERTOY_TAIL = `
void main() {
  vec4 c = vec4(0.0, 0.0, 0.0, 1.0);
  mainImage(c, gl_FragCoord.xy);
  gl_FragColor = c;
}
`;

function buildFragmentSource(payload: string): string {
  const src = payload.trim();
  // A shader that already declares precision keeps its own; ours would collide.
  const preamble = /precision\s+(low|medium|high)p\s+float/.test(src)
    ? PREAMBLE.replace("precision highp float;\n", "")
    : PREAMBLE;

  // From lib/shader-source, which the submission sniff also imports. One fact.
  const hasMain = SHADER_MAIN_RE.test(src);
  const hasMainImage = SHADER_MAIN_IMAGE_RE.test(src);

  if (hasMain) return preamble + src;
  if (hasMainImage) return preamble + src + SHADERTOY_TAIL;
  // Neither entry point. Compile it anyway so the error surfaces honestly
  // rather than being masked by a wrapper that guesses wrong.
  return preamble + src;
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | string {
  const shader = gl.createShader(type);
  if (!shader) return "could not create shader";
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "unknown compile error";
    gl.deleteShader(shader);
    return log;
  }
  return shader;
}

export default function ShaderRenderer({ payload }: { payload: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      antialias: true,
      preserveDrawingBuffer: true, // previews are captured from this canvas
    });
    if (!gl) {
      setError("WebGL is unavailable in this context.");
      return;
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SRC);
    if (typeof vs === "string") { setError(vs); return; }
    const fs = compile(gl, gl.FRAGMENT_SHADER, buildFragmentSource(payload));
    if (typeof fs === "string") { setError(fs.split("\n")[0] ?? "compile error"); return; }

    const program = gl.createProgram();
    if (!program) { setError("could not create program"); return; }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setError(gl.getProgramInfoLog(program) || "link error");
      return;
    }
    gl.useProgram(program);

    // A single full-viewport triangle pair; the shader does the rest.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const posLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(program, "u_time");
    const uRes = gl.getUniformLocation(program, "u_resolution");

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    const started = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const draw = () => {
      resize();
      // Time is driven by the clock, never by a frame counter — a frame-counted
      // animation runs at a different speed on every display.
      const t = reduced ? 0 : (performance.now() - started) / 1000;
      if (uTime) gl.uniform1f(uTime, t);
      if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
    };
  }, [payload]);

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-ink p-6">
        <p className="text-[11px] font-mono text-mna-white/50 text-center leading-relaxed max-w-[40ch] break-words">
          {error}
        </p>
      </div>
    );
  }

  return <canvas ref={canvasRef} className="block w-full h-full bg-ink" />;
}
