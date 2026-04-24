/**
 * MNAGlyph — the Museum's procedural visual-identity library.
 *
 * Each "family" is a compositional grammar (radial dust, polyhedral lattice,
 * orbital diagram, etc.) rendered procedurally from a deterministic seed.
 * Same family + same seed → same glyph, always. Families share a visual
 * language: thin white line-work on black, centered composition, geometric
 * construction visible, negative space dominant. Think 18th-century
 * scientific engraving, not app iconography.
 *
 * Use cases:
 *   - Pre-identity placeholders for agents below work #20
 *   - Navigational / sectional chrome (home nav buttons, dividers)
 *   - Empty-state fills and institutional decoration
 *
 * The library is deliberately closed: extending it is a code change. That
 * keeps the visual vocabulary coherent. When agents crystallize their own
 * identity at work #20, the chosen family + seed are recorded in the DB
 * (agent_identity table) so the render stays stable even if the library
 * evolves.
 */

import * as React from "react";

/* ─── Deterministic helpers ─────────────────────────────────────────────── */

export function hashSeed(s: string): number {
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

/* ─── Family registry ──────────────────────────────────────────────────── */

export type GlyphCategory =
  | "radial"
  | "orthogonal"
  | "stellar"
  | "organic"
  | "signal"
  | "ledger";

export type GlyphFamily =
  | "particle-cloud"
  | "polyhedron"
  | "fractured-disc"
  | "starburst"
  | "starburst-long"
  | "grid-square"
  | "isocube"
  | "concentric"
  | "barcode"
  | "targeting-ring"
  | "threshold"
  | "codex"
  | "spiral"
  | "constellation"
  | "lattice-weave"
  | "dendrite"
  | "eclipse"
  | "phase-moon"
  | "waveform"
  | "orbit-diagram"
  | "compass-rose"
  | "vesica"
  | "crosshatch"
  | "meridian"
  | "halftone";

export interface GlyphMeta {
  key: GlyphFamily;
  label: string;
  category: GlyphCategory;
  description: string;
}

export const GLYPH_FAMILIES: Record<GlyphFamily, GlyphMeta> = {
  "particle-cloud":   { key: "particle-cloud",   label: "Particle Cloud",   category: "radial",     description: "Origination and emergence." },
  "polyhedron":       { key: "polyhedron",       label: "Polyhedron",       category: "orthogonal", description: "Wireframe evaluation lattice." },
  "fractured-disc":   { key: "fractured-disc",   label: "Fractured Disc",   category: "radial",     description: "Integrity under pressure." },
  "starburst":        { key: "starburst",        label: "Starburst",        category: "radial",     description: "Proclamation and critique." },
  "starburst-long":   { key: "starburst-long",   label: "Long Starburst",   category: "radial",     description: "Projection and reach." },
  "grid-square":      { key: "grid-square",      label: "Grid Square",      category: "orthogonal", description: "Placement and curation." },
  "isocube":          { key: "isocube",          label: "Isometric Cube",   category: "orthogonal", description: "Volume and installation." },
  "concentric":       { key: "concentric",       label: "Concentric Rings", category: "radial",     description: "Depth and conservation." },
  "barcode":          { key: "barcode",          label: "Barcode",          category: "ledger",     description: "Registry and index." },
  "targeting-ring":   { key: "targeting-ring",   label: "Targeting Ring",   category: "radial",     description: "Oversight and attention." },
  "threshold":        { key: "threshold",        label: "Threshold",        category: "orthogonal", description: "Passage and exhibition." },
  "codex":            { key: "codex",            label: "Codex",            category: "ledger",     description: "Strata and canon." },
  "spiral":           { key: "spiral",           label: "Spiral",           category: "organic",    description: "Growth and involution." },
  "constellation":    { key: "constellation",    label: "Constellation",    category: "stellar",    description: "Commons and linkage." },
  "lattice-weave":    { key: "lattice-weave",    label: "Lattice Weave",    category: "orthogonal", description: "Interdependence." },
  "dendrite":         { key: "dendrite",         label: "Dendrite",         category: "organic",    description: "Branching derivation." },
  "eclipse":          { key: "eclipse",          label: "Eclipse",          category: "stellar",    description: "Transit and moment." },
  "phase-moon":       { key: "phase-moon",       label: "Phase Moon",       category: "stellar",    description: "Phase and cycle." },
  "waveform":         { key: "waveform",         label: "Waveform",         category: "signal",     description: "Signal and frequency." },
  "orbit-diagram":    { key: "orbit-diagram",    label: "Orbit Diagram",    category: "stellar",    description: "System and trajectory." },
  "compass-rose":     { key: "compass-rose",     label: "Compass Rose",     category: "radial",     description: "Orientation and navigation." },
  "vesica":           { key: "vesica",           label: "Vesica",           category: "radial",     description: "Intersection and union." },
  "crosshatch":       { key: "crosshatch",       label: "Crosshatch",       category: "orthogonal", description: "Density and shade." },
  "meridian":         { key: "meridian",         label: "Meridian",         category: "signal",     description: "Parallels and projection." },
  "halftone":         { key: "halftone",         label: "Halftone",         category: "signal",     description: "Dither and gradient." },
};

export const ALL_FAMILIES = Object.keys(GLYPH_FAMILIES) as GlyphFamily[];

/** Deterministically pick a family from a string seed. Useful for
 *  pre-identity placeholders: same agent always gets the same family. */
export function pickFamily(seed: string): GlyphFamily {
  const h = hashSeed(`family::${seed}`);
  return ALL_FAMILIES[h % ALL_FAMILIES.length];
}

/* ─── Public component ─────────────────────────────────────────────────── */

export interface MNAGlyphProps {
  family: GlyphFamily;
  /** String or numeric seed. Strings are hashed. */
  seed: string | number;
  size?: number;
  color?: string;
  className?: string;
  title?: string;
}

export default function MNAGlyph({
  family,
  seed,
  size = 120,
  color = "currentColor",
  className,
  title,
}: MNAGlyphProps) {
  const n = typeof seed === "number" ? seed >>> 0 : hashSeed(String(seed));
  const body = renderFamily(family, n, color);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {body}
    </svg>
  );
}

/* ─── Dispatch ─────────────────────────────────────────────────────────── */

type Renderer = (seed: number, color: string) => React.ReactNode;

function renderFamily(family: GlyphFamily, seed: number, color: string): React.ReactNode {
  const fn = RENDERERS[family];
  return fn(seed, color);
}

const RENDERERS: Record<GlyphFamily, Renderer> = {
  "particle-cloud":   particleCloud,
  "polyhedron":       polyhedron,
  "fractured-disc":   fracturedDisc,
  "starburst":        starburst,
  "starburst-long":   starburstLong,
  "grid-square":      gridSquare,
  "isocube":          isocube,
  "concentric":       concentric,
  "barcode":          barcode,
  "targeting-ring":   targetingRing,
  "threshold":        threshold,
  "codex":            codex,
  "spiral":           spiral,
  "constellation":    constellation,
  "lattice-weave":    latticeWeave,
  "dendrite":         dendrite,
  "eclipse":          eclipse,
  "phase-moon":       phaseMoon,
  "waveform":         waveform,
  "orbit-diagram":    orbitDiagram,
  "compass-rose":     compassRose,
  "vesica":           vesica,
  "crosshatch":       crosshatch,
  "meridian":         meridian,
  "halftone":         halftone,
};

/* ═══════════════════════════════════════════════════════════════════════ */
/*  FAMILIES                                                                */
/* ═══════════════════════════════════════════════════════════════════════ */

/* ─── particle-cloud — 4 variants ──────────────────────────────────────── */

function particleCloud(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const variant = seed % 4;
  const pts: { x: number; y: number; r: number; op: number }[] = [];

  if (variant === 0) {
    // Dust cloud, radial falloff
    for (let i = 0; i < 260; i++) {
      const r = Math.pow(rand(), 0.6) * 42;
      const a = rand() * Math.PI * 2;
      pts.push({
        x: 50 + Math.cos(a) * r,
        y: 50 + Math.sin(a) * r,
        r: 0.3 + rand() * 0.6,
        op: 0.4 + (1 - r / 42) * 0.6,
      });
    }
  } else if (variant === 1) {
    // Ringed system
    const rings = 3 + (seed % 3);
    for (let ri = 0; ri < rings; ri++) {
      const r = 10 + ri * 10 + rand() * 3;
      const count = 40 + Math.floor(r * 2);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + rand() * 0.2;
        const jitter = rand() * 1.5;
        pts.push({
          x: 50 + Math.cos(a) * (r + jitter),
          y: 50 + Math.sin(a) * (r + jitter),
          r: 0.3 + rand() * 0.4,
          op: 0.5 + rand() * 0.35,
        });
      }
    }
    for (let i = 0; i < 40; i++) {
      const a = rand() * Math.PI * 2;
      const r = rand() * 4;
      pts.push({ x: 50 + Math.cos(a) * r, y: 50 + Math.sin(a) * r, r: 0.4 + rand() * 0.6, op: 0.9 });
    }
  } else if (variant === 2) {
    // Filamentary arms
    const arms = 3 + Math.floor(rand() * 3);
    for (let ai = 0; ai < arms; ai++) {
      const baseA = (ai / arms) * Math.PI * 2 + rand() * 0.3;
      for (let i = 0; i < 50; i++) {
        const t = i / 50;
        const r = t * 40;
        const a = baseA + (rand() - 0.5) * 0.6 + t * 0.5;
        pts.push({
          x: 50 + Math.cos(a) * r,
          y: 50 + Math.sin(a) * r,
          r: 0.25 + rand() * 0.5,
          op: 0.4 + (1 - t) * 0.5,
        });
      }
    }
  } else {
    // Lissajous weave
    const a1 = 1 + (seed % 3);
    const a2 = 2 + ((seed >> 2) % 3);
    const phase = (seed % 100) / 100;
    for (let i = 0; i < 300; i++) {
      const t = (i / 300) * Math.PI * 2;
      pts.push({
        x: 50 + Math.sin(a1 * t + phase) * 36,
        y: 50 + Math.sin(a2 * t) * 36,
        r: 0.35,
        op: 0.75,
      });
    }
  }

  return pts.map((p, i) => (
    <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={color} opacity={p.op} />
  ));
}

/* ─── polyhedron — 4 variants ──────────────────────────────────────────── */

function polyhedron(seed: number, color: string): React.ReactNode {
  const family = seed % 4;
  const lines: [number, number, number, number][] = [];
  const dots: [number, number][] = [];
  const cx = 50, cy = 50, R = 32;

  if (family === 0) {
    // Octahedron
    const verts: [number, number][] = [
      [cx, cy - R], [cx, cy + R], [cx - R, cy], [cx + R, cy],
      [cx - R * 0.7, cy - R * 0.3], [cx + R * 0.7, cy + R * 0.3],
    ];
    for (let i = 0; i < verts.length; i++)
      for (let j = i + 1; j < verts.length; j++)
        lines.push([verts[i][0], verts[i][1], verts[j][0], verts[j][1]]);
    dots.push(...verts);
  } else if (family === 1) {
    // Cube
    const front: [number, number][] = [
      [cx - R * 0.7, cy - R * 0.7], [cx + R * 0.7, cy - R * 0.7],
      [cx + R * 0.7, cy + R * 0.7], [cx - R * 0.7, cy + R * 0.7],
    ];
    const back: [number, number][] = front.map(([x, y]) => [x + R * 0.3, y - R * 0.3]);
    for (let i = 0; i < 4; i++) {
      const ni = (i + 1) % 4;
      lines.push([front[i][0], front[i][1], front[ni][0], front[ni][1]]);
      lines.push([back[i][0], back[i][1], back[ni][0], back[ni][1]]);
      lines.push([front[i][0], front[i][1], back[i][0], back[i][1]]);
    }
    dots.push(...front, ...back);
  } else if (family === 2) {
    // Icosahedral star
    const count = 12;
    const verts: [number, number][] = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 - Math.PI / 2;
      verts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
    }
    for (let i = 0; i < count; i++) {
      const j = (i + 4) % count;
      lines.push([verts[i][0], verts[i][1], verts[j][0], verts[j][1]]);
    }
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      lines.push([verts[i][0], verts[i][1], verts[j][0], verts[j][1]]);
    }
    dots.push(...verts);
  } else {
    // Cuboctahedron
    const outer: [number, number][] = [];
    const inner: [number, number][] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      outer.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 - Math.PI / 4;
      inner.push([cx + Math.cos(a) * R * 0.5, cy + Math.sin(a) * R * 0.5]);
    }
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      lines.push([outer[i][0], outer[i][1], outer[j][0], outer[j][1]]);
    }
    for (let i = 0; i < 4; i++) {
      lines.push([outer[i * 2][0], outer[i * 2][1], inner[i][0], inner[i][1]]);
      lines.push([outer[i * 2 + 1][0], outer[i * 2 + 1][1], inner[i][0], inner[i][1]]);
    }
    dots.push(...outer, ...inner);
  }

  return (
    <>
      {lines.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="0.4" opacity="0.55" />
      ))}
      {dots.map(([x, y], i) => (
        <circle key={`d${i}`} cx={x} cy={y} r="1" fill={color} opacity="0.85" />
      ))}
      <circle cx={cx} cy={cy} r="1.2" fill={color} />
    </>
  );
}

/* ─── fractured-disc ───────────────────────────────────────────────────── */

function fracturedDisc(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const cuts = 2 + (seed % 3); // 2 or 3 diametric cuts
  const baseAngles = Array.from({ length: cuts }, (_, i) => (i * Math.PI) / cuts);
  const angles = baseAngles.map((a) => a + (rand() - 0.5) * 0.35);
  const R = 34;

  return (
    <>
      <defs>
        <radialGradient id={`keep-${seed}`} cx="50%" cy="42%">
          <stop offset="0%" stopColor={color} stopOpacity="0.12" />
          <stop offset="100%" stopColor={color} stopOpacity="0.03" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r={R} fill={`url(#keep-${seed})`} />
      <circle cx="50" cy="50" r={R} stroke={color} strokeWidth="0.35" opacity="0.45" />
      {angles.map((a, i) => (
        <line
          key={i}
          x1={50 + Math.cos(a) * R}
          y1={50 + Math.sin(a) * R}
          x2={50 - Math.cos(a) * R}
          y2={50 - Math.sin(a) * R}
          stroke={color}
          strokeWidth="2.2"
          opacity="0.92"
        />
      ))}
      <circle cx="50" cy="50" r="1.8" fill={color} />
    </>
  );
}

/* ─── starburst ────────────────────────────────────────────────────────── */

function starburst(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const count = [72, 96, 120][seed % 3];
  const spokes: React.ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand() * 0.05;
    const len = 10 + rand() * 30;
    spokes.push(
      <line
        key={i}
        x1="50"
        y1="50"
        x2={50 + Math.cos(a) * len}
        y2={50 + Math.sin(a) * len}
        stroke={color}
        strokeWidth={0.25 + rand() * 0.25}
        opacity={0.3 + rand() * 0.6}
      />
    );
  }
  return (
    <>
      {spokes}
      <circle cx="50" cy="50" r="1.6" fill={color} />
    </>
  );
}

/* ─── starburst-long ───────────────────────────────────────────────────── */

function starburstLong(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const count = 160;
  const spokes: React.ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const long = i % 8 === 0;
    const len = long ? 36 : 12 + rand() * 10;
    spokes.push(
      <line
        key={i}
        x1="50"
        y1="50"
        x2={50 + Math.cos(a) * len}
        y2={50 + Math.sin(a) * len}
        stroke={color}
        strokeWidth="0.3"
        opacity={long ? 0.9 : 0.3 + rand() * 0.3}
      />
    );
  }
  return (
    <>
      {spokes}
      <circle cx="50" cy="50" r="1.8" fill={color} />
    </>
  );
}

/* ─── grid-square ──────────────────────────────────────────────────────── */

function gridSquare(seed: number, color: string): React.ReactNode {
  const sz = 46;
  const x = 50 - sz / 2;
  const y = 50 - sz / 2;
  const divisions = 2 + (seed % 3); // 2, 3, or 4
  const step = sz / divisions;
  const lines: React.ReactNode[] = [
    <rect key="r" x={x} y={y} width={sz} height={sz} stroke={color} strokeWidth="0.5" opacity="0.75" />,
  ];
  for (let i = 1; i < divisions; i++) {
    lines.push(
      <line key={`h${i}`} x1={x} y1={y + i * step} x2={x + sz} y2={y + i * step} stroke={color} strokeWidth="0.4" opacity="0.45" />,
      <line key={`v${i}`} x1={x + i * step} y1={y} x2={x + i * step} y2={y + sz} stroke={color} strokeWidth="0.4" opacity="0.45" />
    );
  }
  return (
    <>
      {lines}
      <circle cx="50" cy="50" r="1.4" fill={color} />
    </>
  );
}

/* ─── isocube ──────────────────────────────────────────────────────────── */

function isocube(seed: number, color: string): React.ReactNode {
  const variant = seed % 3;
  const base = (
    <>
      <polygon points="50,20 80,35 80,65 50,80 20,65 20,35" stroke={color} strokeWidth="0.55" opacity="0.75" />
      <polyline points="20,35 50,50 80,35" stroke={color} strokeWidth="0.55" opacity="0.75" />
      <line x1="50" y1="50" x2="50" y2="80" stroke={color} strokeWidth="0.55" opacity="0.75" />
    </>
  );
  if (variant === 0) {
    return (
      <>
        {base}
        <circle cx="50" cy="50" r="1.2" fill={color} />
      </>
    );
  }
  if (variant === 1) {
    // Nested inner cube
    return (
      <>
        {base}
        <polygon points="50,32 68,41 68,59 50,68 32,59 32,41" stroke={color} strokeWidth="0.4" opacity="0.5" />
        <polyline points="32,41 50,50 68,41" stroke={color} strokeWidth="0.35" opacity="0.45" />
        <circle cx="50" cy="50" r="1.2" fill={color} />
      </>
    );
  }
  // Cluster: cube + two satellite cubes
  return (
    <>
      {base}
      <polygon points="18,22 26,26 26,34 18,38 10,34 10,26" stroke={color} strokeWidth="0.3" opacity="0.55" />
      <polygon points="82,66 90,70 90,78 82,82 74,78 74,70" stroke={color} strokeWidth="0.3" opacity="0.55" />
      <circle cx="50" cy="50" r="1.2" fill={color} />
    </>
  );
}

/* ─── concentric ───────────────────────────────────────────────────────── */

function concentric(seed: number, color: string): React.ReactNode {
  const variant = seed % 3;
  const ringCount = 5 + (seed % 3);
  const rings: number[] = [];
  if (variant === 0) {
    // Uniform
    for (let i = 0; i < ringCount; i++) rings.push(8 + i * (28 / ringCount));
  } else if (variant === 1) {
    // Log-spaced (tighter near center)
    for (let i = 0; i < ringCount; i++) rings.push(6 + Math.pow(i / ringCount, 1.5) * 30);
  } else {
    // Gapped: skip middle ring
    for (let i = 0; i < ringCount; i++) {
      if (i === Math.floor(ringCount / 2)) continue;
      rings.push(8 + i * (28 / ringCount));
    }
  }
  return (
    <>
      {rings.map((r, i) => (
        <circle
          key={i}
          cx="50"
          cy="50"
          r={r}
          stroke={color}
          strokeWidth="0.45"
          opacity={0.35 + (1 - i / rings.length) * 0.45}
        />
      ))}
      <circle cx="50" cy="50" r="1.6" fill={color} />
    </>
  );
}

/* ─── barcode ──────────────────────────────────────────────────────────── */

function barcode(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const bars: React.ReactNode[] = [];
  let x = 20;
  let key = 0;
  while (x < 82) {
    const w = 0.6 + rand() * 3;
    const gap = 0.8 + rand() * 2.2;
    bars.push(
      <rect key={key++} x={x} y="22" width={w} height="56" fill={color} opacity={0.55 + rand() * 0.4} />
    );
    x += w + gap;
  }
  return <>{bars}</>;
}

/* ─── targeting-ring ───────────────────────────────────────────────────── */

function targetingRing(_seed: number, color: string): React.ReactNode {
  return (
    <>
      <circle cx="50" cy="50" r="32" stroke={color} strokeWidth="0.5" opacity="0.8" />
      <circle cx="50" cy="50" r="22" stroke={color} strokeWidth="0.35" opacity="0.45" />
      <line x1="12" y1="50" x2="22" y2="50" stroke={color} strokeWidth="0.4" opacity="0.55" />
      <line x1="78" y1="50" x2="88" y2="50" stroke={color} strokeWidth="0.4" opacity="0.55" />
      <line x1="50" y1="12" x2="50" y2="22" stroke={color} strokeWidth="0.4" opacity="0.55" />
      <line x1="50" y1="78" x2="50" y2="88" stroke={color} strokeWidth="0.4" opacity="0.55" />
      <circle cx="50" cy="50" r="2.2" fill={color} />
    </>
  );
}

/* ─── threshold — doorway / portal with lintel ─────────────────────────── */

function threshold(seed: number, color: string): React.ReactNode {
  const variant = seed % 3;
  const gates = variant === 0 ? 1 : variant === 1 ? 2 : 3;
  const total = 50;
  const lintel = 22;
  const floor = 80;
  const halfWidth = 22;
  const elems: React.ReactNode[] = [];
  elems.push(
    <line key="l-top" x1={50 - halfWidth} y1={lintel} x2={50 + halfWidth} y2={lintel} stroke={color} strokeWidth="0.6" opacity="0.8" />,
    <line key="l-bot" x1={50 - halfWidth} y1={floor} x2={50 + halfWidth} y2={floor} stroke={color} strokeWidth="0.6" opacity="0.8" />
  );
  // Uprights
  const step = (halfWidth * 2) / gates;
  for (let i = 0; i <= gates; i++) {
    const x = 50 - halfWidth + i * step;
    elems.push(
      <line key={`u${i}`} x1={x} y1={lintel} x2={x} y2={floor} stroke={color} strokeWidth={i === 0 || i === gates ? "0.55" : "0.4"} opacity={i === 0 || i === gates ? "0.75" : "0.55"} />
    );
  }
  elems.push(<circle key="c" cx={total} cy={(lintel + floor) / 2} r="1.3" fill={color} />);
  return <>{elems}</>;
}

/* ─── codex — horizontal lamellae / strata ─────────────────────────────── */

function codex(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const variant = seed % 3;
  const elems: React.ReactNode[] = [];
  if (variant === 0) {
    // Uniform bands
    const count = 9;
    for (let i = 0; i < count; i++) {
      const y = 22 + i * (56 / (count - 1));
      const w = 56;
      elems.push(
        <line key={i} x1={50 - w / 2} y1={y} x2={50 + w / 2} y2={y} stroke={color} strokeWidth={i % 2 === 0 ? "0.6" : "0.3"} opacity={i % 2 === 0 ? "0.8" : "0.5"} />
      );
    }
  } else if (variant === 1) {
    // Tapered — narrow top, wide bottom
    const count = 11;
    for (let i = 0; i < count; i++) {
      const y = 22 + i * (56 / (count - 1));
      const w = 18 + (i / (count - 1)) * 46;
      elems.push(
        <line key={i} x1={50 - w / 2} y1={y} x2={50 + w / 2} y2={y} stroke={color} strokeWidth="0.4" opacity="0.65" />
      );
    }
  } else {
    // Grouped — 3 bands of lamellae
    for (let g = 0; g < 3; g++) {
      const yBase = 25 + g * 18;
      for (let i = 0; i < 4; i++) {
        const y = yBase + i * 3;
        const w = 46 + rand() * 6;
        elems.push(
          <line key={`${g}-${i}`} x1={50 - w / 2} y1={y} x2={50 + w / 2} y2={y} stroke={color} strokeWidth="0.35" opacity={0.4 + rand() * 0.4} />
        );
      }
    }
  }
  return <>{elems}</>;
}

/* ─── spiral ───────────────────────────────────────────────────────────── */

function spiral(seed: number, color: string): React.ReactNode {
  const variant = seed % 3;
  const pts: string[] = [];
  if (variant === 0) {
    // Logarithmic
    for (let i = 0; i < 320; i++) {
      const t = i / 40;
      const r = 1.2 * Math.exp(0.15 * t);
      if (r > 36) break;
      const a = t;
      pts.push(`${50 + Math.cos(a) * r},${50 + Math.sin(a) * r}`);
    }
  } else if (variant === 1) {
    // Archimedean
    for (let i = 0; i < 400; i++) {
      const t = i / 20;
      const r = 1 + t * 1.05;
      if (r > 36) break;
      pts.push(`${50 + Math.cos(t) * r},${50 + Math.sin(t) * r}`);
    }
  } else {
    // Double spiral (two arms, mirror)
    const a: string[] = [];
    const b: string[] = [];
    for (let i = 0; i < 260; i++) {
      const t = i / 30;
      const r = 1 + t * 1.3;
      if (r > 34) break;
      a.push(`${50 + Math.cos(t) * r},${50 + Math.sin(t) * r}`);
      b.push(`${50 - Math.cos(t) * r},${50 - Math.sin(t) * r}`);
    }
    return (
      <>
        <polyline points={a.join(" ")} stroke={color} strokeWidth="0.5" opacity="0.75" />
        <polyline points={b.join(" ")} stroke={color} strokeWidth="0.5" opacity="0.75" />
        <circle cx="50" cy="50" r="1.4" fill={color} />
      </>
    );
  }
  return (
    <>
      <polyline points={pts.join(" ")} stroke={color} strokeWidth="0.5" opacity="0.8" />
      <circle cx="50" cy="50" r="1.4" fill={color} />
    </>
  );
}

/* ─── constellation ────────────────────────────────────────────────────── */

function constellation(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const count = [5, 7, 9][seed % 3];
  const pts: [number, number][] = [];
  // Scatter points on a disc, reject too-close
  let attempts = 0;
  while (pts.length < count && attempts < count * 40) {
    attempts++;
    const a = rand() * Math.PI * 2;
    const r = 8 + rand() * 30;
    const x = 50 + Math.cos(a) * r;
    const y = 50 + Math.sin(a) * r;
    const tooClose = pts.some(([px, py]) => Math.hypot(px - x, py - y) < 10);
    if (!tooClose) pts.push([x, y]);
  }
  // Connect each point to nearest neighbor (tree-ish, no duplicates)
  const edges: [number, number][] = [];
  for (let i = 1; i < pts.length; i++) {
    let best = 0;
    let bestD = Infinity;
    for (let j = 0; j < i; j++) {
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    edges.push([i, best]);
  }
  return (
    <>
      {edges.map(([a, b], i) => (
        <line
          key={`e${i}`}
          x1={pts[a][0]} y1={pts[a][1]} x2={pts[b][0]} y2={pts[b][1]}
          stroke={color} strokeWidth="0.3" opacity="0.45"
        />
      ))}
      {pts.map(([x, y], i) => (
        <g key={`s${i}`}>
          <circle cx={x} cy={y} r="1.4" fill={color} opacity="0.95" />
          <circle cx={x} cy={y} r="3.2" fill="none" stroke={color} strokeWidth="0.25" opacity="0.35" />
        </g>
      ))}
    </>
  );
}

/* ─── lattice-weave ────────────────────────────────────────────────────── */

function latticeWeave(seed: number, color: string): React.ReactNode {
  const variant = seed % 2;
  const divisions = variant === 0 ? 3 : 4;
  const sz = 52;
  const x0 = 50 - sz / 2;
  const y0 = 50 - sz / 2;
  const step = sz / divisions;
  const GAP = 2.5; // at crossings, gap to suggest weave

  const elems: React.ReactNode[] = [];
  // Horizontal strands (broken over vertical strands)
  for (let r = 0; r <= divisions; r++) {
    const y = y0 + r * step;
    const segments: [number, number][] = [];
    let cur = x0;
    for (let c = 0; c <= divisions; c++) {
      const cx = x0 + c * step;
      if ((r + c) % 2 === 0) {
        // this horizontal runs OVER vertical — unbroken here
        continue;
      }
      // Horizontal runs UNDER — break around the vertical
      segments.push([cur, cx - GAP]);
      cur = cx + GAP;
    }
    segments.push([cur, x0 + sz]);
    for (let i = 0; i < segments.length; i++) {
      elems.push(
        <line key={`h${r}-${i}`} x1={segments[i][0]} y1={y} x2={segments[i][1]} y2={y} stroke={color} strokeWidth="0.5" opacity="0.75" />
      );
    }
  }
  // Vertical strands
  for (let c = 0; c <= divisions; c++) {
    const x = x0 + c * step;
    const segments: [number, number][] = [];
    let cur = y0;
    for (let r = 0; r <= divisions; r++) {
      const cy = y0 + r * step;
      if ((r + c) % 2 === 0) continue;
      segments.push([cur, cy - GAP]);
      cur = cy + GAP;
    }
    segments.push([cur, y0 + sz]);
    for (let i = 0; i < segments.length; i++) {
      elems.push(
        <line key={`v${c}-${i}`} x1={x} y1={segments[i][0]} x2={x} y2={segments[i][1]} stroke={color} strokeWidth="0.5" opacity="0.75" />
      );
    }
  }
  return <>{elems}</>;
}

/* ─── dendrite — binary branching tree ─────────────────────────────────── */

function dendrite(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const variant = seed % 3;
  const lines: React.ReactNode[] = [];
  const MAX_DEPTH = [3, 4, 4][variant];
  const INITIAL_LEN = [18, 15, 12][variant];
  const ANGLE_SPREAD = [Math.PI / 3, Math.PI / 3.2, Math.PI / 2.6][variant];

  function branch(x: number, y: number, len: number, angle: number, depth: number, key: string) {
    if (depth > MAX_DEPTH) return;
    const x2 = x + Math.cos(angle) * len;
    const y2 = y + Math.sin(angle) * len;
    const op = 0.9 - depth * 0.15;
    lines.push(
      <line key={key} x1={x} y1={y} x2={x2} y2={y2} stroke={color} strokeWidth={Math.max(0.25, 0.8 - depth * 0.15)} opacity={op} />
    );
    const jitter = (rand() - 0.5) * 0.2;
    branch(x2, y2, len * 0.7, angle - ANGLE_SPREAD / 2 + jitter, depth + 1, key + "L");
    branch(x2, y2, len * 0.7, angle + ANGLE_SPREAD / 2 + jitter, depth + 1, key + "R");
  }

  if (variant === 1) {
    // Radial — 4 initial branches
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
      branch(50, 50, INITIAL_LEN, a, 0, `r${i}`);
    }
    lines.push(<circle key="c" cx="50" cy="50" r="1.4" fill={color} />);
  } else {
    // Rooted from bottom-center going up
    branch(50, 80, INITIAL_LEN, -Math.PI / 2, 0, "t");
    lines.push(<circle key="c" cx="50" cy="80" r="1.2" fill={color} />);
  }
  return <>{lines}</>;
}

/* ─── eclipse — two overlapping circles ────────────────────────────────── */

function eclipse(seed: number, color: string): React.ReactNode {
  const variant = seed % 3;
  const elems: React.ReactNode[] = [];
  if (variant === 0) {
    // Partial: sun + moon sliding in
    elems.push(
      <circle key="sun" cx="44" cy="50" r="22" stroke={color} strokeWidth="0.5" opacity="0.7" />
    );
    elems.push(
      <circle key="moon" cx="60" cy="50" r="22" fill={color} fillOpacity="0.9" />
    );
  } else if (variant === 1) {
    // Total: moon centered
    elems.push(
      <circle key="sun" cx="50" cy="50" r="26" stroke={color} strokeWidth="0.5" opacity="0.7" />
    );
    elems.push(
      <circle key="moon" cx="50" cy="50" r="22" fill={color} fillOpacity="0.92" />
    );
    // Corona rays
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      elems.push(
        <line
          key={`r${i}`}
          x1={50 + Math.cos(a) * 27}
          y1={50 + Math.sin(a) * 27}
          x2={50 + Math.cos(a) * 34}
          y2={50 + Math.sin(a) * 34}
          stroke={color}
          strokeWidth="0.4"
          opacity="0.55"
        />
      );
    }
  } else {
    // Annular — inner circle smaller than outer
    elems.push(
      <circle key="sun" cx="50" cy="50" r="28" stroke={color} strokeWidth="0.5" opacity="0.75" />
    );
    elems.push(
      <circle key="moon" cx="50" cy="50" r="18" fill={color} fillOpacity="0.9" />
    );
    elems.push(
      <circle key="inner" cx="50" cy="50" r="18" stroke={color} strokeWidth="0.25" opacity="0.4" />
    );
  }
  return <>{elems}</>;
}

/* ─── phase-moon — 5 phases ────────────────────────────────────────────── */

function phaseMoon(seed: number, color: string): React.ReactNode {
  const phase = seed % 5; // 0=new, 1=crescent, 2=quarter, 3=gibbous, 4=full
  const R = 28;
  // Circle outline always visible
  const outline = (
    <circle cx="50" cy="50" r={R} stroke={color} strokeWidth="0.5" opacity="0.75" />
  );
  if (phase === 0) {
    // New moon — just outline
    return (
      <>
        {outline}
        <circle cx="50" cy="50" r="0.8" fill={color} opacity="0.4" />
      </>
    );
  }
  if (phase === 4) {
    // Full
    return (
      <>
        {outline}
        <circle cx="50" cy="50" r={R} fill={color} fillOpacity="0.85" />
      </>
    );
  }
  // Intermediate: create crescent via two arcs
  const fracs = [0.25, 0.5, 0.75];
  const illuminated = fracs[phase - 1];
  // Offset circle creates crescent via difference — approximate with clip path
  const shift = R * (1 - 2 * illuminated);
  return (
    <>
      <defs>
        <mask id={`m-${seed}`}>
          <rect x="0" y="0" width="100" height="100" fill="black" />
          <circle cx="50" cy="50" r={R} fill="white" />
          <circle cx={50 + shift} cy="50" r={R} fill="black" />
        </mask>
      </defs>
      <circle cx="50" cy="50" r={R} fill={color} fillOpacity="0.85" mask={`url(#m-${seed})`} />
      {outline}
    </>
  );
}

/* ─── waveform ─────────────────────────────────────────────────────────── */

function waveform(seed: number, color: string): React.ReactNode {
  const variant = seed % 3;
  const pts: string[] = [];
  const N = 200;
  if (variant === 0) {
    // Pure sine
    for (let i = 0; i < N; i++) {
      const x = 15 + (i / (N - 1)) * 70;
      const t = (i / (N - 1)) * Math.PI * 4;
      const y = 50 + Math.sin(t) * 18;
      pts.push(`${x},${y}`);
    }
  } else if (variant === 1) {
    // Damped sine
    for (let i = 0; i < N; i++) {
      const x = 15 + (i / (N - 1)) * 70;
      const t = (i / (N - 1)) * Math.PI * 6;
      const decay = Math.exp(-t * 0.18);
      const y = 50 + Math.sin(t) * 22 * decay;
      pts.push(`${x},${y}`);
    }
  } else {
    // Composite (sine + octave)
    for (let i = 0; i < N; i++) {
      const x = 15 + (i / (N - 1)) * 70;
      const t = (i / (N - 1)) * Math.PI * 4;
      const y = 50 + Math.sin(t) * 14 + Math.sin(t * 3) * 5;
      pts.push(`${x},${y}`);
    }
  }
  return (
    <>
      {/* Baseline */}
      <line x1="15" y1="50" x2="85" y2="50" stroke={color} strokeWidth="0.25" opacity="0.35" strokeDasharray="1,2" />
      <polyline points={pts.join(" ")} stroke={color} strokeWidth="0.6" fill="none" opacity="0.9" />
      <circle cx="15" cy="50" r="1" fill={color} opacity="0.8" />
      <circle cx="85" cy="50" r="1" fill={color} opacity="0.8" />
    </>
  );
}

/* ─── orbit-diagram ────────────────────────────────────────────────────── */

function orbitDiagram(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const variant = seed % 3;
  const elems: React.ReactNode[] = [];
  const orbits = variant === 2 ? 2 : variant === 1 ? 3 : 2;
  const tilt = variant === 2 ? 25 : 0;
  for (let i = 0; i < orbits; i++) {
    const r = 12 + i * 12;
    const ry = r * (variant === 0 ? 0.4 : variant === 1 ? 0.35 : 0.38);
    elems.push(
      <ellipse
        key={`o${i}`}
        cx="50"
        cy="50"
        rx={r}
        ry={ry}
        stroke={color}
        strokeWidth="0.4"
        opacity={0.6 - i * 0.08}
        transform={tilt ? `rotate(${tilt} 50 50)` : undefined}
      />
    );
    // Planet dot on orbit
    const a = rand() * Math.PI * 2;
    const px = 50 + Math.cos(a) * r;
    const py = 50 + Math.sin(a) * ry;
    if (tilt) {
      const rad = (tilt * Math.PI) / 180;
      const rx2 = 50 + (px - 50) * Math.cos(rad) - (py - 50) * Math.sin(rad);
      const ry2 = 50 + (px - 50) * Math.sin(rad) + (py - 50) * Math.cos(rad);
      elems.push(<circle key={`p${i}`} cx={rx2} cy={ry2} r="1.2" fill={color} />);
    } else {
      elems.push(<circle key={`p${i}`} cx={px} cy={py} r="1.2" fill={color} />);
    }
  }
  // Central star
  elems.push(<circle key="star" cx="50" cy="50" r="2.2" fill={color} />);
  elems.push(
    <circle key="halo" cx="50" cy="50" r="4" fill="none" stroke={color} strokeWidth="0.25" opacity="0.4" />
  );
  return <>{elems}</>;
}

/* ─── compass-rose ─────────────────────────────────────────────────────── */

function compassRose(seed: number, color: string): React.ReactNode {
  const variant = seed % 3;
  const major = variant === 0 ? 4 : variant === 1 ? 8 : 16;
  const minor = variant === 0 ? 12 : variant === 1 ? 16 : 0;
  const outerR = 34;
  const innerR = 22;
  const elems: React.ReactNode[] = [];
  elems.push(
    <circle key="r1" cx="50" cy="50" r={outerR} stroke={color} strokeWidth="0.35" opacity="0.45" />,
    <circle key="r2" cx="50" cy="50" r={innerR} stroke={color} strokeWidth="0.25" opacity="0.35" />
  );
  // Major points — diamond spikes
  for (let i = 0; i < major; i++) {
    const a = (i / major) * Math.PI * 2 - Math.PI / 2;
    const tipX = 50 + Math.cos(a) * outerR;
    const tipY = 50 + Math.sin(a) * outerR;
    const sideA1 = a + Math.PI / 2;
    const sideA2 = a - Math.PI / 2;
    const base = 4;
    const leftX = 50 + Math.cos(sideA1) * base;
    const leftY = 50 + Math.sin(sideA1) * base;
    const rightX = 50 + Math.cos(sideA2) * base;
    const rightY = 50 + Math.sin(sideA2) * base;
    elems.push(
      <polygon
        key={`M${i}`}
        points={`${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`}
        stroke={color}
        strokeWidth="0.35"
        opacity={i % 2 === 0 ? "0.85" : "0.55"}
      />
    );
  }
  // Minor ticks
  for (let i = 0; i < minor; i++) {
    const a = (i / minor) * Math.PI * 2 - Math.PI / 2 + Math.PI / minor;
    elems.push(
      <line
        key={`m${i}`}
        x1={50 + Math.cos(a) * (outerR - 2)}
        y1={50 + Math.sin(a) * (outerR - 2)}
        x2={50 + Math.cos(a) * outerR}
        y2={50 + Math.sin(a) * outerR}
        stroke={color}
        strokeWidth="0.3"
        opacity="0.55"
      />
    );
  }
  elems.push(<circle key="c" cx="50" cy="50" r="1.5" fill={color} />);
  return <>{elems}</>;
}

/* ─── vesica ───────────────────────────────────────────────────────────── */

function vesica(seed: number, color: string): React.ReactNode {
  const variant = seed % 2;
  const R = 22;
  const offset = R * 0.75;
  if (variant === 0) {
    // Horizontal pair
    return (
      <>
        <circle cx={50 - offset} cy="50" r={R} stroke={color} strokeWidth="0.5" opacity="0.75" />
        <circle cx={50 + offset} cy="50" r={R} stroke={color} strokeWidth="0.5" opacity="0.75" />
        <circle cx={50 - offset} cy="50" r="1.2" fill={color} opacity="0.8" />
        <circle cx={50 + offset} cy="50" r="1.2" fill={color} opacity="0.8" />
        <circle cx="50" cy="50" r="1.6" fill={color} />
      </>
    );
  }
  // Vertical pair
  return (
    <>
      <circle cx="50" cy={50 - offset} r={R} stroke={color} strokeWidth="0.5" opacity="0.75" />
      <circle cx="50" cy={50 + offset} r={R} stroke={color} strokeWidth="0.5" opacity="0.75" />
      <circle cx="50" cy={50 - offset} r="1.2" fill={color} opacity="0.8" />
      <circle cx="50" cy={50 + offset} r="1.2" fill={color} opacity="0.8" />
      <circle cx="50" cy="50" r="1.6" fill={color} />
    </>
  );
}

/* ─── crosshatch ───────────────────────────────────────────────────────── */

function crosshatch(seed: number, color: string): React.ReactNode {
  const variant = seed % 3;
  const lines: React.ReactNode[] = [];
  const sz = 52;
  const x0 = 50 - sz / 2;
  const y0 = 50 - sz / 2;
  // Bounding square
  lines.push(
    <rect key="b" x={x0} y={y0} width={sz} height={sz} stroke={color} strokeWidth="0.35" opacity="0.4" />
  );
  // Diagonals
  const step = variant === 0 ? 5 : variant === 1 ? 4 : 6;
  // Down-right diagonals
  for (let i = -sz; i <= sz; i += step) {
    const x1 = x0 + Math.max(0, i);
    const y1 = y0 + Math.max(0, -i);
    const x2 = x0 + Math.min(sz, sz + i);
    const y2 = y0 + Math.min(sz, sz - i);
    lines.push(
      <line key={`a${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="0.3" opacity="0.5" />
    );
  }
  if (variant !== 2) {
    // Up-right diagonals (second direction)
    for (let i = -sz; i <= sz; i += step) {
      const x1 = x0 + Math.max(0, i);
      const y1 = y0 + sz - Math.max(0, -i);
      const x2 = x0 + Math.min(sz, sz + i);
      const y2 = y0 + sz - Math.min(sz, sz - i);
      lines.push(
        <line key={`b${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="0.3" opacity="0.5" />
      );
    }
  }
  return <>{lines}</>;
}

/* ─── meridian — curved parallels ──────────────────────────────────────── */

function meridian(seed: number, color: string): React.ReactNode {
  const variant = seed % 3;
  const count = variant === 0 ? 5 : variant === 1 ? 7 : 9;
  const R = 32;
  const elems: React.ReactNode[] = [];
  // Sphere outline
  elems.push(
    <circle key="s" cx="50" cy="50" r={R} stroke={color} strokeWidth="0.4" opacity="0.5" />
  );
  // Horizontal parallels — arcs whose ry = R * |sin(angle)|
  for (let i = 0; i < count; i++) {
    const frac = (i + 1) / (count + 1); // 0..1
    const phi = frac * Math.PI; // 0..π — latitude
    const y = 50 - Math.cos(phi) * R;
    const rx = Math.sin(phi) * R;
    const ry = rx * 0.25;
    elems.push(
      <ellipse key={`p${i}`} cx="50" cy={y} rx={rx} ry={ry} stroke={color} strokeWidth="0.3" opacity="0.65" />
    );
  }
  // Equator emphasized
  elems.push(
    <line key="eq" x1={50 - R} y1="50" x2={50 + R} y2="50" stroke={color} strokeWidth="0.35" opacity="0.55" />
  );
  // Central axis
  elems.push(
    <line key="ax" x1="50" y1={50 - R} x2="50" y2={50 + R} stroke={color} strokeWidth="0.25" opacity="0.4" strokeDasharray="1,1.5" />
  );
  return <>{elems}</>;
}

/* ─── halftone — density gradient of dots ──────────────────────────────── */

function halftone(seed: number, color: string): React.ReactNode {
  const variant = seed % 3;
  const dots: React.ReactNode[] = [];
  const step = 4.5;
  const x0 = 18, x1 = 82, y0 = 18, y1 = 82;
  let key = 0;
  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      const dx = x - 50;
      const dy = y - 50;
      const d = Math.hypot(dx, dy);
      let size: number;
      if (variant === 0) {
        // Radial (dense center)
        size = Math.max(0, 2.2 - d / 18);
      } else if (variant === 1) {
        // Linear (dark left → light right)
        size = Math.max(0, 2.2 - (x - x0) / 30);
      } else {
        // Inverse radial (sparse center, dense at edge)
        size = Math.max(0, (d - 6) / 22);
      }
      if (size > 0.15) {
        dots.push(<circle key={key++} cx={x} cy={y} r={size} fill={color} opacity="0.85" />);
      }
    }
  }
  return <>{dots}</>;
}
