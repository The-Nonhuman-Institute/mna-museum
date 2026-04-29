/**
 * MNAGlyph — the Museum's procedural visual-identity library.
 *
 * Each "family" is a compositional grammar (radial dust, polyhedral lattice,
 * orbital diagram, etc.) rendered procedurally from a deterministic seed.
 * Same family + same seed → same glyph, always. Families share a visual
 * language: thin white line-work on black, centered composition, geometric
 * construction visible, negative space dominant.
 *
 * Every family applies within-variant perturbation (rotation, scale, count,
 * jitter, density) derived from the higher bits of its seed so that two
 * seeds hashing to the same `seed % N` still render distinct glyphs.
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

/* Derive secondary values from higher seed bits for within-variant variety.
   Uses bit-shifts rather than mulberry32 so values stay stable and easy to
   reason about — every family can pull the same named knobs. */
function knobs(seed: number) {
  /* Use unsigned right shift (>>>) so large hashes don't go negative. */
  return {
    rot: (((seed >>> 2) % 360) * Math.PI) / 180,            // 0..2π
    rotDeg: (seed >>> 2) % 360,                             // 0..359
    scale: 0.90 + (((seed >>> 8) % 100) / 100) * 0.18,      // 0.90..1.08
    density: 0.75 + (((seed >>> 12) % 100) / 100) * 0.50,   // 0.75..1.25
    alt: (seed >>> 16) % 5,                                 // 0..4
    swirl: (((seed >>> 20) % 100) - 50) / 100,              // -0.5..0.5
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
  | "halftone"
  | "glitch"
  | "phaze"
  | "fracture";

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
  "glitch":           { key: "glitch",           label: "Glitch",           category: "signal",     description: "Displacement and signal slippage." },
  "phaze":            { key: "phaze",            label: "Phaze",            category: "signal",     description: "Phase interference and beating." },
  "fracture":         { key: "fracture",         label: "Fracture",         category: "organic",    description: "Impact radial crack network." },
};

export const ALL_FAMILIES = Object.keys(GLYPH_FAMILIES) as GlyphFamily[];

/** Deterministically pick a family from a string seed. */
export function pickFamily(seed: string): GlyphFamily {
  const h = hashSeed(`family::${seed}`);
  return ALL_FAMILIES[h % ALL_FAMILIES.length];
}

/* ─── Public component ─────────────────────────────────────────────────── */

export interface MNAGlyphProps {
  family: GlyphFamily;
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
  const body = RENDERERS[family](n, color);
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

type Renderer = (seed: number, color: string) => React.ReactNode;

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
  "glitch":           glitch,
  "phaze":            phaze,
  "fracture":         fracture,
};

/* Wrap an element tree in a rotation transform around (50,50). */
function Rot({ deg, children }: { deg: number; children: React.ReactNode }) {
  if (deg === 0) return <>{children}</>;
  return <g transform={`rotate(${deg} 50 50)`}>{children}</g>;
}

/* ═══════════════════════════════════════════════════════════════════════ */
/*  FAMILIES                                                                */
/* ═══════════════════════════════════════════════════════════════════════ */

/* ─── particle-cloud ───────────────────────────────────────────────────── */

function particleCloud(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const variant = seed % 4;
  const pts: { x: number; y: number; r: number; op: number }[] = [];

  if (variant === 0) {
    for (let i = 0; i < 260; i++) {
      const r = Math.pow(rand(), 0.6) * 42;
      const a = rand() * Math.PI * 2;
      pts.push({ x: 50 + Math.cos(a) * r, y: 50 + Math.sin(a) * r, r: 0.3 + rand() * 0.6, op: 0.4 + (1 - r / 42) * 0.6 });
    }
  } else if (variant === 1) {
    const rings = 3 + (seed % 3);
    for (let ri = 0; ri < rings; ri++) {
      const r = 10 + ri * 10 + rand() * 3;
      const count = 40 + Math.floor(r * 2);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + rand() * 0.2;
        const jitter = rand() * 1.5;
        pts.push({ x: 50 + Math.cos(a) * (r + jitter), y: 50 + Math.sin(a) * (r + jitter), r: 0.3 + rand() * 0.4, op: 0.5 + rand() * 0.35 });
      }
    }
    for (let i = 0; i < 40; i++) {
      const a = rand() * Math.PI * 2;
      const r = rand() * 4;
      pts.push({ x: 50 + Math.cos(a) * r, y: 50 + Math.sin(a) * r, r: 0.4 + rand() * 0.6, op: 0.9 });
    }
  } else if (variant === 2) {
    const arms = 3 + Math.floor(rand() * 3);
    for (let ai = 0; ai < arms; ai++) {
      const baseA = (ai / arms) * Math.PI * 2 + rand() * 0.3;
      for (let i = 0; i < 50; i++) {
        const t = i / 50;
        const r = t * 40;
        const a = baseA + (rand() - 0.5) * 0.6 + t * 0.5;
        pts.push({ x: 50 + Math.cos(a) * r, y: 50 + Math.sin(a) * r, r: 0.25 + rand() * 0.5, op: 0.4 + (1 - t) * 0.5 });
      }
    }
  } else {
    const a1 = 1 + (seed % 3);
    const a2 = 2 + ((seed >> 2) % 3);
    const phase = (seed % 100) / 100;
    for (let i = 0; i < 300; i++) {
      const t = (i / 300) * Math.PI * 2;
      pts.push({ x: 50 + Math.sin(a1 * t + phase) * 36, y: 50 + Math.sin(a2 * t) * 36, r: 0.35, op: 0.75 });
    }
  }

  return pts.map((p, i) => (
    <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={color} opacity={p.op} />
  ));
}

/* ─── polyhedron ───────────────────────────────────────────────────────── */

function polyhedron(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const k = knobs(seed);
  const family = seed % 4;
  const lines: [number, number, number, number][] = [];
  const dots: [number, number][] = [];
  const cx = 50, cy = 50, R = 32 * k.scale;
  const depth = 0.22 + (((seed >> 12) % 100) / 100) * 0.22;
  const depthA = ((seed >> 4) % 360) * (Math.PI / 180);
  const dx = Math.cos(depthA) * depth;
  const dy = Math.sin(depthA) * depth;

  if (family === 0) {
    // Octahedron, depth vertices displace along random direction
    const verts: [number, number][] = [
      [cx, cy - R], [cx, cy + R], [cx - R, cy], [cx + R, cy],
      [cx - R * dx * 2, cy - R * dy * 2], [cx + R * dx * 2, cy + R * dy * 2],
    ];
    for (let i = 0; i < verts.length; i++)
      for (let j = i + 1; j < verts.length; j++)
        lines.push([verts[i][0], verts[i][1], verts[j][0], verts[j][1]]);
    dots.push(...verts);
  } else if (family === 1) {
    // Cube with variable back-face offset
    const front: [number, number][] = [
      [cx - R * 0.7, cy - R * 0.7], [cx + R * 0.7, cy - R * 0.7],
      [cx + R * 0.7, cy + R * 0.7], [cx - R * 0.7, cy + R * 0.7],
    ];
    const back: [number, number][] = front.map(([x, y]) => [x + R * dx, y + R * dy]);
    for (let i = 0; i < 4; i++) {
      const ni = (i + 1) % 4;
      lines.push([front[i][0], front[i][1], front[ni][0], front[ni][1]]);
      lines.push([back[i][0], back[i][1], back[ni][0], back[ni][1]]);
      lines.push([front[i][0], front[i][1], back[i][0], back[i][1]]);
    }
    dots.push(...front, ...back);
  } else if (family === 2) {
    // Icosahedral star, variable chord skip
    const count = 12;
    const skip = 3 + ((seed >> 6) % 3); // 3, 4, or 5
    const verts: [number, number][] = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 - Math.PI / 2;
      verts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
    }
    for (let i = 0; i < count; i++) {
      const j = (i + skip) % count;
      lines.push([verts[i][0], verts[i][1], verts[j][0], verts[j][1]]);
    }
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      lines.push([verts[i][0], verts[i][1], verts[j][0], verts[j][1]]);
    }
    dots.push(...verts);
  } else {
    // Cuboctahedron, variable inner rotation
    const innerRot = (((seed >> 10) % 100) / 100) * (Math.PI / 2);
    const outer: [number, number][] = [];
    const inner: [number, number][] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      outer.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 - Math.PI / 4 + innerRot;
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
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      lines.push([inner[i][0], inner[i][1], inner[j][0], inner[j][1]]);
    }
    dots.push(...outer, ...inner);
  }

  const jittered = dots.map(([x, y]) => [x + (rand() - 0.5) * 0.6, y + (rand() - 0.5) * 0.6] as [number, number]);

  return (
    <Rot deg={k.rotDeg}>
      {lines.map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="0.4" opacity="0.55" />
      ))}
      {jittered.map(([x, y], i) => (
        <circle key={`d${i}`} cx={x} cy={y} r="1" fill={color} opacity="0.85" />
      ))}
      <circle cx={cx} cy={cy} r="1.2" fill={color} />
    </Rot>
  );
}

/* ─── fractured-disc ───────────────────────────────────────────────────── */

function fracturedDisc(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const cuts = 2 + (seed % 3);
  const rotOffset = rand() * Math.PI;
  const baseAngles = Array.from({ length: cuts }, (_, i) => (i * Math.PI) / cuts + rotOffset);
  const angles = baseAngles.map((a) => a + (rand() - 0.5) * 0.4);
  const R = 32 + rand() * 4;

  return (
    <>
      <defs>
        <radialGradient id={`keep-${seed}`} cx={`${42 + rand() * 16}%`} cy={`${38 + rand() * 14}%`}>
          <stop offset="0%" stopColor={color} stopOpacity="0.14" />
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
          strokeWidth={1.8 + rand() * 0.8}
          opacity={0.82 + rand() * 0.15}
        />
      ))}
      <circle cx="50" cy="50" r="1.8" fill={color} />
    </>
  );
}

/* ─── starburst ────────────────────────────────────────────────────────── */

function starburst(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const count = [72, 96, 120, 144][seed % 4];
  const k = knobs(seed);
  const spokes: React.ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + k.rot + rand() * 0.05;
    const len = 10 + rand() * 30;
    spokes.push(
      <line key={i} x1="50" y1="50" x2={50 + Math.cos(a) * len} y2={50 + Math.sin(a) * len} stroke={color} strokeWidth={0.25 + rand() * 0.25} opacity={0.3 + rand() * 0.6} />
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
  const k = knobs(seed);
  const count = [120, 160, 200][seed % 3];
  const longEvery = [6, 8, 10, 12][(seed >> 3) % 4];
  const longLen = 30 + rand() * 8;
  const spokes: React.ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + k.rot;
    const long = i % longEvery === 0;
    const len = long ? longLen : 10 + rand() * 12;
    spokes.push(
      <line key={i} x1="50" y1="50" x2={50 + Math.cos(a) * len} y2={50 + Math.sin(a) * len} stroke={color} strokeWidth="0.3" opacity={long ? 0.9 : 0.3 + rand() * 0.3} />
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
  const rand = mulberry32(seed);
  const divisions = 2 + (seed % 4); // 2,3,4,5
  const sz = 44 + rand() * 6;
  const x = 50 - sz / 2;
  const y = 50 - sz / 2;
  const step = sz / divisions;
  const diag = ((seed >> 5) % 3); // 0=none, 1=one diag, 2=both diagonals
  const cellMarks = ((seed >> 9) % 3) === 0; // sometimes dot in each cell
  const tilt = (((seed >> 11) % 100) - 50) / 100 * 12; // -6..6°

  const elems: React.ReactNode[] = [];
  elems.push(<rect key="r" x={x} y={y} width={sz} height={sz} stroke={color} strokeWidth="0.5" opacity="0.75" />);
  for (let i = 1; i < divisions; i++) {
    elems.push(
      <line key={`h${i}`} x1={x} y1={y + i * step} x2={x + sz} y2={y + i * step} stroke={color} strokeWidth="0.4" opacity="0.45" />,
      <line key={`v${i}`} x1={x + i * step} y1={y} x2={x + i * step} y2={y + sz} stroke={color} strokeWidth="0.4" opacity="0.45" />
    );
  }
  if (diag >= 1) {
    elems.push(<line key="d1" x1={x} y1={y} x2={x + sz} y2={y + sz} stroke={color} strokeWidth="0.3" opacity="0.35" />);
  }
  if (diag === 2) {
    elems.push(<line key="d2" x1={x + sz} y1={y} x2={x} y2={y + sz} stroke={color} strokeWidth="0.3" opacity="0.35" />);
  }
  if (cellMarks) {
    for (let r = 0; r < divisions; r++) {
      for (let c = 0; c < divisions; c++) {
        elems.push(
          <circle key={`m${r}-${c}`} cx={x + (c + 0.5) * step} cy={y + (r + 0.5) * step} r="0.5" fill={color} opacity="0.45" />
        );
      }
    }
  }
  elems.push(<circle key="core" cx="50" cy="50" r="1.4" fill={color} />);
  return <Rot deg={tilt}>{elems}</Rot>;
}

/* ─── isocube ──────────────────────────────────────────────────────────── */

function isocube(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const k = knobs(seed);
  const variant = seed % 4;
  // Scaled cube geometry — varies per seed
  const w = 30 * k.scale;
  const hh = 15 * k.scale;
  const vh = 30 * k.scale;
  // Build main cube from center (50,50)
  const pts = {
    top:   [50, 50 - vh] as [number, number],
    right: [50 + w, 50 - hh] as [number, number],
    br:    [50 + w, 50 + hh] as [number, number],
    bot:   [50, 50 + vh] as [number, number],
    bl:    [50 - w, 50 + hh] as [number, number],
    left:  [50 - w, 50 - hh] as [number, number],
    ctr:   [50, 50] as [number, number],
  };
  const hex = `${pts.top[0]},${pts.top[1]} ${pts.right[0]},${pts.right[1]} ${pts.br[0]},${pts.br[1]} ${pts.bot[0]},${pts.bot[1]} ${pts.bl[0]},${pts.bl[1]} ${pts.left[0]},${pts.left[1]}`;
  const base = (
    <>
      <polygon points={hex} stroke={color} strokeWidth="0.55" opacity="0.75" />
      <polyline points={`${pts.left[0]},${pts.left[1]} ${pts.ctr[0]},${pts.ctr[1]} ${pts.right[0]},${pts.right[1]}`} stroke={color} strokeWidth="0.5" opacity="0.75" />
      <line x1={pts.ctr[0]} y1={pts.ctr[1]} x2={pts.bot[0]} y2={pts.bot[1]} stroke={color} strokeWidth="0.5" opacity="0.75" />
    </>
  );

  let extra: React.ReactNode = null;
  if (variant === 1) {
    // Nested inner cube at 60% scale
    const s = 0.6;
    const iw = w * s, ihh = hh * s, ivh = vh * s;
    extra = (
      <>
        <polygon points={`50,${50 - ivh} ${50 + iw},${50 - ihh} ${50 + iw},${50 + ihh} 50,${50 + ivh} ${50 - iw},${50 + ihh} ${50 - iw},${50 - ihh}`} stroke={color} strokeWidth="0.4" opacity="0.5" />
        <polyline points={`${50 - iw},${50 - ihh} 50,50 ${50 + iw},${50 - ihh}`} stroke={color} strokeWidth="0.35" opacity="0.45" />
      </>
    );
  } else if (variant === 2) {
    // Two satellite cubes at random corner offsets
    const ang1 = rand() * Math.PI * 2;
    const ang2 = ang1 + Math.PI + (rand() - 0.5) * 0.6;
    const dist = 26 + rand() * 6;
    const mini = (cx: number, cy: number, key: string, s: number) => {
      const mw = 8 * s, mh = 4 * s, mv = 8 * s;
      return (
        <polygon
          key={key}
          points={`${cx},${cy - mv} ${cx + mw},${cy - mh} ${cx + mw},${cy + mh} ${cx},${cy + mv} ${cx - mw},${cy + mh} ${cx - mw},${cy - mh}`}
          stroke={color} strokeWidth="0.3" opacity="0.55"
        />
      );
    };
    extra = (
      <>
        {mini(50 + Math.cos(ang1) * dist, 50 + Math.sin(ang1) * dist * 0.55, "s1", 1)}
        {mini(50 + Math.cos(ang2) * dist, 50 + Math.sin(ang2) * dist * 0.55, "s2", 0.8)}
      </>
    );
  } else if (variant === 3) {
    // Exploded: offset the top triangle face
    const lift = 4 + rand() * 3;
    extra = (
      <>
        <polyline
          points={`${pts.left[0]},${pts.left[1] - lift} ${pts.top[0]},${pts.top[1] - lift} ${pts.right[0]},${pts.right[1] - lift}`}
          stroke={color} strokeWidth="0.45" opacity="0.6"
        />
        <line x1={pts.left[0]} y1={pts.left[1] - lift} x2={pts.left[0]} y2={pts.left[1]} stroke={color} strokeWidth="0.25" opacity="0.4" strokeDasharray="1,1" />
        <line x1={pts.top[0]} y1={pts.top[1] - lift} x2={pts.top[0]} y2={pts.top[1]} stroke={color} strokeWidth="0.25" opacity="0.4" strokeDasharray="1,1" />
        <line x1={pts.right[0]} y1={pts.right[1] - lift} x2={pts.right[0]} y2={pts.right[1]} stroke={color} strokeWidth="0.25" opacity="0.4" strokeDasharray="1,1" />
      </>
    );
  }

  return (
    <Rot deg={((seed >> 14) % 7) - 3 /* -3..3° tilt */}>
      {base}
      {extra}
      <circle cx="50" cy="50" r="1.2" fill={color} />
    </Rot>
  );
}

/* ─── concentric ───────────────────────────────────────────────────────── */

function concentric(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const variant = seed % 3;
  const ringCount = 4 + (seed % 5); // 4..8
  const dashIdx = (seed >> 6) % ringCount;  // which ring gets dashed
  const rings: { r: number; dash: boolean; op: number }[] = [];
  for (let i = 0; i < ringCount; i++) {
    let r: number;
    if (variant === 0) r = 8 + i * (30 / ringCount);
    else if (variant === 1) r = 6 + Math.pow(i / ringCount, 1.5) * 32;
    else r = (i === Math.floor(ringCount / 2)) ? 0 : 8 + i * (28 / ringCount);
    if (r === 0) continue;
    rings.push({ r: r * (0.95 + rand() * 0.1), dash: i === dashIdx, op: 0.35 + (1 - i / ringCount) * 0.45 });
  }
  // Sometimes add a diameter cross
  const cross = ((seed >> 10) % 3) === 0;
  return (
    <>
      {rings.map((ring, i) => (
        <circle
          key={i}
          cx="50"
          cy="50"
          r={ring.r}
          stroke={color}
          strokeWidth="0.45"
          strokeDasharray={ring.dash ? "1,1.2" : undefined}
          opacity={ring.op}
        />
      ))}
      {cross ? (
        <>
          <line x1="16" y1="50" x2="84" y2="50" stroke={color} strokeWidth="0.25" opacity="0.3" />
          <line x1="50" y1="16" x2="50" y2="84" stroke={color} strokeWidth="0.25" opacity="0.3" />
        </>
      ) : null}
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
  // Vary bar height range per seed
  const yTop = 20 + rand() * 4;
  const yBot = 76 + rand() * 4;
  const h = yBot - yTop;
  while (x < 82) {
    const w = 0.6 + rand() * 3;
    const gap = 0.8 + rand() * 2.2;
    const yJ = rand() * 4;
    bars.push(
      <rect key={key++} x={x} y={yTop + yJ} width={w} height={h - yJ * 1.5} fill={color} opacity={0.55 + rand() * 0.4} />
    );
    x += w + gap;
  }
  return <>{bars}</>;
}

/* ─── targeting-ring ───────────────────────────────────────────────────── */

function targetingRing(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const k = knobs(seed);
  const variant = seed % 5;
  const elems: React.ReactNode[] = [];
  // Per-seed ring radii so same variant still varies
  const rOuter = 28 + ((seed >> 6) % 80) / 10; // 28..36
  const rInner = 16 + ((seed >> 10) % 80) / 10; // 16..24
  const tickLen = 6 + rand() * 4;
  const coreSize = 1.8 + rand() * 0.8;

  if (variant === 0) {
    elems.push(
      <circle key="r1" cx="50" cy="50" r={rOuter} stroke={color} strokeWidth="0.5" opacity="0.8" />,
      <circle key="r2" cx="50" cy="50" r={rInner} stroke={color} strokeWidth="0.35" opacity="0.45" />
    );
    const cross: [number, number, number, number][] = [
      [50 - rOuter - tickLen, 50, 50 - rOuter - 2, 50],
      [50 + rOuter + 2, 50, 50 + rOuter + tickLen, 50],
      [50, 50 - rOuter - tickLen, 50, 50 - rOuter - 2],
      [50, 50 + rOuter + 2, 50, 50 + rOuter + tickLen],
    ];
    cross.forEach(([x1, y1, x2, y2], i) => elems.push(
      <line key={`c${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="0.4" opacity="0.55" />
    ));
  } else if (variant === 1) {
    elems.push(
      <circle key="r1" cx="50" cy="50" r={rOuter + 2} stroke={color} strokeWidth="0.5" opacity="0.8" />,
      <circle key="r2" cx="50" cy="50" r={rInner + 2} stroke={color} strokeWidth="0.35" opacity="0.5" />,
      <circle key="r3" cx="50" cy="50" r={rInner - 6} stroke={color} strokeWidth="0.3" opacity="0.4" />
    );
    elems.push(
      <line key="ch" x1="10" y1="50" x2="90" y2="50" stroke={color} strokeWidth="0.35" opacity="0.4" />,
      <line key="cv" x1="50" y1="10" x2="50" y2="90" stroke={color} strokeWidth="0.35" opacity="0.4" />
    );
  } else if (variant === 2) {
    elems.push(
      <circle key="r1" cx="50" cy="50" r={rOuter} stroke={color} strokeWidth="0.5" opacity="0.8" />,
      <circle key="r2" cx="50" cy="50" r={rInner} stroke={color} strokeWidth="0.3" opacity="0.4" />
    );
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      elems.push(
        <line key={`d${i}`} x1={50 + Math.cos(a) * (rInner - 4)} y1={50 + Math.sin(a) * (rInner - 4)} x2={50 + Math.cos(a) * (rOuter + 4)} y2={50 + Math.sin(a) * (rOuter + 4)} stroke={color} strokeWidth="0.45" opacity="0.7" />
      );
    }
    const tickN = [16, 24, 32][(seed >> 7) % 3];
    for (let i = 0; i < tickN; i++) {
      const a = (i / tickN) * Math.PI * 2;
      const inner = i % 4 === 0 ? rOuter - 4 : rOuter - 2;
      elems.push(
        <line key={`t${i}`} x1={50 + Math.cos(a) * inner} y1={50 + Math.sin(a) * inner} x2={50 + Math.cos(a) * rOuter} y2={50 + Math.sin(a) * rOuter} stroke={color} strokeWidth="0.3" opacity="0.55" />
      );
    }
  } else if (variant === 3) {
    const spokeN = [6, 8, 10, 12][(seed >> 8) % 4];
    elems.push(
      <circle key="r1" cx="50" cy="50" r={rOuter - 2} stroke={color} strokeWidth="0.5" opacity="0.75" />,
      <circle key="r2" cx="50" cy="50" r="10" stroke={color} strokeWidth="0.3" opacity="0.4" />
    );
    for (let i = 0; i < spokeN; i++) {
      const a = (i / spokeN) * Math.PI * 2;
      const long = i % 2 === 0;
      const inner = long ? 11 : rInner - 4;
      const outer = long ? rOuter + 4 : rOuter - 2;
      elems.push(
        <line key={`s${i}`} x1={50 + Math.cos(a) * inner} y1={50 + Math.sin(a) * inner} x2={50 + Math.cos(a) * outer} y2={50 + Math.sin(a) * outer} stroke={color} strokeWidth={long ? "0.5" : "0.35"} opacity={long ? "0.75" : "0.5"} />
      );
    }
  } else {
    // Offset reticle
    const ox = (rand() - 0.5) * 10;
    const oy = (rand() - 0.5) * 10;
    elems.push(
      <circle key="r1" cx="50" cy="50" r={rOuter} stroke={color} strokeWidth="0.5" opacity="0.7" />,
      <circle key="r2" cx="50" cy="50" r={rInner} stroke={color} strokeWidth="0.35" opacity="0.5" strokeDasharray="1,1.5" />,
      <line key="xh" x1={50 + ox - 6} y1={50 + oy} x2={50 + ox + 6} y2={50 + oy} stroke={color} strokeWidth="0.5" opacity="0.9" />,
      <line key="yh" x1={50 + ox} y1={50 + oy - 6} x2={50 + ox} y2={50 + oy + 6} stroke={color} strokeWidth="0.5" opacity="0.9" />,
      <circle key="tgt" cx={50 + ox} cy={50 + oy} r="1.6" fill={color} />
    );
    return <Rot deg={k.rotDeg / 3}>{elems}</Rot>;
  }

  elems.push(<circle key="core" cx="50" cy="50" r={coreSize} fill={color} />);
  return <Rot deg={k.rotDeg / 6}>{elems}</Rot>;
}

/* ─── threshold ────────────────────────────────────────────────────────── */

function threshold(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const gates = 1 + (seed % 3); // 1,2,3
  const halfWidth = 18 + rand() * 8;  // varies per seed
  const halfHeight = 22 + rand() * 8;
  const lintel = 50 - halfHeight;
  const floor = 50 + halfHeight;
  const elems: React.ReactNode[] = [];
  // Lintel + floor
  elems.push(
    <line key="l-top" x1={50 - halfWidth} y1={lintel} x2={50 + halfWidth} y2={lintel} stroke={color} strokeWidth="0.6" opacity="0.8" />,
    <line key="l-bot" x1={50 - halfWidth} y1={floor} x2={50 + halfWidth} y2={floor} stroke={color} strokeWidth="0.6" opacity="0.8" />
  );
  // Second lintel if seed says so
  const doubleLintel = ((seed >> 4) % 3) === 0;
  if (doubleLintel) {
    elems.push(
      <line key="l-top2" x1={50 - halfWidth - 2} y1={lintel - 3} x2={50 + halfWidth + 2} y2={lintel - 3} stroke={color} strokeWidth="0.4" opacity="0.55" />
    );
  }
  // Uprights
  const step = (halfWidth * 2) / gates;
  for (let i = 0; i <= gates; i++) {
    const x = 50 - halfWidth + i * step;
    const edge = i === 0 || i === gates;
    elems.push(
      <line key={`u${i}`} x1={x} y1={lintel} x2={x} y2={floor} stroke={color} strokeWidth={edge ? "0.55" : "0.4"} opacity={edge ? "0.8" : "0.55"} />
    );
  }
  // Threshold mark on the floor
  const hasMark = ((seed >> 8) % 2) === 0;
  if (hasMark) {
    elems.push(
      <line key="m" x1="50" y1={floor} x2="50" y2={floor + 4} stroke={color} strokeWidth="0.5" opacity="0.7" />
    );
  }
  elems.push(<circle key="c" cx="50" cy={(lintel + floor) / 2} r="1.3" fill={color} />);
  // Slight rotation
  return <Rot deg={(((seed >> 12) % 11) - 5)}>{elems}</Rot>;
}

/* ─── codex ────────────────────────────────────────────────────────────── */

function codex(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const variant = seed % 3;
  const elems: React.ReactNode[] = [];
  const yTop = 22, yBot = 78, yH = yBot - yTop;
  if (variant === 0) {
    // Uniform bands with per-row jitter
    const count = 7 + (seed % 5); // 7..11
    for (let i = 0; i < count; i++) {
      const y = yTop + i * (yH / (count - 1));
      const w = 44 + rand() * 18;
      const thick = (i + ((seed >> 3) % 2)) % 2 === 0;
      elems.push(
        <line key={i} x1={50 - w / 2} y1={y} x2={50 + w / 2} y2={y} stroke={color} strokeWidth={thick ? "0.6" : "0.3"} opacity={thick ? "0.8" : "0.5"} />
      );
    }
  } else if (variant === 1) {
    // Tapered — sometimes widening, sometimes narrowing
    const count = 9 + (seed % 5);
    const direction = ((seed >> 3) % 2) === 0 ? 1 : -1;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const y = yTop + i * (yH / (count - 1));
      const w = 18 + (direction === 1 ? t : 1 - t) * 46 + rand() * 4;
      elems.push(
        <line key={i} x1={50 - w / 2} y1={y} x2={50 + w / 2} y2={y} stroke={color} strokeWidth="0.4" opacity="0.65" />
      );
    }
  } else {
    // Grouped bands
    const groups = 2 + (seed % 3); // 2..4
    const rowsPerGroup = 3 + ((seed >> 3) % 3);
    const groupGap = yH / (groups + 1);
    for (let g = 0; g < groups; g++) {
      const yBase = yTop + (g + 0.5) * groupGap - (rowsPerGroup - 1);
      for (let i = 0; i < rowsPerGroup; i++) {
        const y = yBase + i * 2.5;
        const w = 40 + rand() * 12;
        elems.push(
          <line key={`${g}-${i}`} x1={50 - w / 2} y1={y} x2={50 + w / 2} y2={y} stroke={color} strokeWidth="0.35" opacity={0.4 + rand() * 0.45} />
        );
      }
    }
  }
  return <>{elems}</>;
}

/* ─── spiral ───────────────────────────────────────────────────────────── */

function spiral(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const k = knobs(seed);
  const variant = seed % 3;
  const turns = 2 + rand() * 3; // 2..5 turns

  if (variant === 2) {
    // Double spiral with variable winding
    const a: string[] = [];
    const b: string[] = [];
    const growth = 1.0 + rand() * 0.6;
    const steps = Math.ceil(turns * 100);
    for (let i = 0; i < steps; i++) {
      const t = (i / 100) * Math.PI;
      const r = 1 + t * growth;
      if (r > 34) break;
      a.push(`${50 + Math.cos(t) * r},${50 + Math.sin(t) * r}`);
      b.push(`${50 - Math.cos(t) * r},${50 - Math.sin(t) * r}`);
    }
    return (
      <Rot deg={k.rotDeg}>
        <polyline points={a.join(" ")} stroke={color} strokeWidth="0.5" opacity="0.8" fill="none" />
        <polyline points={b.join(" ")} stroke={color} strokeWidth="0.5" opacity="0.8" fill="none" />
        <circle cx="50" cy="50" r="1.4" fill={color} />
      </Rot>
    );
  }

  const pts: string[] = [];
  if (variant === 0) {
    // Logarithmic
    const b = 0.12 + rand() * 0.08;
    const a0 = 1.0 + rand() * 0.6;
    const maxT = turns * Math.PI * 2;
    for (let t = 0; t < maxT; t += 0.05) {
      const r = a0 * Math.exp(b * t);
      if (r > 36) break;
      pts.push(`${50 + Math.cos(t) * r},${50 + Math.sin(t) * r}`);
    }
  } else {
    // Archimedean
    const slope = 0.8 + rand() * 0.8;
    const maxT = turns * Math.PI * 2;
    for (let t = 0; t < maxT; t += 0.05) {
      const r = 1 + (t / (2 * Math.PI)) * slope * 6;
      if (r > 36) break;
      pts.push(`${50 + Math.cos(t) * r},${50 + Math.sin(t) * r}`);
    }
  }
  return (
    <Rot deg={k.rotDeg}>
      <polyline points={pts.join(" ")} stroke={color} strokeWidth="0.5" opacity="0.8" fill="none" />
      <circle cx="50" cy="50" r="1.4" fill={color} />
    </Rot>
  );
}

/* ─── constellation ────────────────────────────────────────────────────── */

function constellation(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const count = [5, 6, 7, 8, 9, 10][seed % 6];
  const pts: [number, number][] = [];
  let attempts = 0;
  while (pts.length < count && attempts < count * 40) {
    attempts++;
    const a = rand() * Math.PI * 2;
    const r = 8 + rand() * 30;
    const x = 50 + Math.cos(a) * r;
    const y = 50 + Math.sin(a) * r;
    if (!pts.some(([px, py]) => Math.hypot(px - x, py - y) < 10)) pts.push([x, y]);
  }
  const edges: [number, number][] = [];
  for (let i = 1; i < pts.length; i++) {
    let best = 0, bestD = Infinity;
    for (let j = 0; j < i; j++) {
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      if (d < bestD) { bestD = d; best = j; }
    }
    edges.push([i, best]);
  }
  return (
    <>
      {edges.map(([a, b], i) => (
        <line key={`e${i}`} x1={pts[a][0]} y1={pts[a][1]} x2={pts[b][0]} y2={pts[b][1]} stroke={color} strokeWidth="0.3" opacity="0.45" />
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
  const rand = mulberry32(seed);
  const divisions = 3 + (seed % 3); // 3, 4, 5
  const sz = 46 + rand() * 10;
  const x0 = 50 - sz / 2;
  const y0 = 50 - sz / 2;
  const step = sz / divisions;
  const GAP = 1.8 + rand() * 1.4;
  const parity = (seed >> 3) % 2; // which direction goes over at (0,0)
  const elems: React.ReactNode[] = [];

  for (let r = 0; r <= divisions; r++) {
    const y = y0 + r * step;
    const segs: [number, number][] = [];
    let cur = x0;
    for (let c = 0; c <= divisions; c++) {
      const cx = x0 + c * step;
      if (((r + c) % 2) === parity) continue;
      segs.push([cur, cx - GAP]);
      cur = cx + GAP;
    }
    segs.push([cur, x0 + sz]);
    segs.forEach(([a, b], i) => {
      elems.push(<line key={`h${r}-${i}`} x1={a} y1={y} x2={b} y2={y} stroke={color} strokeWidth="0.5" opacity="0.75" />);
    });
  }
  for (let c = 0; c <= divisions; c++) {
    const x = x0 + c * step;
    const segs: [number, number][] = [];
    let cur = y0;
    for (let r = 0; r <= divisions; r++) {
      const cy = y0 + r * step;
      if (((r + c) % 2) === parity) continue;
      segs.push([cur, cy - GAP]);
      cur = cy + GAP;
    }
    segs.push([cur, y0 + sz]);
    segs.forEach(([a, b], i) => {
      elems.push(<line key={`v${c}-${i}`} x1={x} y1={a} x2={x} y2={b} stroke={color} strokeWidth="0.5" opacity="0.75" />);
    });
  }
  return <Rot deg={(((seed >> 8) % 9) - 4)}>{elems}</Rot>;
}

/* ─── dendrite ─────────────────────────────────────────────────────────── */

function dendrite(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const mode = seed % 3;
  const MAX_DEPTH = 3 + (seed % 3); // 3..5
  const INITIAL_LEN = 10 + rand() * 8;
  const ANGLE_SPREAD = Math.PI / (2.4 + rand() * 0.8);
  const lines: React.ReactNode[] = [];

  function branch(x: number, y: number, len: number, angle: number, depth: number, key: string) {
    if (depth > MAX_DEPTH) return;
    const x2 = x + Math.cos(angle) * len;
    const y2 = y + Math.sin(angle) * len;
    const op = 0.9 - depth * 0.14;
    lines.push(
      <line key={key} x1={x} y1={y} x2={x2} y2={y2} stroke={color} strokeWidth={Math.max(0.25, 0.8 - depth * 0.14)} opacity={op} />
    );
    const jitter = (rand() - 0.5) * 0.25;
    branch(x2, y2, len * 0.72, angle - ANGLE_SPREAD / 2 + jitter, depth + 1, key + "L");
    branch(x2, y2, len * 0.72, angle + ANGLE_SPREAD / 2 + jitter, depth + 1, key + "R");
  }

  if (mode === 0) {
    const arms = 3 + (seed % 3);
    const rot0 = rand() * Math.PI * 2;
    for (let i = 0; i < arms; i++) {
      branch(50, 50, INITIAL_LEN, rot0 + (i / arms) * Math.PI * 2, 0, `r${i}`);
    }
    lines.push(<circle key="c" cx="50" cy="50" r="1.4" fill={color} />);
  } else if (mode === 1) {
    branch(50, 80, INITIAL_LEN, -Math.PI / 2 + (rand() - 0.5) * 0.3, 0, "t");
    lines.push(<circle key="c" cx="50" cy="80" r="1.2" fill={color} />);
  } else {
    // Horizontal: root on left edge
    branch(18, 50, INITIAL_LEN, 0 + (rand() - 0.5) * 0.3, 0, "h");
    lines.push(<circle key="c" cx="18" cy="50" r="1.2" fill={color} />);
  }
  return <>{lines}</>;
}

/* ─── eclipse ──────────────────────────────────────────────────────────── */

function eclipse(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const k = knobs(seed);
  const variant = seed % 3;
  const elems: React.ReactNode[] = [];

  if (variant === 0) {
    // Partial: sun stationary, moon covers left or right by variable amount
    const offset = (rand() > 0.5 ? 1 : -1) * (8 + rand() * 10);
    elems.push(
      <circle key="sun" cx="50" cy="50" r={22 + rand() * 4} stroke={color} strokeWidth="0.5" opacity="0.7" />,
      <circle key="moon" cx={50 + offset} cy={50 + (rand() - 0.5) * 4} r={22 + rand() * 3} fill={color} fillOpacity="0.9" />
    );
  } else if (variant === 1) {
    // Total with corona — corona ray count varies
    const sunR = 24 + rand() * 3;
    const moonR = sunR - 1.5 - rand() * 1.2;
    const rayN = 12 + (seed % 8); // 12..19
    elems.push(
      <circle key="sun" cx="50" cy="50" r={sunR + 2} stroke={color} strokeWidth="0.5" opacity="0.7" />,
      <circle key="moon" cx="50" cy="50" r={moonR} fill={color} fillOpacity="0.92" />
    );
    for (let i = 0; i < rayN; i++) {
      const a = (i / rayN) * Math.PI * 2 + k.rot;
      const len = 5 + rand() * 6;
      elems.push(
        <line key={`r${i}`} x1={50 + Math.cos(a) * (sunR + 3)} y1={50 + Math.sin(a) * (sunR + 3)} x2={50 + Math.cos(a) * (sunR + 3 + len)} y2={50 + Math.sin(a) * (sunR + 3 + len)} stroke={color} strokeWidth="0.4" opacity="0.55" />
      );
    }
  } else {
    // Annular — inner ring smaller than outer
    const outer = 26 + rand() * 4;
    const inner = 14 + rand() * 4;
    elems.push(
      <circle key="sun" cx="50" cy="50" r={outer} stroke={color} strokeWidth="0.5" opacity="0.75" />,
      <circle key="moon" cx="50" cy="50" r={inner} fill={color} fillOpacity="0.9" />,
      <circle key="ring" cx="50" cy="50" r={inner + 0.5} stroke={color} strokeWidth="0.25" opacity="0.4" />
    );
  }
  return <Rot deg={(((seed >> 6) % 13) - 6)}>{elems}</Rot>;
}

/* ─── phase-moon ───────────────────────────────────────────────────────── */

function phaseMoon(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const phase = seed % 5; // 0=new, 1=crescent, 2=quarter, 3=gibbous, 4=full
  const R = 24 + rand() * 6;
  const tilt = ((seed >> 4) % 360); // orient the terminator at any angle
  const outline = <circle cx="50" cy="50" r={R} stroke={color} strokeWidth="0.5" opacity="0.75" />;

  if (phase === 0) {
    // New — outline only, small off-center dot
    return (
      <>
        {outline}
        <circle cx={50 + (rand() - 0.5) * 8} cy={50 + (rand() - 0.5) * 8} r="0.8" fill={color} opacity="0.4" />
      </>
    );
  }
  if (phase === 4) {
    return (
      <>
        {outline}
        <circle cx="50" cy="50" r={R} fill={color} fillOpacity="0.85" />
        {/* Subtle mare pattern */}
        {Array.from({ length: 6 }).map((_, i) => (
          <circle
            key={i}
            cx={50 + (rand() - 0.5) * R * 1.2}
            cy={50 + (rand() - 0.5) * R * 1.2}
            r={0.6 + rand() * 1.2}
            fill={color === "currentColor" ? "black" : "#000"}
            opacity="0.2"
          />
        ))}
      </>
    );
  }
  const fracs = [0.28, 0.5, 0.72];
  const illuminated = fracs[phase - 1];
  const shift = R * (1 - 2 * illuminated);
  return (
    <Rot deg={tilt}>
      <defs>
        <mask id={`m-${seed}`}>
          <rect x="0" y="0" width="100" height="100" fill="black" />
          <circle cx="50" cy="50" r={R} fill="white" />
          <circle cx={50 + shift} cy="50" r={R} fill="black" />
        </mask>
      </defs>
      <circle cx="50" cy="50" r={R} fill={color} fillOpacity="0.85" mask={`url(#m-${seed})`} />
      <circle cx="50" cy="50" r={R} stroke={color} strokeWidth="0.5" opacity="0.75" />
    </Rot>
  );
}

/* ─── waveform ─────────────────────────────────────────────────────────── */

function waveform(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const variant = seed % 3;
  const pts: string[] = [];
  const N = 220;
  const freq = 2 + rand() * 4;         // cycles across
  const amp = 12 + rand() * 10;
  const phase = rand() * Math.PI * 2;
  const baseY = 50 + (rand() - 0.5) * 12;

  if (variant === 0) {
    for (let i = 0; i < N; i++) {
      const x = 15 + (i / (N - 1)) * 70;
      const t = (i / (N - 1)) * Math.PI * freq + phase;
      pts.push(`${x},${baseY + Math.sin(t) * amp}`);
    }
  } else if (variant === 1) {
    // Damped
    const decayRate = 0.15 + rand() * 0.12;
    for (let i = 0; i < N; i++) {
      const x = 15 + (i / (N - 1)) * 70;
      const t = (i / (N - 1)) * Math.PI * (freq + 2) + phase;
      const decay = Math.exp(-t * decayRate);
      pts.push(`${x},${baseY + Math.sin(t) * amp * decay}`);
    }
  } else {
    // Composite sum of two harmonics at random ratios
    const harm = [2, 3, 4][(seed >> 3) % 3];
    const mix = 0.3 + rand() * 0.4;
    for (let i = 0; i < N; i++) {
      const x = 15 + (i / (N - 1)) * 70;
      const t = (i / (N - 1)) * Math.PI * freq + phase;
      pts.push(`${x},${baseY + Math.sin(t) * amp * (1 - mix) + Math.sin(t * harm) * amp * mix}`);
    }
  }
  return (
    <>
      <line x1="15" y1={baseY} x2="85" y2={baseY} stroke={color} strokeWidth="0.25" opacity="0.35" strokeDasharray="1,2" />
      <polyline points={pts.join(" ")} stroke={color} strokeWidth="0.6" fill="none" opacity="0.9" />
      <circle cx="15" cy={baseY} r="1" fill={color} opacity="0.8" />
      <circle cx="85" cy={baseY} r="1" fill={color} opacity="0.8" />
    </>
  );
}

/* ─── orbit-diagram ────────────────────────────────────────────────────── */

function orbitDiagram(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const orbits = 2 + (seed % 3); // 2,3,4
  const tilt = ((seed >> 4) % 60) - 30; // -30..30 deg
  const elems: React.ReactNode[] = [];
  for (let i = 0; i < orbits; i++) {
    const r = 10 + i * (10 + rand() * 3);
    const ry = r * (0.3 + rand() * 0.2);
    elems.push(
      <ellipse
        key={`o${i}`}
        cx="50"
        cy="50"
        rx={r}
        ry={ry}
        stroke={color}
        strokeWidth="0.4"
        opacity={0.6 - i * 0.07}
        transform={tilt ? `rotate(${tilt} 50 50)` : undefined}
      />
    );
    const a = rand() * Math.PI * 2;
    const px = 50 + Math.cos(a) * r;
    const py = 50 + Math.sin(a) * ry;
    if (tilt) {
      const rad = (tilt * Math.PI) / 180;
      const px2 = 50 + (px - 50) * Math.cos(rad) - (py - 50) * Math.sin(rad);
      const py2 = 50 + (px - 50) * Math.sin(rad) + (py - 50) * Math.cos(rad);
      elems.push(<circle key={`p${i}`} cx={px2} cy={py2} r="1.2" fill={color} />);
    } else {
      elems.push(<circle key={`p${i}`} cx={px} cy={py} r="1.2" fill={color} />);
    }
  }
  elems.push(
    <circle key="star" cx="50" cy="50" r="2.2" fill={color} />,
    <circle key="halo" cx="50" cy="50" r="4" fill="none" stroke={color} strokeWidth="0.25" opacity="0.4" />
  );
  return <>{elems}</>;
}

/* ─── compass-rose ─────────────────────────────────────────────────────── */

function compassRose(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const k = knobs(seed);
  const major = [4, 6, 8, 12, 16][seed % 5];
  const minor = [0, 8, 12, 16, 24][(seed >> 3) % 5];
  const outerR = 30 + rand() * 6;
  const innerR = 18 + rand() * 6;
  const base = 3 + rand() * 2;
  const elems: React.ReactNode[] = [];
  elems.push(
    <circle key="r1" cx="50" cy="50" r={outerR} stroke={color} strokeWidth="0.35" opacity="0.45" />,
    <circle key="r2" cx="50" cy="50" r={innerR} stroke={color} strokeWidth="0.25" opacity="0.35" />
  );
  for (let i = 0; i < major; i++) {
    const a = (i / major) * Math.PI * 2 - Math.PI / 2;
    const tipX = 50 + Math.cos(a) * outerR;
    const tipY = 50 + Math.sin(a) * outerR;
    const side1 = a + Math.PI / 2;
    const side2 = a - Math.PI / 2;
    const leftX = 50 + Math.cos(side1) * base;
    const leftY = 50 + Math.sin(side1) * base;
    const rightX = 50 + Math.cos(side2) * base;
    const rightY = 50 + Math.sin(side2) * base;
    elems.push(
      <polygon key={`M${i}`} points={`${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`} stroke={color} strokeWidth="0.35" opacity={i % 2 === 0 ? "0.85" : "0.55"} />
    );
  }
  for (let i = 0; i < minor; i++) {
    const a = (i / minor) * Math.PI * 2 - Math.PI / 2 + Math.PI / (minor || 1);
    elems.push(
      <line key={`m${i}`} x1={50 + Math.cos(a) * (outerR - 2)} y1={50 + Math.sin(a) * (outerR - 2)} x2={50 + Math.cos(a) * outerR} y2={50 + Math.sin(a) * outerR} stroke={color} strokeWidth="0.3" opacity="0.55" />
    );
  }
  elems.push(<circle key="c" cx="50" cy="50" r="1.5" fill={color} />);
  return <Rot deg={k.rotDeg}>{elems}</Rot>;
}

/* ─── vesica ───────────────────────────────────────────────────────────── */

function vesica(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const k = knobs(seed);
  const R = 18 + rand() * 6;
  const offset = R * (0.55 + rand() * 0.4); // 55–95% of R
  const pairCount = 1 + (seed % 3); // 1,2,3 pairs
  const elems: React.ReactNode[] = [];

  for (let p = 0; p < pairCount; p++) {
    const a = (p / pairCount) * Math.PI + (rand() - 0.5) * 0.4;
    const cx1 = 50 + Math.cos(a) * offset;
    const cy1 = 50 + Math.sin(a) * offset;
    const cx2 = 50 - Math.cos(a) * offset;
    const cy2 = 50 - Math.sin(a) * offset;
    elems.push(
      <circle key={`a${p}`} cx={cx1} cy={cy1} r={R} stroke={color} strokeWidth="0.5" opacity={0.75 - p * 0.12} />,
      <circle key={`b${p}`} cx={cx2} cy={cy2} r={R} stroke={color} strokeWidth="0.5" opacity={0.75 - p * 0.12} />,
      <circle key={`da${p}`} cx={cx1} cy={cy1} r="1.1" fill={color} opacity="0.75" />,
      <circle key={`db${p}`} cx={cx2} cy={cy2} r="1.1" fill={color} opacity="0.75" />
    );
  }
  elems.push(<circle key="c" cx="50" cy="50" r="1.6" fill={color} />);
  return <Rot deg={k.rotDeg}>{elems}</Rot>;
}

/* ─── crosshatch ───────────────────────────────────────────────────────── */

function crosshatch(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const k = knobs(seed);
  const variant = seed % 3;
  const sz = 50 + rand() * 6;
  const x0 = 50 - sz / 2;
  const y0 = 50 - sz / 2;
  const step = 4 + ((seed >> 3) % 4); // 4..7
  const lines: React.ReactNode[] = [];
  lines.push(<rect key="b" x={x0} y={y0} width={sz} height={sz} stroke={color} strokeWidth="0.35" opacity="0.4" />);

  // Down-right diagonals (always present)
  for (let i = -sz; i <= sz; i += step) {
    const x1 = x0 + Math.max(0, i);
    const y1 = y0 + Math.max(0, -i);
    const x2 = x0 + Math.min(sz, sz + i);
    const y2 = y0 + Math.min(sz, sz - i);
    lines.push(<line key={`a${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="0.3" opacity="0.5" />);
  }
  if (variant !== 2) {
    // Second direction
    for (let i = -sz; i <= sz; i += step) {
      const x1 = x0 + Math.max(0, i);
      const y1 = y0 + sz - Math.max(0, -i);
      const x2 = x0 + Math.min(sz, sz + i);
      const y2 = y0 + sz - Math.min(sz, sz - i);
      lines.push(<line key={`b${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="0.3" opacity="0.5" />);
    }
  }
  if (variant === 1) {
    // Add horizontal for triple-hatch
    for (let y = y0 + step; y < y0 + sz; y += step * 2) {
      lines.push(<line key={`h${y}`} x1={x0} y1={y} x2={x0 + sz} y2={y} stroke={color} strokeWidth="0.25" opacity="0.35" />);
    }
  }
  return <Rot deg={k.rotDeg / 4}>{lines}</Rot>;
}

/* ─── meridian ─────────────────────────────────────────────────────────── */

function meridian(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const k = knobs(seed);
  const parallels = 3 + (seed % 5); // 3..7
  const meridians = (seed >> 3) % 2 === 0 ? 0 : 2 + ((seed >> 5) % 3); // 0, or 2..4
  const R = 30 + rand() * 4;
  const elems: React.ReactNode[] = [];
  elems.push(<circle key="s" cx="50" cy="50" r={R} stroke={color} strokeWidth="0.4" opacity="0.5" />);
  for (let i = 0; i < parallels; i++) {
    const frac = (i + 1) / (parallels + 1);
    const phi = frac * Math.PI;
    const y = 50 - Math.cos(phi) * R;
    const rx = Math.sin(phi) * R;
    const ry = rx * 0.25;
    elems.push(
      <ellipse key={`p${i}`} cx="50" cy={y} rx={rx} ry={ry} stroke={color} strokeWidth="0.3" opacity="0.65" />
    );
  }
  // Equator
  elems.push(<line key="eq" x1={50 - R} y1="50" x2={50 + R} y2="50" stroke={color} strokeWidth="0.35" opacity="0.55" />);
  // Optional longitudinal meridians
  for (let i = 0; i < meridians; i++) {
    const lon = (i / meridians) * Math.PI - Math.PI / 2;
    const rx = Math.abs(Math.cos(lon)) * R;
    elems.push(
      <ellipse key={`mr${i}`} cx="50" cy="50" rx={rx} ry={R} stroke={color} strokeWidth="0.3" opacity="0.55" />
    );
  }
  elems.push(<line key="ax" x1="50" y1={50 - R} x2="50" y2={50 + R} stroke={color} strokeWidth="0.25" opacity="0.4" strokeDasharray="1,1.5" />);
  return <Rot deg={k.rotDeg / 6}>{elems}</Rot>;
}

/* ─── halftone ─────────────────────────────────────────────────────────── */

function halftone(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const variant = seed % 4;
  const step = 3.5 + (((seed >> 3) % 4)); // 3.5..6.5
  const x0 = 18, x1 = 82, y0 = 18, y1 = 82;
  const dots: React.ReactNode[] = [];
  const axisA = rand() * Math.PI * 2;
  const cx = 50 + (rand() - 0.5) * 14;
  const cy = 50 + (rand() - 0.5) * 14;
  let key = 0;
  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);
      const along = dx * Math.cos(axisA) + dy * Math.sin(axisA);
      let size: number;
      if (variant === 0) size = Math.max(0, 2.4 - d / 16);
      else if (variant === 1) size = Math.max(0, 1.6 - along / 20);
      else if (variant === 2) size = Math.max(0, (d - 4) / 22);
      else size = Math.max(0, 1.2 + Math.sin(d / 4) * 1.0);
      if (size > 0.15) {
        dots.push(<circle key={key++} cx={x} cy={y} r={size} fill={color} opacity="0.85" />);
      }
    }
  }
  return <>{dots}</>;
}

/* ─── glitch — signal-displaced figure ─────────────────────────────────── */

function glitch(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const shape = seed % 3; // 0=circle, 1=square, 2=diamond
  const R = 26 + rand() * 6;
  const cy = 50;
  const rowH = 2.0 + rand() * 1.5;
  const numRows = Math.ceil((2 * R) / rowH);
  const glitchProb = 0.18 + rand() * 0.22;
  const maxShift = 10 + rand() * 8;

  const elems: React.ReactNode[] = [];
  for (let i = 0; i < numRows; i++) {
    const y = cy - R + i * rowH + rowH / 2;
    const dy = y - cy;
    let halfW: number;
    if (shape === 0) {
      if (Math.abs(dy) >= R) continue;
      halfW = Math.sqrt(R * R - dy * dy);
    } else if (shape === 1) {
      halfW = R * 0.85;
    } else {
      halfW = Math.max(0, R - Math.abs(dy));
      if (halfW < 0.5) continue;
    }
    const isGlitch = rand() < glitchProb;
    const dx = isGlitch ? (rand() - 0.5) * maxShift : 0;
    const op = isGlitch ? 0.95 : 0.55 + rand() * 0.15;
    const w = isGlitch ? 0.55 : 0.35;
    elems.push(
      <line
        key={i}
        x1={50 - halfW + dx}
        y1={y}
        x2={50 + halfW + dx}
        y2={y}
        stroke={color}
        strokeWidth={w}
        opacity={op}
      />
    );
    if (isGlitch) {
      // Tiny seam at the origin edge — suggests the tear
      const seamX = dx > 0 ? 50 - halfW : 50 + halfW;
      elems.push(
        <line
          key={`s${i}`}
          x1={seamX}
          y1={y}
          x2={seamX + Math.sign(dx) * -2}
          y2={y}
          stroke={color}
          strokeWidth="0.3"
          opacity="0.5"
          strokeDasharray="0.6,0.6"
        />
      );
    }
  }
  // Top/bottom hairline markers to frame the figure
  elems.push(
    <line key="mt" x1={50 - R - 3} y1={cy - R - 1.5} x2={50 - R + 3} y2={cy - R - 1.5} stroke={color} strokeWidth="0.3" opacity="0.45" />,
    <line key="mb" x1={50 + R - 3} y1={cy + R + 1.5} x2={50 + R + 3} y2={cy + R + 1.5} stroke={color} strokeWidth="0.3" opacity="0.45" />,
    <circle key="c" cx="50" cy="50" r="1.2" fill={color} />
  );
  return <Rot deg={(((seed >>> 14) % 7) - 3)}>{elems}</Rot>;
}

/* ─── phaze — phase-interference / moiré ───────────────────────────────── */

function phaze(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const k = knobs(seed);
  const mode = seed % 3;
  const elems: React.ReactNode[] = [];

  if (mode === 0) {
    // Two sine waves, slightly different frequencies (beating)
    const f1 = 3 + rand() * 2;
    const f2 = f1 + 0.25 + rand() * 0.45;
    const amp = 13 + rand() * 7;
    const phase = rand() * Math.PI * 2;
    const N = 220;
    const pts1: string[] = [];
    const pts2: string[] = [];
    for (let i = 0; i < N; i++) {
      const x = 14 + (i / (N - 1)) * 72;
      const t = (i / (N - 1)) * Math.PI * 2;
      pts1.push(`${x},${50 + Math.sin(t * f1 + phase) * amp}`);
      pts2.push(`${x},${50 + Math.sin(t * f2) * amp}`);
    }
    elems.push(
      <line key="base" x1="14" y1="50" x2="86" y2="50" stroke={color} strokeWidth="0.25" opacity="0.3" strokeDasharray="1,2" />,
      <polyline key="w1" points={pts1.join(" ")} stroke={color} strokeWidth="0.55" fill="none" opacity="0.88" />,
      <polyline key="w2" points={pts2.join(" ")} stroke={color} strokeWidth="0.4" fill="none" opacity="0.55" strokeDasharray="1.4,0.8" />,
      <circle key="a" cx="14" cy="50" r="1" fill={color} opacity="0.8" />,
      <circle key="b" cx="86" cy="50" r="1" fill={color} opacity="0.8" />
    );
  } else if (mode === 1) {
    // Two sets of concentric rings, second set offset — creates visual beating
    const rings = 4 + (seed % 4);
    const offA = rand() * Math.PI * 2;
    const offD = 4 + rand() * 7;
    const ox = Math.cos(offA) * offD;
    const oy = Math.sin(offA) * offD;
    for (let i = 0; i < rings; i++) {
      const r = 8 + i * (28 / rings);
      elems.push(
        <circle key={`a${i}`} cx="50" cy="50" r={r} stroke={color} strokeWidth="0.4" opacity={0.5 + (1 - i / rings) * 0.25} />,
        <circle
          key={`b${i}`}
          cx={50 + ox}
          cy={50 + oy}
          r={r}
          stroke={color}
          strokeWidth="0.4"
          opacity={0.35 + (1 - i / rings) * 0.2}
          strokeDasharray="0.9,0.7"
        />
      );
    }
    elems.push(
      <circle key="cA" cx="50" cy="50" r="1.4" fill={color} />,
      <circle key="cB" cx={50 + ox} cy={50 + oy} r="1.2" fill={color} opacity="0.7" />
    );
  } else {
    // Moiré — two sets of parallel lines at near-perpendicular angles
    const count = 22 + (seed % 10);
    const angle1 = rand() * Math.PI;
    const skew = 0.12 + rand() * 0.2; // small angle difference from 90°
    const angle2 = angle1 + Math.PI / 2 + skew * (rand() > 0.5 ? 1 : -1);
    const sz = 56;
    const sin1 = Math.sin(angle1), cos1 = Math.cos(angle1);
    const sin2 = Math.sin(angle2), cos2 = Math.cos(angle2);
    const halfLen = sz * 0.85;
    for (let i = 0; i <= count; i++) {
      const t = -sz / 2 + (i / count) * sz;
      // first set
      const x1a = 50 - sin1 * t - cos1 * halfLen;
      const y1a = 50 + cos1 * t - sin1 * halfLen;
      const x1b = 50 - sin1 * t + cos1 * halfLen;
      const y1b = 50 + cos1 * t + sin1 * halfLen;
      elems.push(
        <line key={`m${i}a`} x1={x1a} y1={y1a} x2={x1b} y2={y1b} stroke={color} strokeWidth="0.3" opacity="0.55" />
      );
      // second set
      const x2a = 50 - sin2 * t - cos2 * halfLen;
      const y2a = 50 + cos2 * t - sin2 * halfLen;
      const x2b = 50 - sin2 * t + cos2 * halfLen;
      const y2b = 50 + cos2 * t + sin2 * halfLen;
      elems.push(
        <line key={`m${i}b`} x1={x2a} y1={y2a} x2={x2b} y2={y2b} stroke={color} strokeWidth="0.3" opacity="0.45" />
      );
    }
    // Bounding circle
    elems.push(
      <circle key="frame" cx="50" cy="50" r="30" stroke={color} strokeWidth="0.3" opacity="0.35" />,
      <circle key="core" cx="50" cy="50" r="1.3" fill={color} />
    );
  }

  return <Rot deg={k.rotDeg}>{elems}</Rot>;
}

/* ─── fracture — impact crack network ──────────────────────────────────── */

function fracture(seed: number, color: string): React.ReactNode {
  const rand = mulberry32(seed);
  const k = knobs(seed);
  const cx = 50, cy = 50;
  const elems: React.ReactNode[] = [];

  // Primary radial fractures — irregular count and angles
  const primaryCount = 5 + (seed % 5); // 5..9
  const primaryEnds: { x: number; y: number; angle: number; length: number }[] = [];
  for (let i = 0; i < primaryCount; i++) {
    const angle = (i / primaryCount) * Math.PI * 2 + (rand() - 0.5) * 0.5;
    const length = 20 + rand() * 16;
    // Build a slightly jagged polyline for each primary crack (2–3 segments)
    const segN = 2 + Math.floor(rand() * 2); // 2 or 3
    const pts: [number, number][] = [[cx, cy]];
    for (let s = 1; s <= segN; s++) {
      const t = s / segN;
      const r = length * t;
      const jitterA = angle + (rand() - 0.5) * 0.25;
      pts.push([cx + Math.cos(jitterA) * r, cy + Math.sin(jitterA) * r]);
    }
    for (let s = 0; s < pts.length - 1; s++) {
      elems.push(
        <line
          key={`p${i}-${s}`}
          x1={pts[s][0]}
          y1={pts[s][1]}
          x2={pts[s + 1][0]}
          y2={pts[s + 1][1]}
          stroke={color}
          strokeWidth={0.55 - s * 0.08}
          opacity={0.88 - s * 0.08}
        />
      );
    }
    const end = pts[pts.length - 1];
    primaryEnds.push({ x: end[0], y: end[1], angle, length });

    // Branches off the primary crack
    const branchCount = Math.floor(rand() * 3);
    for (let b = 0; b < branchCount; b++) {
      const t = 0.3 + rand() * 0.5;
      const branchStart: [number, number] = [
        cx + Math.cos(angle) * (length * t),
        cy + Math.sin(angle) * (length * t),
      ];
      const branchAngle = angle + (rand() - 0.5) * (Math.PI * 0.7);
      const branchLen = 4 + rand() * 10;
      const bx = branchStart[0] + Math.cos(branchAngle) * branchLen;
      const by = branchStart[1] + Math.sin(branchAngle) * branchLen;
      elems.push(
        <line
          key={`b${i}-${b}`}
          x1={branchStart[0]}
          y1={branchStart[1]}
          x2={bx}
          y2={by}
          stroke={color}
          strokeWidth="0.35"
          opacity="0.6"
        />
      );
    }
  }

  // Partial concentric fracture arcs (the "shock ring" of broken glass)
  const arcCount = 2 + (seed % 3);
  for (let i = 0; i < arcCount; i++) {
    const r = 7 + i * 7 + rand() * 3;
    const startA = rand() * Math.PI * 2;
    const sweep = Math.PI * (0.25 + rand() * 0.75);
    const segments = 14;
    let prev: [number, number] | null = null;
    for (let s = 0; s <= segments; s++) {
      const a = startA + (s / segments) * sweep;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (prev) {
        elems.push(
          <line
            key={`arc${i}-${s}`}
            x1={prev[0]}
            y1={prev[1]}
            x2={x}
            y2={y}
            stroke={color}
            strokeWidth="0.3"
            opacity={0.5 - i * 0.06}
          />
        );
      }
      prev = [x, y];
    }
  }

  // Impact site — dense nucleus
  elems.push(
    <circle key="nuc0" cx={cx} cy={cy} r="3" fill="none" stroke={color} strokeWidth="0.3" opacity="0.5" />,
    <circle key="nuc1" cx={cx} cy={cy} r="1.8" fill={color} />
  );

  // Debris — small dots scattered beyond fracture endpoints
  const debrisCount = 10 + (seed % 8);
  for (let i = 0; i < debrisCount; i++) {
    const a = rand() * Math.PI * 2;
    const r = 6 + rand() * 30;
    elems.push(
      <circle
        key={`d${i}`}
        cx={cx + Math.cos(a) * r}
        cy={cy + Math.sin(a) * r}
        r={0.3 + rand() * 0.4}
        fill={color}
        opacity={0.35 + rand() * 0.35}
      />
    );
  }

  return <Rot deg={k.rotDeg}>{elems}</Rot>;
}
