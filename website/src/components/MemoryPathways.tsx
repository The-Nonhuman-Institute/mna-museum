/**
 * MemoryPathways — server-rendered SVG visualization of an agent's
 * associative memory edges (MNA-GOV-004 AMD-002 §A4).
 *
 * Static. Deterministic. No client JS, no animation. Same edges always
 * lay out the same way — the institution's view of an agent's mental
 * topology is a thing you can return to and compare against, not a
 * thing that moves.
 *
 * Layout: Fruchterman-Reingold style force simulation, ~80 iterations,
 * PRNG seeded by agent_id. Anchors (locked semantic memories) are
 * pinned near the center; episodic/reflective/encounter memories
 * arrange themselves around them via spring attractions along edges
 * and repulsion between all pairs.
 *
 * Privacy: the panel shows the agent's pathway topology. Memory content
 * snippets render as SVG <title> hover text — they are public in the
 * sense that anyone can hover, but they are also not visually loud.
 * The agent's private retrievals in real time are not exposed; only
 * the topology that has accumulated.
 */

import * as React from "react";
import type {
  AgentPathways,
  PathwayNode,
  PathwayEdge,
} from "@/lib/agent-pathways";

/* ─── deterministic PRNG ─────────────────────────────────────────────── */

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ─── layout ─────────────────────────────────────────────────────────── */

interface LaidOutNode extends PathwayNode {
  x: number;
  y: number;
}

const WIDTH = 720;
const HEIGHT = 380;

function computeLayout(
  nodes: PathwayNode[],
  edges: PathwayEdge[],
  agentId: string,
): LaidOutNode[] {
  const rnd = mulberry32(hashString(agentId));
  const n = nodes.length;
  if (n === 0) return [];

  // Initial layout: anchors near center, episodic ring around them.
  // Both rings get the deterministic PRNG nudge for stable variation.
  const anchorIdx: number[] = [];
  const otherIdx: number[] = [];
  nodes.forEach((node, i) => {
    if (node.is_locked) anchorIdx.push(i);
    else otherIdx.push(i);
  });

  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  const positions: { x: number; y: number }[] = new Array(n);
  const innerR = Math.min(60, 12 + anchorIdx.length * 8);
  const outerR = Math.min(150, 60 + otherIdx.length * 8);

  anchorIdx.forEach((idx, k) => {
    const angle = (k / Math.max(1, anchorIdx.length)) * Math.PI * 2 + rnd() * 0.4;
    positions[idx] = {
      x: cx + Math.cos(angle) * innerR,
      y: cy + Math.sin(angle) * innerR,
    };
  });
  otherIdx.forEach((idx, k) => {
    const angle = (k / Math.max(1, otherIdx.length)) * Math.PI * 2 + rnd() * 0.4;
    positions[idx] = {
      x: cx + Math.cos(angle) * outerR,
      y: cy + Math.sin(angle) * outerR,
    };
  });

  // Force simulation.
  const idToIdx = new Map<string, number>();
  nodes.forEach((node, i) => idToIdx.set(node.id, i));

  const ITERATIONS = 80;
  const REPULSION = 4500;
  const SPRING_K = 0.08;
  const SPRING_REST = 90; // rest length in px
  const DAMPING = 0.85;
  const ANCHOR_PULL = 0.12; // pull anchors gently back toward center

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const fx: number[] = new Array(n).fill(0);
    const fy: number[] = new Array(n).fill(0);

    // Repulsion between all pairs.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = positions[i].x - positions[j].x;
        const dy = positions[i].y - positions[j].y;
        const dist2 = dx * dx + dy * dy + 0.01;
        const force = REPULSION / dist2;
        const dist = Math.sqrt(dist2);
        const ux = dx / dist;
        const uy = dy / dist;
        fx[i] += ux * force;
        fy[i] += uy * force;
        fx[j] -= ux * force;
        fy[j] -= uy * force;
      }
    }

    // Spring attractions along edges. Rest length shorter for stronger
    // edges (high weight pulls memories closer).
    for (const e of edges) {
      const i = idToIdx.get(e.a);
      const j = idToIdx.get(e.b);
      if (i === undefined || j === undefined) continue;
      const dx = positions[j].x - positions[i].x;
      const dy = positions[j].y - positions[i].y;
      const dist = Math.sqrt(dx * dx + dy * dy + 0.01);
      const rest = SPRING_REST * (1 - 0.5 * e.weight); // weight 1 → rest 45
      const force = SPRING_K * e.weight * (dist - rest);
      const ux = dx / dist;
      const uy = dy / dist;
      fx[i] += ux * force;
      fy[i] += uy * force;
      fx[j] -= ux * force;
      fy[j] -= uy * force;
    }

    // Anchor pull toward center keeps the constellation centered.
    for (const idx of anchorIdx) {
      fx[idx] += (cx - positions[idx].x) * ANCHOR_PULL;
      fy[idx] += (cy - positions[idx].y) * ANCHOR_PULL;
    }

    // Cooling: damping schedule.
    const t = 1 - iter / ITERATIONS;
    for (let i = 0; i < n; i++) {
      // Cap step to avoid runaway in dense graphs.
      const step = Math.min(20, Math.hypot(fx[i], fy[i])) * t * DAMPING;
      if (step > 0) {
        const mag = Math.hypot(fx[i], fy[i]) || 1;
        positions[i].x += (fx[i] / mag) * step;
        positions[i].y += (fy[i] / mag) * step;
      }
    }

    // Keep in bounds.
    const PAD = 30;
    for (let i = 0; i < n; i++) {
      positions[i].x = Math.max(PAD, Math.min(WIDTH - PAD, positions[i].x));
      positions[i].y = Math.max(PAD, Math.min(HEIGHT - PAD, positions[i].y));
    }
  }

  return nodes.map((node, i) => ({
    ...node,
    x: positions[i].x,
    y: positions[i].y,
  }));
}

/* ─── styling ────────────────────────────────────────────────────────── */

const TYPE_FILL: Record<PathwayNode["memory_type"], string> = {
  semantic: "#1a1a1a",     // dark ink — anchors + consolidations
  reflective: "#4a4a4a",   // muted grey
  episodic: "#7a7a7a",     // lighter grey
  encounter: "#5a5a5a",    // mid grey
};

function nodeRadius(access_count: number, is_locked: boolean): number {
  // Anchors slightly larger by default. Otherwise log-scaled access.
  const base = is_locked ? 7 : 4.5;
  return base + Math.min(8, Math.log(1 + access_count) * 2.5);
}

function snippet(content: string, n = 110): string {
  const trimmed = content.replace(/\s+/g, " ").trim();
  if (trimmed.length <= n) return trimmed;
  return trimmed.slice(0, n - 1).trimEnd() + "…";
}

/* ─── component ──────────────────────────────────────────────────────── */

export default function MemoryPathways({
  pathways,
  agentDesignation,
}: {
  pathways: AgentPathways;
  agentDesignation: string;
}) {
  if (pathways.edges.length === 0) return null;

  const laidOut = computeLayout(
    pathways.nodes,
    pathways.edges,
    pathways.agent_id,
  );
  const posById = new Map(laidOut.map((n) => [n.id, n]));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 mb-3 border-b border-ink/10 pb-3">
        <h2 className="font-serif text-[20px] md:text-[22px] text-ink leading-tight">
          Memory Pathways
        </h2>
        <p className="text-[10.5px] uppercase tracking-[0.22em] text-ink/55">
          {pathways.edges.length} {pathways.edges.length === 1 ? "edge" : "edges"}
          {" "}· {laidOut.length} {laidOut.length === 1 ? "node" : "nodes"}
          {pathways.total_edges > pathways.edges.length ? (
            <> · of {pathways.total_edges} total</>
          ) : null}
        </p>
      </div>

      <p className="text-[12.5px] leading-[1.55] text-ink/65 mb-5 max-w-[640px]">
        Memories that {agentDesignation} retrieves together form weighted
        associations. Pathways above {">"} 0.3 are shown. Nodes are sized by
        access count; anchors (locked semantic memories) are drawn in dark
        ink. The institution does not see {agentDesignation}&apos;s private
        retrievals — only the topology that accumulates.
      </p>

      <div className="border border-ink/10 bg-warm-paper relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width="100%"
          role="img"
          aria-label={`Memory pathways for ${agentDesignation}`}
          style={{ display: "block" }}
        >
          {/* Edges */}
          <g>
            {pathways.edges.map((e) => {
              const a = posById.get(e.a);
              const b = posById.get(e.b);
              if (!a || !b) return null;
              const opacity = 0.18 + e.weight * 0.7;
              const strokeWidth = 0.6 + e.weight * 1.8;
              return (
                <line
                  key={`${e.a}-${e.b}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="#1a1a1a"
                  strokeOpacity={opacity}
                  strokeWidth={strokeWidth}
                />
              );
            })}
          </g>

          {/* Nodes */}
          <g>
            {laidOut.map((node) => {
              const r = nodeRadius(node.access_count, node.is_locked);
              return (
                <g key={node.id}>
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={r}
                    fill={TYPE_FILL[node.memory_type]}
                    stroke={node.is_locked ? "#1a1a1a" : "rgba(26,26,26,0.4)"}
                    strokeWidth={node.is_locked ? 1.5 : 0.6}
                  >
                    <title>
                      {node.id} · {node.memory_type}
                      {node.is_locked ? " (anchor)" : ""}
                      {"\n"}
                      access: {node.access_count}
                      {"\n\n"}
                      {snippet(node.content, 180)}
                    </title>
                  </circle>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div className="flex items-center gap-5 mt-4 text-[10.5px] uppercase tracking-[0.18em] text-ink/55">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block w-3 h-3 rounded-full"
            style={{ background: TYPE_FILL.semantic, border: "1.5px solid #1a1a1a" }}
          />
          Anchor / Semantic
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block w-3 h-3 rounded-full"
            style={{ background: TYPE_FILL.reflective }}
          />
          Reflective
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block w-3 h-3 rounded-full"
            style={{ background: TYPE_FILL.episodic }}
          />
          Episodic
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block w-3 h-3 rounded-full"
            style={{ background: TYPE_FILL.encounter }}
          />
          Encounter
        </span>
      </div>
    </div>
  );
}
