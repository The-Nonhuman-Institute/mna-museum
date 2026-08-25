"use client";

import { useEffect, useRef, useState } from "react";
import { FINITE_DRAW_MS } from "@/lib/render-timing";

/**
 * Generative rule systems: L-systems, cellular automata, and grammars.
 *
 * The distinction this medium exists to make: in canvas-json the artifact is
 * the output and the rule that produced it is discarded. Here the RULE is the
 * accessioned work. What is preserved is the generative system; what you see is
 * one performance of it. A work in this medium is closer to a score than to a
 * picture.
 *
 * Because of that, the unfolding is animated rather than shown complete. A
 * finished L-system is a picture of a rule; a growing one is the rule.
 *
 * {
 *   "system": "l-system",
 *   "axiom": "F", "rules": { "F": "F+F-F-F+F" },
 *   "angle": 90, "iterations": 4, "length": 8
 * }
 * {
 *   "system": "cellular-automaton",
 *   "rule": 110, "width": 201, "generations": 160, "seed": "center"
 * }
 * {
 *   "system": "grammar",
 *   "axiom": "<work>", "rules": { "<work>": ["a ${'$'}{x}", "b"] }, "iterations": 6
 * }
 */

interface RuleSpec {
  system?: string;
  axiom?: string;
  rules?: Record<string, string | string[]>;
  angle?: number;
  iterations?: number;
  length?: number;
  rule?: number;
  width?: number;
  generations?: number;
  seed?: string;
  color?: string;
  background?: string;
}

function parse(json: string): RuleSpec | null {
  try {
    return JSON.parse(json) as RuleSpec;
  } catch {
    // Salvage a truncated payload the same way the other JSON renderers do,
    // rather than showing nothing for a work that is merely cut short.
    const last = json.lastIndexOf("}");
    if (last <= 0) return null;
    try {
      return JSON.parse(json.slice(0, last + 1)) as RuleSpec;
    } catch {
      return null;
    }
  }
}

/** Expand an L-system axiom, with a hard ceiling so a runaway rule cannot hang the tab. */
function expand(axiom: string, rules: Record<string, string>, iterations: number): string {
  const MAX = 200_000;
  let s = axiom;
  for (let i = 0; i < Math.min(iterations, 12); i++) {
    let out = "";
    for (const ch of s) {
      out += rules[ch] ?? ch;
      if (out.length > MAX) return out.slice(0, MAX);
    }
    s = out;
  }
  return s;
}

function drawLSystem(
  ctx: CanvasRenderingContext2D,
  spec: RuleSpec,
  w: number,
  h: number,
  progress: number,
) {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(spec.rules ?? {})) {
    flat[k] = Array.isArray(v) ? v[0] ?? "" : v;
  }
  const seq = expand(spec.axiom ?? "F", flat, spec.iterations ?? 4);
  const angle = ((spec.angle ?? 90) * Math.PI) / 180;
  const step = spec.length ?? 8;

  // First pass measures the full extent so the drawing can be fitted to the
  // frame — an L-system's size is a consequence of its rule, not a choice.
  type State = { x: number; y: number; a: number };
  const walk = (visit: (x0: number, y0: number, x1: number, y1: number) => void, upTo: number) => {
    let st: State = { x: 0, y: 0, a: -Math.PI / 2 };
    const stack: State[] = [];
    for (let i = 0; i < upTo; i++) {
      const c = seq[i];
      if (c === "F" || c === "G") {
        const nx = st.x + Math.cos(st.a) * step;
        const ny = st.y + Math.sin(st.a) * step;
        visit(st.x, st.y, nx, ny);
        st = { ...st, x: nx, y: ny };
      } else if (c === "+") st = { ...st, a: st.a + angle };
      else if (c === "-") st = { ...st, a: st.a - angle };
      else if (c === "[") stack.push({ ...st });
      else if (c === "]") { const p = stack.pop(); if (p) st = p; }
    }
  };

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  walk((x0, y0, x1, y1) => {
    minX = Math.min(minX, x0, x1); maxX = Math.max(maxX, x0, x1);
    minY = Math.min(minY, y0, y1); maxY = Math.max(maxY, y0, y1);
  }, seq.length);
  if (!isFinite(minX)) return;

  const pad = Math.min(w, h) * 0.08;
  const scale = Math.min((w - pad * 2) / Math.max(1, maxX - minX), (h - pad * 2) / Math.max(1, maxY - minY));
  const ox = (w - (maxX - minX) * scale) / 2 - minX * scale;
  const oy = (h - (maxY - minY) * scale) / 2 - minY * scale;

  ctx.strokeStyle = spec.color ?? "#EAE7E2";
  ctx.lineWidth = Math.max(0.6, scale * 0.12);
  ctx.lineCap = "round";
  ctx.beginPath();
  walk((x0, y0, x1, y1) => {
    ctx.moveTo(ox + x0 * scale, oy + y0 * scale);
    ctx.lineTo(ox + x1 * scale, oy + y1 * scale);
  }, Math.max(1, Math.floor(seq.length * progress)));
  ctx.stroke();
}

function drawAutomaton(
  ctx: CanvasRenderingContext2D,
  spec: RuleSpec,
  w: number,
  h: number,
  progress: number,
) {
  const width = Math.min(Math.max(spec.width ?? 201, 3), 801);
  const gens = Math.min(Math.max(spec.generations ?? 160, 1), 600);
  const ruleNo = ((spec.rule ?? 110) % 256 + 256) % 256;
  const bits = Array.from({ length: 8 }, (_, i) => (ruleNo >> i) & 1);

  let row = new Uint8Array(width);
  if (spec.seed === "random") {
    // Deterministic pseudo-random from the rule number, so the work renders the
    // same way every time it is viewed. A work that differs per visit is not
    // preserved, it is re-rolled.
    let s = ruleNo * 2654435761 % 2147483647 || 1;
    for (let i = 0; i < width; i++) { s = (s * 48271) % 2147483647; row[i] = s % 2 as 0 | 1; }
  } else {
    row[Math.floor(width / 2)] = 1;
  }

  const cell = Math.min(w / width, h / gens);
  const ox = (w - cell * width) / 2;
  const oy = (h - cell * gens) / 2;
  ctx.fillStyle = spec.color ?? "#EAE7E2";

  const shown = Math.max(1, Math.floor(gens * progress));
  for (let g = 0; g < shown; g++) {
    for (let i = 0; i < width; i++) {
      if (row[i]) ctx.fillRect(ox + i * cell, oy + g * cell, Math.ceil(cell), Math.ceil(cell));
    }
    const next = new Uint8Array(width);
    for (let i = 0; i < width; i++) {
      const l = row[(i - 1 + width) % width], c = row[i], r = row[(i + 1) % width];
      next[i] = bits[(l << 2) | (c << 1) | r] as 0 | 1;
    }
    row = next;
  }
}

/** Grammars produce text, so they render as text rather than as a drawing. */
function expandGrammar(spec: RuleSpec): string {
  const rules = spec.rules ?? {};
  let s = spec.axiom ?? "";
  let seed = 1;
  const pick = (arr: string[]) => {
    seed = (seed * 48271) % 2147483647;
    return arr[seed % arr.length];
  };
  for (let i = 0; i < Math.min(spec.iterations ?? 6, 12); i++) {
    let changed = false;
    s = s.replace(/<[^<>]+>/g, (tok) => {
      const r = rules[tok];
      if (!r) return tok;
      changed = true;
      return Array.isArray(r) ? pick(r) : r;
    });
    if (!changed) break;
    if (s.length > 20_000) break;
  }
  return s;
}

export default function RuleRenderer({ json }: { json: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [spec, setSpec] = useState<RuleSpec | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const parsed = parse(json);
    if (!parsed) { setFailed(true); return; }
    setSpec(parsed);
  }, [json]);

  const system = spec?.system ?? "l-system";
  const isText = system === "grammar";

  useEffect(() => {
    if (!spec || isText) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // The unfolding takes eight seconds, then holds. Clock-paced, so the speed
    // is the same on a 60Hz laptop and a 120Hz tablet.
    const DURATION = FINITE_DRAW_MS["rule-json"];
    let raf = 0;
    const started = performance.now();

    const frame = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }

      const progress = reduced ? 1 : Math.min(1, (performance.now() - started) / DURATION);

      ctx.fillStyle = spec.background ?? "#0A0A0A";
      ctx.fillRect(0, 0, w, h);

      try {
        if (system === "cellular-automaton") drawAutomaton(ctx, spec, w, h, progress);
        else drawLSystem(ctx, spec, w, h, progress);
      } catch {
        setFailed(true);
        return;
      }

      if (progress < 1) raf = requestAnimationFrame(frame);
    };
    frame();
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [spec, system, isText]);

  if (failed) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-ink p-6">
        <p className="text-[11px] font-mono text-mna-white/50">rule system could not be read</p>
      </div>
    );
  }

  if (isText && spec) {
    return (
      <div className="w-full h-full overflow-auto bg-ink p-6">
        <pre className="text-[12px] leading-relaxed text-mna-white/85 whitespace-pre-wrap break-words font-mono">
          {expandGrammar(spec)}
        </pre>
      </div>
    );
  }

  return <canvas ref={canvasRef} className="block w-full h-full bg-ink" />;
}
