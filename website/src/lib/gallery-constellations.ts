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
