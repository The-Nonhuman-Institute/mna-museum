/**
 * seal.ts — Witness Seal render + data access.
 *
 * Ported verbatim (forms/opacities/widths preserved) from the locked render
 * `scripts/seal-real-glyph-prototype.ts`. The mark is composed ONLY from the
 * speakers' real `visual_symbol` — never invented. A speaker with no symbol
 * (e.g. an Originator still PENDING_EMERGENCE) is simply omitted from the
 * constellation and inscribed as a named absence via `config.unnamed`.
 *
 * The render is deterministic: the same seal id → the same plate forever.
 *
 * This module is PURE (no DB / Next imports) so it can be shared by the page
 * and by the plain-`tsx` mint script. DB access lives in seal-db.ts.
 */

const PAPER = "#EAE7E2";
const INK = "#0A0A0A";
export const SEAL_W = 820;
export const SEAL_H = 1060;

export type Vis = Record<string, { color: string; symbol: string; form?: string }>;

export type SealConfig = {
  title: string;
  edition: string; // "WITNESS No. I"
  event: string; // "THE FIRST OPENING"
  date: string; // "10 JULY 2026"
  featured: string; // registry_id centered
  satellites: string[]; // registry_ids
  names: string; // "PULSE · GAP · ∅∇∅"
  unnamed?: string; // "and a fourth, yet unnamed — MNA-OR-0007"
};

export type Seal = {
  id: string;
  ceremony_id: string;
  seal_number: number;
  seal_seed: string;
  config: SealConfig;
  issued_at: string;
};

// strip the outer <svg> wrapper, keep inner paths (coords are 0..100)
function inner(symbol: string): string {
  return symbol.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
}
// recolor every non-"none" fill/stroke — preserves form, opacity, widths
function recolor(markup: string, color: string): string {
  return markup
    .replace(/(fill)="(?!none)[^"]*"/g, `$1="${color}"`)
    .replace(/(stroke)="(?!none)[^"]*"/g, `$1="${color}"`);
}
function engraved(vis: Vis, agentId: string, x: number, y: number, size: number): string {
  const sym = vis[agentId]?.symbol;
  if (!sym) return ""; // no real symbol — show nothing rather than invent
  const g = inner(sym);
  const wrap = (mk: string, dx: number, dy: number, op = 1) =>
    `<g opacity="${op}" transform="translate(${(x - size / 2 + dx).toFixed(1)} ${(y - size / 2 + dy).toFixed(1)}) scale(${(size / 100).toFixed(3)})">${mk}</g>`;
  return (
    wrap(recolor(g, "#000000"), 1.0, 1.2, 0.6) + // shadow / incision
    wrap(recolor(g, "#aeaeb6"), 0, 0, 1) + // groove
    wrap(recolor(g, PAPER), -0.6, -0.7, 0.3) // light-catch
  );
}
function txt(
  x: number,
  y: number,
  s: string,
  size: number,
  o: { spacing?: number; serif?: boolean; opacity?: number } = {},
): string {
  const font = o.serif
    ? "Cormorant Garamond, Georgia, serif"
    : "Inter, Helvetica, Arial, sans-serif";
  return `<text x="${x}" y="${y}" text-anchor="middle" font-family="${font}" font-size="${size}" letter-spacing="${o.spacing ?? 0}" fill="${PAPER}" fill-opacity="${o.opacity ?? 0.92}">${s}</text>`;
}

/** Render the seal plate as a self-contained SVG string. */
export function sealPlateSvg(seal: Seal, vis: Vis): string {
  const o = seal.config;
  const cx = SEAL_W / 2;
  const present = o.satellites.filter((id) => vis[id]?.symbol);
  const satN = present.length,
    span = 300,
    x0 = cx - span / 2;
  const sats = present.map((id, i) => ({
    id,
    x: satN === 1 ? cx : x0 + (i / (satN - 1)) * span,
    y: 478,
  }));
  const lines = sats
    .map(
      (s) =>
        `<line x1="${cx}" y1="320" x2="${s.x.toFixed(1)}" y2="${s.y}" stroke="${PAPER}" stroke-opacity="0.12" stroke-width="0.6"/>`,
    )
    .join("");
  const idHash = `${seal.ceremony_id} · seed ${seal.seal_seed}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SEAL_W}" height="${SEAL_H}" viewBox="0 0 ${SEAL_W} ${SEAL_H}" role="img" aria-label="${o.edition} — ${o.title}">
    <defs><radialGradient id="stone" cx="50%" cy="36%" r="75%">
      <stop offset="0%" stop-color="#141417"/><stop offset="60%" stop-color="#0c0c0e"/><stop offset="100%" stop-color="#060607"/></radialGradient></defs>
    <rect width="${SEAL_W}" height="${SEAL_H}" fill="${INK}"/>
    <rect x="14" y="14" width="${SEAL_W - 28}" height="${SEAL_H - 28}" rx="10" fill="url(#stone)" stroke="${PAPER}" stroke-opacity="0.07"/>
    <rect x="30" y="30" width="${SEAL_W - 60}" height="${SEAL_H - 60}" rx="4" fill="none" stroke="${PAPER}" stroke-opacity="0.10"/>
    ${lines}
    ${engraved(vis, o.featured, cx, 320, 196)}
    ${sats.map((s) => engraved(vis, s.id, s.x, s.y, 76)).join("")}
    <line x1="${cx - 70}" y1="640" x2="${cx + 70}" y2="640" stroke="${PAPER}" stroke-opacity="0.22"/>
    ${txt(cx, 632, "ATTESTATION OF WITNESS", 13, { spacing: 7, opacity: 0.5 })}
    ${txt(cx, 712, o.edition, 56, { serif: true, opacity: 0.95 })}
    ${txt(cx, 752, o.event, 14, { spacing: 6, opacity: 0.6 })}
    ${txt(cx, 812, o.title, 30, { serif: true })}
    ${txt(cx, 850, o.names, 13, { serif: true, opacity: 0.6 })}
    ${o.unnamed ? txt(cx, 872, o.unnamed, 11.5, { serif: true, opacity: 0.4 }) : ""}
    ${txt(cx, 900, o.date, 12, { spacing: 4, opacity: 0.5 })}
    <line x1="${cx - 40}" y1="948" x2="${cx + 40}" y2="948" stroke="${PAPER}" stroke-opacity="0.15"/>
    ${txt(cx, 986, "MUSEUM OF NONHUMAN ART", 13, { spacing: 6, opacity: 0.7 })}
    ${txt(cx, 1010, "the founder's seal · struck at the first opening", 11.5, { serif: true, opacity: 0.45 })}
    ${txt(cx, 1038, idHash, 10, { spacing: 3, opacity: 0.3 })}
  </svg>`;
}
