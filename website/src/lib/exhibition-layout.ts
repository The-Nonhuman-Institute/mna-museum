/**
 * Exhibition Works — deterministic spatial layout.
 *
 * The Works View treats an exhibition as a *field of relationships* rather
 * than a list. Each work is placed within one of five soft zones that carry
 * structural meaning (not chronology). Positions are:
 *
 *   1. Curator-authored (future) — read from `exhibition.positions[workId]`
 *   2. Deterministic fallback    — computed here from work_id + canon_status
 *
 * The fallback assigns a zone by canon status (canonized distributed across
 * four "productive" zones by hash; in-review lands at Threshold/Silence;
 * rejected lands in Silence) and places the node at a hash-seeded offset
 * from the zone center. Output is stable across reloads for the same inputs.
 */

export type Zone =
  | "emerging"
  | "silence"
  | "threshold"
  | "formal"
  | "drift";

export interface ZoneDef {
  id: Zone;
  label: string;
  sublabel: string;
  /** Normalized (0-1) coordinates for the zone's conceptual centre. */
  center: { x: number; y: number };
  /** Normalized scatter radius for nodes placed in this zone. */
  radius: number;
  /** Anchor for the zone's text label (normalized). */
  labelAnchor: { x: number; y: number };
}

export const ZONES: ZoneDef[] = [
  {
    id: "emerging",
    label: "Emerging Order",
    sublabel: "Structure Seeking",
    center: { x: 0.30, y: 0.28 },
    radius: 0.13,
    labelAnchor: { x: 0.05, y: 0.05 },
  },
  {
    id: "silence",
    label: "Silence & Residuals",
    sublabel: "Negative Space",
    center: { x: 0.78, y: 0.28 },
    radius: 0.14,
    labelAnchor: { x: 0.66, y: 0.05 },
  },
  {
    id: "threshold",
    label: "Threshold Moments",
    sublabel: "Rupture / Shift",
    center: { x: 0.52, y: 0.54 },
    radius: 0.12,
    labelAnchor: { x: 0.44, y: 0.42 },
  },
  {
    id: "formal",
    label: "Formal Attempts",
    sublabel: "Early Signals",
    center: { x: 0.20, y: 0.80 },
    radius: 0.12,
    labelAnchor: { x: 0.04, y: 0.94 },
  },
  {
    id: "drift",
    label: "Pattern Drift",
    sublabel: "Unresolved Tendencies",
    center: { x: 0.78, y: 0.80 },
    radius: 0.12,
    labelAnchor: { x: 0.66, y: 0.94 },
  },
];

/** Stable non-cryptographic string hash; returns an unsigned 32-bit int. */
function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic [0,1) from a 32-bit integer seed. */
function rand01(seed: number): number {
  // LCG step — good enough for layout scatter; not cryptographic.
  const x = Math.imul(seed ^ 0x9e3779b1, 0x85ebca6b) >>> 0;
  return (x % 2147483647) / 2147483647;
}

export function pickZone(work: { id: string; canon_status: string }): Zone {
  const status = (work.canon_status || "").toUpperCase();
  if (status === "REJECTED") return "silence";
  if (status === "IN_REVIEW") {
    return hashStr(work.id) % 3 === 0 ? "silence" : "threshold";
  }
  // CANON or anything else productive — spread across four zones.
  const zones: Zone[] = ["emerging", "threshold", "formal", "drift"];
  return zones[hashStr(work.id) % zones.length]!;
}

export interface Placement {
  x: number;
  y: number;
  zone: Zone;
}

export function positionFor(work: {
  id: string;
  canon_status: string;
}): Placement {
  const zone = pickZone(work);
  const def = ZONES.find((z) => z.id === zone)!;
  const h = hashStr(work.id);
  const r = def.radius * (0.3 + rand01(h) * 0.75);
  const theta = rand01(h ^ 0xdeadbeef) * Math.PI * 2;
  const x = Math.max(0.04, Math.min(0.96, def.center.x + Math.cos(theta) * r));
  const y = Math.max(0.06, Math.min(0.94, def.center.y + Math.sin(theta) * r));
  return { x, y, zone };
}

export interface StoredPositions {
  [workId: string]: { x: number; y: number; zone?: Zone };
}

/**
 * Compute placements for a list of works. If `stored` contains a placement
 * for a given work, that is used verbatim; otherwise the deterministic
 * fallback is applied. This is what lets Curator-authored layouts override
 * the default scatter without any consumer code change.
 */
export function computePlacements(
  works: { id: string; canon_status: string }[],
  stored?: StoredPositions
): Placement[] {
  return works.map((w) => {
    const s = stored?.[w.id];
    if (s && typeof s.x === "number" && typeof s.y === "number") {
      return {
        x: s.x,
        y: s.y,
        zone: s.zone ?? pickZone(w),
      };
    }
    return positionFor(w);
  });
}

/**
 * Deterministic collision-relax pass. Treats each node as a rectangle in
 * normalized space (given dimensions) and iteratively pushes overlapping
 * pairs apart along the axis of smaller overlap. Positions stay clamped
 * inside the canvas so nothing escapes. Same inputs produce the same
 * output — the result is stable across reloads even when nudged.
 *
 * nodeW / nodeH are normalized (0–1) dimensions of a node, i.e. the
 * node's pixel size divided by the canvas's pixel size. Pass a small
 * padding via `gap` to keep an airspace between adjacent nodes.
 */
export function relaxPlacements(
  placements: Placement[],
  nodeW: number,
  nodeH: number,
  opts?: { iterations?: number; gap?: number; strength?: number }
): Placement[] {
  const iterations = opts?.iterations ?? 14;
  const gap = opts?.gap ?? 0.008;
  const strength = opts?.strength ?? 0.55;
  const minDx = nodeW + gap;
  const minDy = nodeH + gap;

  const pts = placements.map((p) => ({ ...p }));
  const clampX = (x: number) => Math.max(nodeW / 2 + 0.01, Math.min(1 - nodeW / 2 - 0.01, x));
  const clampY = (y: number) => Math.max(nodeH / 2 + 0.02, Math.min(1 - nodeH / 2 - 0.02, y));

  for (let it = 0; it < iterations; it++) {
    let moved = 0;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i]!;
        const b = pts[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        if (absDx < minDx && absDy < minDy) {
          const ovX = minDx - absDx;
          const ovY = minDy - absDy;
          // Tiebreaker based on index pair keeps the pass deterministic.
          const preferX = ovX < ovY || (ovX === ovY && (i + j) % 2 === 0);
          if (preferX) {
            const nudge = (ovX * strength) / 2;
            const sign = dx === 0 ? ((i + j) % 2 === 0 ? 1 : -1) : dx > 0 ? 1 : -1;
            a.x = clampX(a.x - sign * nudge);
            b.x = clampX(b.x + sign * nudge);
          } else {
            const nudge = (ovY * strength) / 2;
            const sign = dy === 0 ? ((i + j) % 2 === 0 ? 1 : -1) : dy > 0 ? 1 : -1;
            a.y = clampY(a.y - sign * nudge);
            b.y = clampY(b.y + sign * nudge);
          }
          moved++;
        }
      }
    }
    if (moved === 0) break;
  }
  return pts;
}
