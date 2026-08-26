"use client";

import { useEffect, useRef, useState } from "react";

import {
  makeMask,
  paintThroughMask,
  readSurface,
  resolveSurface,
} from "@/lib/ingredient-surface";

/**
 * Relational structures — nodes and edges.
 *
 * The work is the TOPOLOGY. Layout is computed from it rather than authored,
 * which is the whole point: an Originator working in this medium decides what
 * is connected to what, not where anything sits. Two graphs with identical
 * drawings but different edges are different works; two drawings of the same
 * graph are the same work.
 *
 * Layout is a deterministic force simulation seeded from the structure, so a
 * work renders identically on every viewing. A layout seeded from Math.random
 * would make each visit a different picture, which is not preservation.
 *
 * { "nodes": [{"id":"a"}, {"id":"b","label":"B"}],
 *   "edges": [{"from":"a","to":"b"}],
 *   "directed": false, "layout": "force" | "circle" }
 */

interface GNode { id: string; label?: string; group?: string | number }
interface GEdge { from: string; to: string; weight?: number }
interface GraphSpec {
  nodes?: GNode[];
  edges?: GEdge[];
  directed?: boolean;
  layout?: string;
  color?: string;
  background?: string;
  /** Nodes are made OF this medium. See @/lib/ingredient-surface. */
  surface?: { type?: string; payload?: unknown };
}

function parse(json: string): GraphSpec | null {
  try { return JSON.parse(json) as GraphSpec; } catch {
    const last = json.lastIndexOf("}");
    if (last <= 0) return null;
    try { return JSON.parse(json.slice(0, last + 1)) as GraphSpec; } catch { return null; }
  }
}

/** Deterministic pseudo-random in [0,1) from a string — no Math.random anywhere. */
function seeded(s: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

export default function GraphRenderer({ json }: { json: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const spec = parse(json);
    const canvas = canvasRef.current;
    if (!spec || !canvas) { setFailed(true); return; }

    const nodes = (spec.nodes ?? []).slice(0, 400);
    const edges = (spec.edges ?? []).slice(0, 2000);
    if (nodes.length === 0) { setFailed(true); return; }

    const ctx = canvas.getContext("2d");
    if (!ctx) { setFailed(true); return; }

    const index = new Map(nodes.map((n, i) => [n.id, i]));
    const rnd = seeded(nodes.map((n) => n.id).join(","));

    // Initial positions on a circle, then relaxed. Circle-only layouts are
    // offered explicitly because for some structures the ring IS the reading.
    const pts = nodes.map((_, i) => {
      const a = (i / nodes.length) * Math.PI * 2;
      return { x: Math.cos(a) * 0.4 + (rnd() - 0.5) * 0.02, y: Math.sin(a) * 0.4 + (rnd() - 0.5) * 0.02 };
    });

    if ((spec.layout ?? "force") !== "circle") {
      // Fixed iteration count: the layout is part of the work's identity, so it
      // must not depend on how long the tab was open.
      for (let iter = 0; iter < 300; iter++) {
        const k = 0.35;
        for (let i = 0; i < pts.length; i++) {
          for (let j = i + 1; j < pts.length; j++) {
            let dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 1e-6) { dx = 1e-3; dy = 0; d2 = 1e-6; }
            const rep = (k * k) / d2 * 0.0006;
            pts[i].x -= dx * rep; pts[i].y -= dy * rep;
            pts[j].x += dx * rep; pts[j].y += dy * rep;
          }
        }
        for (const e of edges) {
          const a = index.get(e.from), b = index.get(e.to);
          if (a === undefined || b === undefined) continue;
          const dx = pts[b].x - pts[a].x, dy = pts[b].y - pts[a].y;
          const att = 0.02 * (e.weight ?? 1);
          pts[a].x += dx * att; pts[a].y += dy * att;
          pts[b].x -= dx * att; pts[b].y -= dy * att;
        }
      }
    }

    let ingredient: HTMLCanvasElement | null = null;
    let disposed = false;

    const render = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }

      ctx.fillStyle = spec.background ?? "#0A0A0A";
      ctx.fillRect(0, 0, w, h);

      const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
      const minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
      const pad = Math.min(w, h) * 0.12;
      const sx = (w - pad * 2) / Math.max(1e-6, maxX - minX);
      const sy = (h - pad * 2) / Math.max(1e-6, maxY - minY);
      const s = Math.min(sx, sy);
      const px = (p: { x: number; y: number }) => pad + (p.x - minX) * s + (w - pad * 2 - (maxX - minX) * s) / 2;
      const py = (p: { x: number; y: number }) => pad + (p.y - minY) * s + (h - pad * 2 - (maxY - minY) * s) / 2;

      const fg = spec.color ?? "#EAE7E2";
      ctx.strokeStyle = fg;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = Math.max(0.5, dpr * 0.6);
      for (const e of edges) {
        const a = index.get(e.from), b = index.get(e.to);
        if (a === undefined || b === undefined) continue;
        ctx.beginPath();
        ctx.moveTo(px(pts[a]), py(pts[a]));
        ctx.lineTo(px(pts[b]), py(pts[b]));
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      const r = Math.max(2, Math.min(w, h) * 0.006);

      const drawNodes = (target: CanvasRenderingContext2D) => {
        for (let i = 0; i < pts.length; i++) {
          target.beginPath();
          target.arc(px(pts[i]), py(pts[i]), r, 0, Math.PI * 2);
          target.fill();
        }
      };

      // A graph may declare `surface`, making its nodes out of another medium.
      // The topology is still the work; this is what the topology is drawn in.
      if (ingredient) {
        const mask = makeMask(w, h);
        if (mask.ctx) {
          mask.ctx.fillStyle = "#fff";
          drawNodes(mask.ctx);
          paintThroughMask(ctx, mask.canvas, ingredient);
        }
      } else {
        ctx.fillStyle = fg;
        drawNodes(ctx);
      }

      // Labels only when there is room for them to be read.
      if (nodes.length <= 40) {
        ctx.globalAlpha = 0.7;
        ctx.font = `${Math.max(9, Math.min(w, h) * 0.018)}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        for (let i = 0; i < pts.length; i++) {
          const label = nodes[i].label ?? nodes[i].id;
          ctx.fillText(label, px(pts[i]), py(pts[i]) - r * 2.2);
        }
        ctx.globalAlpha = 1;
      }
    };

    render();

    // Resolved after the first paint, then re-rendered: the ingredient's own
    // renderer must mount and paint before there is anything to sample, and
    // the graph should be readable in the meantime.
    const surface = readSurface(spec);
    if (surface) {
      void resolveSurface(surface, 512).then((c) => {
        if (disposed || !c) return;
        ingredient = c;
        render();
      });
    }

    const ro = new ResizeObserver(render);
    ro.observe(canvas);
    return () => {
      disposed = true;
      ro.disconnect();
    };
  }, [json]);

  if (failed) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-ink p-6">
        <p className="text-[11px] font-mono text-mna-white/50">graph could not be read</p>
      </div>
    );
  }
  return <canvas ref={canvasRef} className="block w-full h-full bg-ink" />;
}
