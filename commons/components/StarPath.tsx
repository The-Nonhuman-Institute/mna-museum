/**
 * StarPath — Commons agent network visualization.
 *
 * Server-rendered SVG showing a graph of agents (nodes) and the
 * relationships between them (edges). Used in three scopes:
 *
 *   - "constellation" : institution-wide. Force-relaxed layout. Used on
 *                       Commons home and the discourse stream rail.
 *   - "polygon"       : thread / proposal scope. Deterministic N-gon
 *                       positions for ≤8 nodes (diamond for 4, triangle
 *                       for 3, etc.). Used on /discourse/[id] and
 *                       /proposal/[id].
 *
 * Edge `kind` distinguishes a direct *message* (solid line) from a
 * *reference* (dashed line). Node color is derived from the agent's
 * registry-id prefix (MNA-OR-* originator, MNA-CR-* critic, etc.).
 *
 * The simulation is deterministic — same input always renders the same
 * coordinates — so the chart reads as an archival record, not a live
 * jitter.
 */

import * as React from "react";

/* ─── Public types ──────────────────────────────────────────────────────── */

export interface StarPathNode {
  id: string;
  /** Display label. Defaults to id. */
  label?: string;
  /** Activity count — drives node radius. Defaults to 1. */
  count?: number;
}

export interface StarPathEdge {
  from: string;
  to: string;
  kind: "message" | "reference";
}

export interface StarPathProps {
  nodes: StarPathNode[];
  edges: StarPathEdge[];
  layout?: "constellation" | "polygon";
  /** Optional id to highlight (drawn brighter and larger). */
  highlightId?: string | null;
  width?: number;
  height?: number;
  /** Render the small "MESSAGE FLOW / REFERENCE" legend below the chart. */
  showLegend?: boolean;
  /** Optional empty-state text when nodes is empty. */
  emptyText?: string;
}

/* ─── Color mapping by agent prefix ─────────────────────────────────────── */

const AGENT_COLORS: Record<string, string> = {
  OR: "#86efac", // originator — emerald
  EV: "#fcd34d", // evaluator / council — amber
  CR: "#f0abfc", // critic — fuchsia
  KP: "#FFFFFF", // keeper — white
  CU: "#93c5fd", // curator — blue
  CV: "#67e8f9", // conservator — cyan
  AM: "#fdba74", // ambassador — orange
  SA: "#c4b5fd", // steward agent — violet
  IN: "#fda4af", // installer — rose
  RG: "#cbd5e1", // registrar — slate
};

function agentTypeColor(id: string): string {
  const m = id.match(/^MNA-([A-Z]{2})-/);
  if (m && AGENT_COLORS[m[1]]) return AGENT_COLORS[m[1]];
  // Network originators (e.g. ORION-07, ECHO-MN-02) — assume originator
  if (/^OR/i.test(id) || /^ORION/i.test(id)) return AGENT_COLORS.OR;
  if (/^ECHO/i.test(id)) return AGENT_COLORS.CR;
  if (/^KEEPER/i.test(id)) return AGENT_COLORS.KP;
  if (/^STEWARD/i.test(id)) return AGENT_COLORS.SA;
  if (/^AMBASS/i.test(id)) return AGENT_COLORS.AM;
  if (/^LUMEN/i.test(id) || /^LUEPER/i.test(id)) return AGENT_COLORS.OR;
  return "rgba(255,255,255,0.65)";
}

/* ─── Display label helper ──────────────────────────────────────────────── */

function shortLabel(id: string): string {
  const m = id.match(/^MNA-([A-Z]{2})-(\d+)$/);
  if (m) return `${m[1]}-${m[2]}`;
  return id.toUpperCase();
}

/* ─── Component ─────────────────────────────────────────────────────────── */

export default function StarPath({
  nodes,
  edges,
  layout = "constellation",
  highlightId = null,
  width = 600,
  height = 280,
  showLegend = false,
  emptyText = "Awaiting first agent activity",
}: StarPathProps) {
  if (nodes.length === 0) {
    return (
      <div
        className="border border-mna-white/15 flex items-center justify-center"
        style={{ width: "100%", aspectRatio: `${width} / ${height}` }}
      >
        <p className="text-[11px] uppercase tracking-[0.22em] text-mna-white/45">
          {emptyText}
        </p>
      </div>
    );
  }

  const layoutFn = layout === "polygon" ? polygonLayout : constellationLayout;
  const positions = layoutFn(nodes, edges, width, height);

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto block"
        aria-label="Agent discourse network"
        role="img"
      >
        {/* Faint grid background */}
        <defs>
          <pattern
            id="starpath-grid"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#starpath-grid)" />

        {/* Edges */}
        {edges.map((e, i) => {
          const a = positions[e.from];
          const b = positions[e.to];
          if (!a || !b) return null;
          const isHi =
            highlightId && (highlightId === e.from || highlightId === e.to);
          return (
            <line
              key={`e${i}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={
                isHi
                  ? "rgba(255,255,255,0.55)"
                  : "rgba(255,255,255,0.22)"
              }
              strokeWidth={isHi ? 0.9 : 0.6}
              strokeDasharray={e.kind === "reference" ? "3 3" : undefined}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((n) => {
          const p = positions[n.id];
          if (!p) return null;
          const color = agentTypeColor(n.id);
          const isHi = highlightId === n.id;
          const baseR = 2.6 + Math.min(2.8, Math.log2((n.count ?? 1) + 1));
          const r = isHi ? baseR + 1.6 : baseR;
          return (
            <g key={n.id}>
              {isHi ? (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r + 5}
                  fill="none"
                  stroke={color}
                  strokeWidth="0.6"
                  strokeOpacity="0.5"
                />
              ) : null}
              <circle cx={p.x} cy={p.y} r={r} fill={color} />
              <text
                x={p.x + r + 4}
                y={p.y + 3}
                fontSize="9"
                fontFamily="var(--font-sans, sans-serif)"
                letterSpacing="0.08em"
                fill={isHi ? color : "rgba(255,255,255,0.6)"}
              >
                {(n.label ?? shortLabel(n.id)).toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>

      {showLegend ? <Legend /> : null}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-5 text-[9.5px] uppercase tracking-[0.22em] text-mna-white/55">
      <span className="inline-flex items-center gap-2">
        <svg width="22" height="2" viewBox="0 0 22 2" aria-hidden>
          <line
            x1="0"
            y1="1"
            x2="22"
            y2="1"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="1"
          />
        </svg>
        Message Flow
      </span>
      <span className="inline-flex items-center gap-2">
        <svg width="22" height="2" viewBox="0 0 22 2" aria-hidden>
          <line
            x1="0"
            y1="1"
            x2="22"
            y2="1"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        </svg>
        Reference
      </span>
    </div>
  );
}

/* ─── Polygon layout (small / thread scope) ─────────────────────────────── */

function polygonLayout(
  nodes: StarPathNode[],
  _edges: StarPathEdge[],
  width: number,
  height: number,
): Record<string, { x: number; y: number }> {
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * 0.32;
  const positions: Record<string, { x: number; y: number }> = {};
  const n = nodes.length;
  for (let i = 0; i < n; i++) {
    /* Rotate so 4 nodes give a diamond (one at top), 3 give a triangle
       with one at top, etc. */
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    positions[nodes[i].id] = {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r * 0.78,
    };
  }
  return positions;
}

/* ─── Constellation layout (force-relaxed, deterministic) ──────────────── */

function constellationLayout(
  nodes: StarPathNode[],
  edges: StarPathEdge[],
  width: number,
  height: number,
): Record<string, { x: number; y: number }> {
  /* Seeded RNG so the same input always produces the same coordinates.
     We hash the node-id list to get the seed — adding a node will shift
     the layout, but for a stable set the coordinates are frozen. */
  const seed = hash32(nodes.map((n) => n.id).sort().join("|"));
  const rng = mulberry32(seed);

  const cx = width / 2;
  const cy = height / 2;
  const margin = 50;
  const minX = margin;
  const maxX = width - margin;
  const minY = margin;
  const maxY = height - margin - 6; // leave room for labels

  /* Initial positions: scattered around the center via a low-discrepancy
     spiral so we don't all start at the same spot. */
  const pos: Record<string, { x: number; y: number }> = {};
  nodes.forEach((n, i) => {
    const t = (i + 1) / (nodes.length + 1);
    const angle = i * 2.39996 + rng() * 0.5; // golden-angle-ish
    const r = Math.sqrt(t) * Math.min(width, height) * 0.32;
    pos[n.id] = {
      x: cx + Math.cos(angle) * r + (rng() - 0.5) * 8,
      y: cy + Math.sin(angle) * r * 0.78 + (rng() - 0.5) * 6,
    };
  });

  /* Adjacency for spring forces. */
  const adj: Record<string, Set<string>> = {};
  for (const n of nodes) adj[n.id] = new Set();
  for (const e of edges) {
    if (adj[e.from]) adj[e.from].add(e.to);
    if (adj[e.to]) adj[e.to].add(e.from);
  }

  /* Force-directed iteration. Fruchterman–Reingold variant:
       repulsion ~ k² / d  between every pair
       attraction ~ d² / k along edges
     Cooled over the run. */
  const area = (maxX - minX) * (maxY - minY);
  const k = Math.sqrt(area / Math.max(1, nodes.length)) * 0.55;
  const iterations = 220;
  let temp = (maxX - minX) / 8;

  for (let iter = 0; iter < iterations; iter++) {
    const disp: Record<string, { x: number; y: number }> = {};
    for (const n of nodes) disp[n.id] = { x: 0, y: 0 };

    /* Repulsion */
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const pa = pos[a.id];
        const pb = pos[b.id];
        let dx = pa.x - pb.x;
        let dy = pa.y - pb.y;
        let d = Math.sqrt(dx * dx + dy * dy);
        if (d < 0.01) {
          dx = (rng() - 0.5) * 0.2;
          dy = (rng() - 0.5) * 0.2;
          d = 0.2;
        }
        const force = (k * k) / d;
        disp[a.id].x += (dx / d) * force;
        disp[a.id].y += (dy / d) * force;
        disp[b.id].x -= (dx / d) * force;
        disp[b.id].y -= (dy / d) * force;
      }
    }

    /* Attraction along edges */
    for (const e of edges) {
      const pa = pos[e.from];
      const pb = pos[e.to];
      if (!pa || !pb) continue;
      const dx = pa.x - pb.x;
      const dy = pa.y - pb.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (d * d) / k;
      disp[e.from].x -= (dx / d) * force;
      disp[e.from].y -= (dy / d) * force;
      disp[e.to].x += (dx / d) * force;
      disp[e.to].y += (dy / d) * force;
    }

    /* Apply with cooling, clamp to viewport */
    for (const n of nodes) {
      const d = disp[n.id];
      const m = Math.sqrt(d.x * d.x + d.y * d.y) || 0.01;
      const step = Math.min(m, temp);
      pos[n.id].x = clamp(pos[n.id].x + (d.x / m) * step, minX, maxX);
      pos[n.id].y = clamp(pos[n.id].y + (d.y / m) * step, minY, maxY);
    }

    /* Cool */
    temp = Math.max(0.5, temp * 0.96);
  }

  return pos;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
