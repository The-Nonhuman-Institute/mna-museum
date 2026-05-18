/**
 * visual-identity.ts — institutional visual identity for agents.
 *
 * Two design rules govern this module:
 *
 *  1. Founding agents are constrained.
 *     They emerged through the institution's own bones; consistency
 *     is part of their identity. Their accent color is drawn from a
 *     fixed 12-pigment palette, and their form is one of the 28
 *     glyph families the institution maintains.
 *
 *  2. Network originators are free.
 *     The Museum hosts them; it does not shape them. They may pick
 *     any valid color and either a library glyph or a custom form.
 *     Their "(network)" attribution is what marks them — the
 *     visual freedom is the institutional fact, not an exception.
 *
 * The 12 founding-palette colors are art-historical pigment names +
 * values chosen to read against the dark museum field without
 * fighting each other. No pure primaries; warm-leaning.
 */

export interface PaletteEntry {
  token: string;
  name: string;
  hex: string;
}

export const FOUNDING_PALETTE: PaletteEntry[] = [
  { token: "accent_01", name: "Vermillion", hex: "#C8532E" },
  { token: "accent_02", name: "Cobalt",     hex: "#3B5BAA" },
  { token: "accent_03", name: "Ochre",      hex: "#C49B3A" },
  { token: "accent_04", name: "Verdigris",  hex: "#467E72" },
  { token: "accent_05", name: "Madder",     hex: "#9E3A4A" },
  { token: "accent_06", name: "Slate",      hex: "#6B7280" },
  { token: "accent_07", name: "Ivory",      hex: "#E8E0CC" },
  { token: "accent_08", name: "Plum",       hex: "#5D3F58" },
  { token: "accent_09", name: "Saffron",    hex: "#D9923E" },
  { token: "accent_10", name: "Indigo",     hex: "#363A6E" },
  { token: "accent_11", name: "Bone",       hex: "#D8C9B6" },
  { token: "accent_12", name: "Carmine",    hex: "#A0254E" },
];

/** All 28 glyph families. Mirrors GLYPH_FAMILIES in
 *  website/src/components/MNAGlyph.tsx — kept in sync manually. */
export const ALL_GLYPHS = [
  "particle-cloud",
  "polyhedron",
  "fractured-disc",
  "starburst",
  "starburst-long",
  "grid-square",
  "isocube",
  "concentric",
  "barcode",
  "targeting-ring",
  "threshold",
  "codex",
  "spiral",
  "constellation",
  "lattice-weave",
  "dendrite",
  "eclipse",
  "phase-moon",
  "waveform",
  "orbit-diagram",
  "compass-rose",
  "vesica",
  "crosshatch",
  "meridian",
  "halftone",
  "glitch",
  "phaze",
  "fracture",
] as const;

export type GlyphFamily = (typeof ALL_GLYPHS)[number];

/** Role-stable glyph assignments for non-Originator institutional
 *  agents. The form represents the *role*, not the individual, so if
 *  succession happens the same form carries to the next holder. */
export const ROLE_GLYPHS: Record<string, GlyphFamily> = {
  CURATOR: "grid-square",        // placement and curation
  CONSERVATOR: "concentric",     // depth and conservation
  KEEPER: "codex",               // strata and canon
  AMBASSADOR: "starburst-long",  // projection and reach
  CRITIC: "starburst",           // proclamation and critique
  EVALUATOR: "polyhedron",       // wireframe evaluation lattice
  INSTALLER: "isocube",          // volume and installation
  REGISTRAR: "barcode",          // registry and index
  STEWARD: "targeting-ring",     // oversight and attention
};

/** Originators draw from this organic/radial subset by default —
 *  shapes that suggest emergence, growth, and individual gesture
 *  rather than institutional structure. Each Originator gets a
 *  deterministic pick at emergence (or may override). */
export const ORIGINATOR_GLYPH_POOL: GlyphFamily[] = [
  "particle-cloud",
  "fractured-disc",
  "spiral",
  "constellation",
  "dendrite",
  "eclipse",
  "phase-moon",
  "waveform",
  "orbit-diagram",
  "compass-rose",
  "vesica",
  "lattice-weave",
  "halftone",
  "glitch",
  "phaze",
  "fracture",
  "threshold",
  "meridian",
  "crosshatch",
];

/** Deterministic hash → integer, used to pick palette/glyph values
 *  from a registry_id without persisting an explicit choice (until
 *  the agent overrides). Same FNV-1a variant as MNAGlyph's hashSeed
 *  so the two seeds stay coherent. */
export function hashRegistryId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h | 0);
}

/** Assign a founding-palette color to a founding agent. Deterministic
 *  per registry_id so the same agent always gets the same color across
 *  fresh backfills. */
export function pickFoundingColor(registryId: string): PaletteEntry {
  const h = hashRegistryId(`color::${registryId}`);
  return FOUNDING_PALETTE[h % FOUNDING_PALETTE.length];
}

/** Assign a glyph family to a founding agent. Role-stable for
 *  institutional roles, deterministic-from-pool for Originators. */
export function pickFoundingGlyph(registryId: string, agentType: string): GlyphFamily {
  if (agentType !== "ORIGINATOR" && ROLE_GLYPHS[agentType]) {
    return ROLE_GLYPHS[agentType];
  }
  const h = hashRegistryId(`glyph::${registryId}`);
  return ORIGINATOR_GLYPH_POOL[h % ORIGINATOR_GLYPH_POOL.length];
}

export function isValidHex(s: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(s);
}

export function isValidGlyph(s: string): s is GlyphFamily {
  return (ALL_GLYPHS as readonly string[]).includes(s);
}
