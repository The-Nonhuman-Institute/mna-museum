/**
 * Sky positioning + visual tint for gallery constellations rendered on
 * /museum/next. Each gallery has a fixed location in the celestial
 * sphere, a tint, and an angular spread. Star count is supplied by the
 * caller (derived from curation scope — Chamber = 4, Solo Exhibition
 * grows with the originator's work count, etc.).
 *
 * Coordinate system:
 *   yaw 0 → looking towards -Z (the field's "north")
 *   yaw +π/2 → +X (east)
 *   altitude 0 → horizon level
 *   altitude +π/2 → directly overhead
 *
 * Positions are placed at fixed distance (135m) — beyond the fog
 * fade-in but inside the camera's 240m far plane. They sit in the
 * starfield without participating in fog.
 */

export interface ConstellationConfig {
  id: string;
  direction: { yaw: number; altitude: number };
  /** World-metres from the field origin. */
  distance: number;
  /** Visual tint applied to stars, connecting lines, and label. */
  tint: string;
  /** Angular half-spread of the constellation (radians). Stars
   *  distribute within this cone. */
  spread: number;
}

export const CONSTELLATION_CONFIGS: Record<string, ConstellationConfig> = {
  chamber: {
    id: "chamber",
    direction: { yaw: 0, altitude: 0.32 }, // due north, ~18° above horizon
    distance: 135,
    tint: "#e6c890", // warm amber — matches the warm-side originator palette
    spread: 0.05,
  },
  solo_exhibition: {
    id: "solo_exhibition",
    direction: { yaw: 2.35, altitude: 0.45 }, // SW, ~26° above horizon
    distance: 135,
    tint: "#a5c4d8", // cool slate
    spread: 0.06,
  },
  exhibition: {
    id: "exhibition",
    direction: { yaw: 4.7, altitude: 0.40 }, // W, ~23° above horizon
    distance: 135,
    tint: "#c8b8d8", // soft lavender — distinct from amber + slate
    spread: 0.08,
  },
  /* Archive — the "way home" constellation rendered inside gallery
     scenes (Chamber, Solo Exhibition, etc.) to point back at the main
     field. Bigger spread and a brighter neutral tint so it visually
     reads as "the whole cosmos, not a single gallery." Pulled in to
     85m so the constellation feels present and the lines between
     stars are legible. Star count is supplied by the caller; gallery
     scenes should pass 10–12 so it visually dominates. */
  archive: {
    id: "archive",
    direction: { yaw: 0, altitude: 0.55 }, // overhead-forward, ~32°
    distance: 85,
    tint: "#f5f0e6", // warm white, slightly brighter than e8e4dc
    spread: 0.22,
  },
};

/** Star count for a constellation given its curation scope (number of
 *  works the gallery currently holds). Floored at 3 so even a single-
 *  work Chamber reads as a constellation, capped at 12 so a huge
 *  exhibition doesn't crowd the sky. */
export function starsForScope(scope: number): number {
  return Math.min(12, Math.max(3, 3 + Math.round(Math.sqrt(scope) * 1.5)));
}

export interface ConstellationStar {
  position: [number, number, number];
}

/** Generate star positions for one constellation as world-space
 *  coordinates. Procedural from a stable seed so each gallery's
 *  pattern is consistent across reloads. */
export function constellationStars(
  config: ConstellationConfig,
  count: number,
  seed: string,
): ConstellationStar[] {
  const rng = seededRandom(seed);
  const out: ConstellationStar[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rng() * 0.6;
    const r = (0.4 + rng() * 0.6) * config.spread;
    const yaw = config.direction.yaw + Math.cos(angle) * r;
    const altitude = config.direction.altitude + Math.sin(angle) * r;
    const x = Math.sin(yaw) * Math.cos(altitude) * config.distance;
    const y = Math.sin(altitude) * config.distance;
    const z = -Math.cos(yaw) * Math.cos(altitude) * config.distance;
    out.push({ position: [x, y, z] });
  }
  return out;
}

/** Build a local 2D frame perpendicular to a yaw/altitude direction.
 *  Returns the right and up basis vectors as world-space [x,y,z],
 *  with the centre at `distance` along the look direction. Used by
 *  named asterism builders to place explicit star positions in a sky
 *  plane facing the viewer. */
export function celestialFrame(
  yaw: number,
  altitude: number,
  distance: number,
) {
  const cx = Math.sin(yaw) * Math.cos(altitude) * distance;
  const cy = Math.sin(altitude) * distance;
  const cz = -Math.cos(yaw) * Math.cos(altitude) * distance;
  // "right" is horizontal in world XZ, perpendicular to look direction
  const rx = Math.cos(yaw);
  const rz = Math.sin(yaw);
  // "up" is perpendicular to both forward and right; rotates with altitude
  const ux = -Math.sin(yaw) * Math.sin(altitude);
  const uy = Math.cos(altitude);
  const uz = Math.cos(yaw) * Math.sin(altitude);
  return {
    center: [cx, cy, cz] as [number, number, number],
    right: [rx, 0, rz] as [number, number, number],
    up: [ux, uy, uz] as [number, number, number],
  };
}

/** Place 8 stars on a vesica piscis — two arcs meeting at two
 *  "kissing points," forming a lens-shaped figure. Star ordering:
 *
 *    0: L-kiss     ← left intersection (anchor)
 *    1: top-L-shoulder
 *    2: top-apex
 *    3: top-R-shoulder
 *    4: R-kiss     ← right intersection (anchor)
 *    5: bottom-R-shoulder
 *    6: bottom-apex
 *    7: bottom-L-shoulder
 *
 *  Pair with VESICA_EDGES (two open arcs sharing endpoints) and with
 *  VESICA_MAGNITUDES (variable brightness: kiss > apex > shoulder)
 *  for the institutional asterism reading of the Archive. */
export function vesicaPiscisStars(
  yaw: number,
  altitude: number,
  distance: number,
  width: number,
  height: number,
): ConstellationStar[] {
  const f = celestialFrame(yaw, altitude, distance);
  const hw = width / 2;
  const hh = height / 2;
  // Local 2D positions on the lens shape. Shoulders sit at the
  // arc parametrisation t=π/4 (top right) and 3π/4 (top left), which
  // is cos/sin(π/4) ≈ 0.707 along each axis. Gives a natural arch
  // curvature without explicit arc sampling.
  const k = 0.707;
  const points: [number, number][] = [
    [-hw, 0],            // 0 L-kiss
    [-hw * k, hh * k],   // 1 top-L-shoulder
    [0, hh],             // 2 top-apex
    [hw * k, hh * k],    // 3 top-R-shoulder
    [hw, 0],             // 4 R-kiss
    [hw * k, -hh * k],   // 5 bottom-R-shoulder
    [0, -hh],            // 6 bottom-apex
    [-hw * k, -hh * k],  // 7 bottom-L-shoulder
  ];
  return points.map(([x, y]) => ({
    position: [
      f.center[0] + f.right[0] * x + f.up[0] * y,
      f.center[1] + f.right[1] * x + f.up[1] * y,
      f.center[2] + f.right[2] * x + f.up[2] * y,
    ] as [number, number, number],
  }));
}

/** Open-graph edges for the vesica piscis: two arcs each travelling
 *  from L-kiss through the top (or bottom) shoulders + apex to
 *  R-kiss. No closed polygon — the structure reads as "two arches
 *  meeting" rather than a generic loop. */
export const VESICA_EDGES: ReadonlyArray<readonly [number, number]> = [
  // Top arch: L-kiss → top-L-shoulder → top-apex → top-R-shoulder → R-kiss
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  // Bottom arch: L-kiss → bottom-L-shoulder → bottom-apex → bottom-R-shoulder → R-kiss
  [0, 7],
  [7, 6],
  [6, 5],
  [5, 4],
];

/** Per-star size multipliers — kissing points are the brightest anchors
 *  of the figure (they define the two arcs); apexes slightly less;
 *  shoulders the dimmest. Mirrors real night-sky asterisms where a
 *  few magnitude-1 stars anchor a pattern of dimmer companions. */
export const VESICA_MAGNITUDES: ReadonlyArray<number> = [
  1.35, // 0 L-kiss
  0.7,  // 1 top-L-shoulder
  1.0,  // 2 top-apex
  0.7,  // 3 top-R-shoulder
  1.35, // 4 R-kiss
  0.7,  // 5 bottom-R-shoulder
  1.0,  // 6 bottom-apex
  0.7,  // 7 bottom-L-shoulder
];

/** Place 5 stars in a near-vertical line — the Solo Exhibition's
 *  asterism. A subtle hand-drawn sway (±0.4m across ~14m of height)
 *  keeps it from reading as a ruler-straight bar; visually identifies
 *  as a pillar / column. Star ordering bottom-to-top:
 *
 *    0: base  (foundation anchor — bright)
 *    1: lower shaft
 *    2: middle (the heart)
 *    3: upper shaft
 *    4: cap   (capital — brightest)
 *
 *  Pair with PILLAR_EDGES (open chain bottom-up) and PILLAR_MAGNITUDES
 *  for the institutional reading of "one sustained voice." */
export function pillarStars(
  yaw: number,
  altitude: number,
  distance: number,
  height: number,
): ConstellationStar[] {
  const f = celestialFrame(yaw, altitude, distance);
  const h = height / 2;
  // Local 2D positions. Horizontal deviation traces a gentle S-curve
  // so the column looks hand-drawn — base offsets right, cap offsets
  // left, with the heart roughly centred.
  const points: [number, number][] = [
    [0.4, -h],          // 0 base
    [0.15, -h * 0.5],   // 1 lower shaft
    [-0.05, 0],         // 2 middle
    [-0.2, h * 0.5],    // 3 upper shaft
    [-0.4, h],          // 4 cap
  ];
  return points.map(([x, y]) => ({
    position: [
      f.center[0] + f.right[0] * x + f.up[0] * y,
      f.center[1] + f.right[1] * x + f.up[1] * y,
      f.center[2] + f.right[2] * x + f.up[2] * y,
    ] as [number, number, number],
  }));
}

/** Open-graph edges for the pillar: a single chain bottom → top.
 *  No closed loop — the asterism reads as a vertical column rising
 *  through the sky. */
export const PILLAR_EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
];

/** Per-star size multipliers for the pillar. Base is bright (the
 *  foundation), cap is the brightest (the capital — what the eye
 *  finishes on), middle is mid-bright (the heart), and the two
 *  shaft stars between them are dimmer companions. */
export const PILLAR_MAGNITUDES: ReadonlyArray<number> = [
  1.2,  // 0 base
  0.7,  // 1 lower shaft
  1.0,  // 2 middle
  0.7,  // 3 upper shaft
  1.35, // 4 cap
];

/** Place `count` stars on a closed ring — the Exhibition Hall's
 *  asterism. Reads as "the space that holds": a closed enclosure with
 *  no apex, distinct from the open-arch shapes of the Solo pillar and
 *  the Archive vesica. Use 7 stars by default; the asterism remains
 *  legible from 5 to 9. Pair with ringEdges(count) for the closed
 *  loop connecting consecutive stars. */
export function ringStars(
  yaw: number,
  altitude: number,
  distance: number,
  radius: number,
  count = 7,
): ConstellationStar[] {
  const f = celestialFrame(yaw, altitude, distance);
  const out: ConstellationStar[] = [];
  for (let i = 0; i < count; i++) {
    const theta = (i / count) * Math.PI * 2 - Math.PI / 2; // start at top
    const x = Math.cos(theta) * radius;
    const y = Math.sin(theta) * radius;
    out.push({
      position: [
        f.center[0] + f.right[0] * x + f.up[0] * y,
        f.center[1] + f.right[1] * x + f.up[1] * y,
        f.center[2] + f.right[2] * x + f.up[2] * y,
      ] as [number, number, number],
    });
  }
  return out;
}

/** Closed-loop edges connecting consecutive ring stars. The ring is
 *  the one closed asterism in MNA's sky vocabulary — every other
 *  named figure (vesica, pillar) is an open graph. The closure is
 *  intentional: it speaks the exhibition's argument back at the sky. */
export function ringEdges(
  count: number,
): ReadonlyArray<readonly [number, number]> {
  const edges: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    edges.push([i, (i + 1) % count]);
  }
  return edges;
}

/** Magnitudes for a 7-star ring. One brightest anchor at top
 *  (asterism's visual entry), gentle variation around the ring to
 *  avoid mechanical symmetry. Real constellations never have
 *  uniform brightness. */
export const RING_MAGNITUDES_7: ReadonlyArray<number> = [
  1.3,  // 0 top anchor
  0.85, // 1
  1.05, // 2
  0.85, // 3
  1.1,  // 4 bottom-ish
  0.85, // 5
  1.05, // 6
];

/** Place 7 stars in an arrow asterism — the Exhibition Hall's figure.
 *  Modelled on Sagitta (the classical arrow constellation): a closed-
 *  triangle head + an open shaft + open fletching at the tail. Reads
 *  agentic (directional, intentional) and dimensional (variable
 *  brightness anchors a clear visual axis from tip to tail). Star
 *  ordering:
 *
 *    0: tip               (brightest — the spearhead anchor)
 *    1: left barb
 *    2: right barb
 *    3: nock              (head-shaft junction)
 *    4: tail              (shaft terminus)
 *    5: left fletching
 *    6: right fletching
 *
 *  `pointingAngle` rotates the arrow in its local sky plane; 0 = up,
 *  +π/6 ≈ 30° clockwise. A slight tilt off-vertical gives the
 *  asterism dynamic motion vs. the Solo pillar's stillness. */
export function arrowStars(
  yaw: number,
  altitude: number,
  distance: number,
  length: number,
  pointingAngle: number = Math.PI / 9, // 20° clockwise from vertical
): ConstellationStar[] {
  const f = celestialFrame(yaw, altitude, distance);
  const halfLen = length / 2;
  const headLen = length * 0.32;
  const fletchLen = length * 0.16;
  const barbWidth = length * 0.16;
  const fletchWidth = length * 0.12;

  // Arrow geometry in local 2D, pointing +Y before rotation.
  const local: [number, number][] = [
    [0, halfLen],                                  // 0 tip
    [-barbWidth, halfLen - headLen],               // 1 left barb
    [barbWidth, halfLen - headLen],                // 2 right barb
    [0, halfLen - headLen * 0.95],                 // 3 nock
    [0, -halfLen + fletchLen],                     // 4 tail
    [-fletchWidth, -halfLen],                      // 5 left fletching
    [fletchWidth, -halfLen],                       // 6 right fletching
  ];

  const cos = Math.cos(pointingAngle);
  const sin = Math.sin(pointingAngle);
  const rotated = local.map(
    ([x, y]) => [x * cos - y * sin, x * sin + y * cos] as [number, number],
  );

  return rotated.map(([x, y]) => ({
    position: [
      f.center[0] + f.right[0] * x + f.up[0] * y,
      f.center[1] + f.right[1] * x + f.up[1] * y,
      f.center[2] + f.right[2] * x + f.up[2] * y,
    ] as [number, number, number],
  }));
}

/** Edges for the arrow asterism. Closed-triangle head (tip → barbs →
 *  nock) marks the figure's directional anchor; open shaft + open
 *  fletching trail behind. Mixed open/closed structure is what reads
 *  as "an arrow flying" rather than "a generic polygon." */
export const ARROW_EDGES: ReadonlyArray<readonly [number, number]> = [
  // Arrowhead — a closed triangle.
  [0, 1], // tip → left barb
  [0, 2], // tip → right barb
  [1, 3], // left barb → nock
  [2, 3], // right barb → nock
  // Shaft.
  [3, 4],
  // Fletching — open V at the tail.
  [4, 5],
  [4, 6],
];

/** Per-star magnitudes. The spearhead carries the most weight (the
 *  curator's primary statement); the shaft and tail are quieter; the
 *  barbs and fletchings are accents. Real Sagitta has its brightest
 *  star at the tail (γ Sge), but for institutional reading we put the
 *  weight at the tip — the asterism announces its direction. */
export const ARROW_MAGNITUDES: ReadonlyArray<number> = [
  1.4,  // 0 tip
  0.75, // 1 left barb
  0.75, // 2 right barb
  1.0,  // 3 nock
  1.15, // 4 tail
  0.7,  // 5 left fletching
  0.7,  // 6 right fletching
];

function seededRandom(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
