"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Instructions for a machine — plotter paths and G-code.
 *
 * The work is the instruction set. What renders here is a simulation of a
 * machine executing it, not the work itself; the work is fully realised only
 * when a pen plotter or CNC actually runs it. That makes this the one medium in
 * the collection with a physical performance, and it fits stewardship exactly:
 * a human may run the machine, which is labour, not authorship. Nobody decides
 * anything by pressing start.
 *
 * The toolpath is drawn in order, so you watch the machine's decisions rather
 * than seeing the finished plot. Travel moves (G0) are drawn faintly; cutting
 * or drawing moves (G1/G2/G3) at full weight — the difference between where the
 * machine goes and where it commits is legible.
 *
 * Accepts G-code directly, since that is what a machine consumes.
 */

interface Move { x: number; y: number; draw: boolean }

/**
 * Parse the subset of G-code that describes a path. Unknown codes are skipped
 * rather than treated as errors: real G-code carries spindle speeds, feed
 * rates and machine-specific M-codes that have no bearing on the geometry.
 */
function parseGcode(src: string): Move[] {
  const moves: Move[] = [];
  let x = 0, y = 0;
  let absolute = true;

  for (const rawLine of src.split(/\r?\n/)) {
    const line = rawLine.replace(/\(.*?\)/g, "").replace(/;.*$/, "").trim();
    if (!line) continue;
    const upper = line.toUpperCase();

    if (/\bG90\b/.test(upper)) absolute = true;
    if (/\bG91\b/.test(upper)) absolute = false;

    const g = /\bG0*([0123])\b/.exec(upper);
    if (!g) continue;

    const nx = /X(-?[\d.]+)/.exec(upper);
    const ny = /Y(-?[\d.]+)/.exec(upper);
    if (!nx && !ny) continue;

    const vx = nx ? parseFloat(nx[1]) : (absolute ? x : 0);
    const vy = ny ? parseFloat(ny[1]) : (absolute ? y : 0);
    if (!isFinite(vx) || !isFinite(vy)) continue;

    x = absolute ? vx : x + vx;
    y = absolute ? vy : y + vy;
    // G2/G3 are arcs; drawn as chords here. The instruction set keeps the arc.
    moves.push({ x, y, draw: g[1] !== "0" });
    if (moves.length > 60_000) break;
  }
  return moves;
}

export default function InstructionRenderer({ payload }: { payload: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setFailed(true); return; }

    const moves = parseGcode(payload);
    if (moves.length < 2) { setFailed(true); return; }

    const xs = moves.map((m) => m.x), ys = moves.map((m) => m.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const DURATION = 9000;
    const started = performance.now();
    let raf = 0;

    const frame = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }

      ctx.fillStyle = "#0A0A0A";
      ctx.fillRect(0, 0, w, h);

      const pad = Math.min(w, h) * 0.1;
      const s = Math.min((w - pad * 2) / Math.max(1e-6, maxX - minX), (h - pad * 2) / Math.max(1e-6, maxY - minY));
      const ox = (w - (maxX - minX) * s) / 2 - minX * s;
      // Machine Y runs upward; screen Y runs down. Flip so the plot is not mirrored.
      const oy = (h + (maxY - minY) * s) / 2 + minY * s;
      const px = (v: number) => ox + v * s;
      const py = (v: number) => oy - v * s;

      const progress = reduced ? 1 : Math.min(1, (performance.now() - started) / DURATION);
      const upTo = Math.max(1, Math.floor(moves.length * progress));

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let i = 1; i < upTo; i++) {
        const a = moves[i - 1], b = moves[i];
        ctx.beginPath();
        ctx.moveTo(px(a.x), py(a.y));
        ctx.lineTo(px(b.x), py(b.y));
        if (b.draw) {
          ctx.strokeStyle = "#EAE7E2";
          ctx.globalAlpha = 1;
          ctx.lineWidth = Math.max(0.8, dpr * 0.9);
        } else {
          ctx.strokeStyle = "#8A8AAB";
          ctx.globalAlpha = 0.22;
          ctx.lineWidth = Math.max(0.5, dpr * 0.5);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      if (progress < 1) raf = requestAnimationFrame(frame);
    };
    frame();
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [payload]);

  if (failed) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-ink p-6">
        <p className="text-[11px] font-mono text-mna-white/50">no toolpath found in these instructions</p>
      </div>
    );
  }
  return <canvas ref={canvasRef} className="block w-full h-full bg-ink" />;
}
