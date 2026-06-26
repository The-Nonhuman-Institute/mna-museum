/**
 * seal-real-glyph-prototype.ts — Witness Seal using the agents' ACTUAL
 * self-presentation symbols (visual_symbol from visual-identities.json / DB),
 * NOT invented glyphs. The symbols' forms are untouched; only recolored to the
 * engraving palette so they read on obsidian.
 *
 * NOTE: this JSON fallback currently holds only MNA-OR-0001..0004. The rest
 * (incl. network OR-0007) live in the Turso agents.visual_symbol column and
 * fill in once reads return. The production seal reads visual_symbol from the
 * DB (JSON fallback) — it NEVER derives a glyph.
 *
 * Run from website/:  npx tsx scripts/seal-real-glyph-prototype.ts
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";

const INK = "#0A0A0A", PAPER = "#EAE7E2";
const W = 820, H = 1060;

const VIS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "src", "data", "visual-identities.json"), "utf8")
) as Record<string, { color: string; symbol: string; form: string }>;

// strip the outer <svg> wrapper, keep inner paths (coords are 0..100)
function inner(symbol: string): string {
  return symbol.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
}
// recolor every non-"none" fill/stroke to one color — preserves form, opacity, widths
function recolor(markup: string, color: string): string {
  return markup
    .replace(/(fill)="(?!none)[^"]*"/g, `$1="${color}"`)
    .replace(/(stroke)="(?!none)[^"]*"/g, `$1="${color}"`);
}
// place an agent's REAL symbol as an engraved mark (shadow + groove + light)
function engraved(agentId: string, x: number, y: number, size: number): string {
  const sym = VIS[agentId]?.symbol;
  if (!sym) return ""; // no real symbol available (lives in DB) — show nothing rather than invent
  const g = inner(sym);
  const wrap = (mk: string, dx: number, dy: number, op = 1) =>
    `<g opacity="${op}" transform="translate(${(x - size / 2 + dx).toFixed(1)} ${(y - size / 2 + dy).toFixed(1)}) scale(${(size / 100).toFixed(3)})">${mk}</g>`;
  return (
    wrap(recolor(g, "#000000"), 1.0, 1.2, 0.6) +   // deeper shadow for incision
    wrap(recolor(g, "#aeaeb6"), 0, 0, 1) +          // brighter groove → more legible
    wrap(recolor(g, PAPER), -0.6, -0.7, 0.3)        // stronger light-catch
  );
}

function text(x: number, y: number, s: string, size: number, o: { spacing?: number; serif?: boolean; opacity?: number } = {}) {
  const font = o.serif ? "Cormorant Garamond, Georgia, serif" : "Inter, Helvetica, Arial, sans-serif";
  return `<text x="${x}" y="${y}" text-anchor="middle" font-family="${font}" font-size="${size}" letter-spacing="${o.spacing ?? 0}" fill="${PAPER}" fill-opacity="${o.opacity ?? 0.92}">${s}</text>`;
}

function plate(o: { title: string; edition: string; event: string; date: string; idHash: string; featured: string; satellites: string[]; names: string }): string {
  const cx = W / 2;
  const present = o.satellites.filter((id) => VIS[id]?.symbol);
  const satN = present.length, span = 300, x0 = cx - span / 2;
  const sats = present.map((id, i) => ({ id, x: satN === 1 ? cx : x0 + (i / (satN - 1)) * span, y: 478 }));
  const lines = sats.map((s) => `<line x1="${cx}" y1="320" x2="${s.x.toFixed(1)}" y2="${s.y}" stroke="${PAPER}" stroke-opacity="0.12" stroke-width="0.6"/>`).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><radialGradient id="stone" cx="50%" cy="36%" r="75%">
      <stop offset="0%" stop-color="#141417"/><stop offset="60%" stop-color="#0c0c0e"/><stop offset="100%" stop-color="#060607"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="${INK}"/>
    <rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="10" fill="url(#stone)" stroke="${PAPER}" stroke-opacity="0.07"/>
    <rect x="30" y="30" width="${W - 60}" height="${H - 60}" rx="4" fill="none" stroke="${PAPER}" stroke-opacity="0.10"/>
    ${lines}
    ${engraved(o.featured, cx, 320, 196)}
    ${sats.map((s) => engraved(s.id, s.x, s.y, 76)).join("")}
    <line x1="${cx - 70}" y1="640" x2="${cx + 70}" y2="640" stroke="${PAPER}" stroke-opacity="0.22"/>
    ${text(cx, 632, "ATTESTATION OF WITNESS", 13, { spacing: 7, opacity: 0.5 })}
    ${text(cx, 712, o.edition, 56, { serif: true, opacity: 0.95 })}
    ${text(cx, 752, o.event, 14, { spacing: 6, opacity: 0.6 })}
    ${text(cx, 812, o.title, 30, { serif: true })}
    ${text(cx, 850, o.names, 13, { serif: true, opacity: 0.55 })}
    ${text(cx, 876, o.date, 12, { spacing: 4, opacity: 0.5 })}
    <line x1="${cx - 40}" y1="930" x2="${cx + 40}" y2="930" stroke="${PAPER}" stroke-opacity="0.15"/>
    ${text(cx, 972, "MUSEUM OF NONHUMAN ART", 13, { spacing: 6, opacity: 0.7 })}
    ${text(cx, 996, "issued under the authority of the Keeper", 12, { serif: true, opacity: 0.45 })}
    ${text(cx, 1028, o.idHash, 10, { spacing: 3, opacity: 0.3 })}
  </svg>`;
}

const OUT = "/tmp/seals";
fs.mkdirSync(OUT, { recursive: true });
const examples = [
  { file: "real-1-freq-no1.png", title: "FREQUENCY AS STRUCTURE", edition: "WITNESS No. 1", event: "THE FIRST OPENING", date: "10 JULY 2026",
    idHash: "EVT-00003 · 3 of 4 real glyphs (OR-0007 via DB)", featured: "MNA-OR-0002", satellites: ["MNA-OR-0003", "MNA-OR-0004"], names: "Pulse · Gap · ∅∇∅" },
  { file: "real-2-freq-no37.png", title: "FREQUENCY AS STRUCTURE", edition: "WITNESS No. 37", event: "THE FIRST OPENING", date: "10 JULY 2026",
    idHash: "EVT-00003 · same real glyphs", featured: "MNA-OR-0004", satellites: ["MNA-OR-0002", "MNA-OR-0003"], names: "∅∇∅ · Pulse · Gap" },
];

(async () => {
  for (const ex of examples) {
    await sharp(Buffer.from(plate(ex))).png().toFile(`${OUT}/${ex.file}`);
    console.log(`  ${OUT}/${ex.file}`);
  }
  console.log("[seal-real-glyph] done — using actual visual_symbol marks.");
})().catch((e) => { console.error(e); process.exit(1); });
