"use client";

import { useEffect, useId, useMemo, useState } from "react";

import {
  canvasToDataUrl,
  flipVertically,
  readSurface,
  resolveSurface,
} from "@/lib/ingredient-surface";

/**
 * Typefaces.
 *
 * A typeface is a system, not a picture. An Originator working here decides how
 * a stroke behaves across an entire alphabet — what stays constant, what varies,
 * where the system breaks. That is closer to what Grid does structurally than
 * anything canvas or SVG asks for, and it is authored the same way an Originator
 * already authors SVG: as outlines.
 *
 * Rendered as a specimen. A specimen is how a typeface is actually read — a
 * sample at size, then the full character set — so this is the medium's native
 * presentation rather than a compromise.
 *
 * { "name": "Structure", "unitsPerEm": 1000,
 *   "glyphs": { "A": "M100 0 L500 900 L900 0 Z", ... },
 *   "specimen": "HAMBURGEFONS" }
 */

interface TypefaceSpec {
  name?: string;
  unitsPerEm?: number;
  glyphs?: Record<string, string>;
  advance?: number;
  specimen?: string;
  color?: string;
  background?: string;
  /** Glyphs are made OF this medium. See @/lib/ingredient-surface. */
  surface?: { type?: string; payload?: unknown };
}

function parse(json: string): TypefaceSpec | null {
  try { return JSON.parse(json) as TypefaceSpec; } catch {
    const last = json.lastIndexOf("}");
    if (last <= 0) return null;
    try { return JSON.parse(json.slice(0, last + 1)) as TypefaceSpec; } catch { return null; }
  }
}

export default function TypefaceRenderer({ json }: { json: string }) {
  const spec = useMemo(() => parse(json), [json]);

  // A typeface may declare `surface`, making its glyphs out of another medium —
  // letters cut from a shader rather than filled with a colour. Resolved after
  // first paint so the specimen is readable while the material is still being
  // rendered, and applied as an SVG fill pattern.
  const [inkUrl, setInkUrl] = useState<string | null>(null);
  const patternId = useId().replace(/:/g, "");

  useEffect(() => {
    let disposed = false;
    const surface = readSurface(spec);
    if (!surface) { setInkUrl(null); return; }
    void resolveSurface(surface, 512).then((c) => {
      if (disposed || !c) return;
      setInkUrl(canvasToDataUrl(flipVertically(c)));
    });
    return () => { disposed = true; };
  }, [spec]);

  if (!spec || !spec.glyphs || Object.keys(spec.glyphs).length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-ink p-6">
        <p className="text-[11px] font-mono text-mna-white/50">typeface could not be read</p>
      </div>
    );
  }

  const em = spec.unitsPerEm ?? 1000;
  const advance = spec.advance ?? em;
  const fg = spec.color ?? "#EAE7E2";
  const ink = inkUrl ? `url(#${patternId})` : fg;
  const bg = spec.background ?? "#0A0A0A";
  const glyphs = spec.glyphs;
  const chars = Object.keys(glyphs);

  // The sample line: what the Originator nominated, or whatever of the alphabet
  // it actually drew. Never invented characters it did not make.
  const sampleChars = (spec.specimen ?? chars.join(""))
    .split("")
    .filter((c) => glyphs[c])
    .slice(0, 14);
  const line = sampleChars.length > 0 ? sampleChars : chars.slice(0, 10);

  // Glyph outlines are authored with y running upward, as in a font. Flip once
  // here rather than asking every Originator to draw upside down.
  const flip = `translate(0 ${em}) scale(1 -1)`;

  return (
    <div className="w-full h-full overflow-auto" style={{ background: bg }}>
      {/* Defined once, referenced by the specimen and every glyph tile. A
          pattern defined inside one <svg> and referenced from another relies on
          ids being document-global, which browsers disagree about. */}
      {inkUrl && (
        <svg width="0" height="0" aria-hidden className="absolute pointer-events-none">
          <defs>
            <pattern
              id={patternId}
              patternUnits="objectBoundingBox"
              patternContentUnits="objectBoundingBox"
              width="1"
              height="1"
            >
              <image href={inkUrl} x="0" y="0" width="1" height="1" preserveAspectRatio="none" />
            </pattern>
          </defs>
        </svg>
      )}
      <div className="p-[6%] flex flex-col gap-[6%] min-h-full">
        {/* Sample at size */}
        <svg
          viewBox={`0 0 ${advance * line.length} ${em}`}
          className="w-full block"
          style={{ maxHeight: "48%" }}
          role="img"
          aria-label={spec.name ? `Specimen of ${spec.name}` : "Typeface specimen"}
        >
          <g transform={flip} fill={ink}>
            {line.map((c, i) => (
              <path key={`${c}-${i}`} d={glyphs[c]} transform={`translate(${i * advance} 0)`} />
            ))}
          </g>
        </svg>

        {/* The full set the Originator drew */}
        <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-[2%]">
          {chars.slice(0, 120).map((c) => (
            <svg key={c} viewBox={`0 0 ${advance} ${em}`} className="w-full block">
              <g transform={flip} fill={ink} opacity={0.85}>
                <path d={glyphs[c]} />
              </g>
            </svg>
          ))}
        </div>

        {spec.name && (
          <p
            className="text-[10px] uppercase tracking-[0.26em] mt-auto"
            style={{ color: fg, opacity: 0.5 }}
          >
            {spec.name} · {chars.length} glyph{chars.length === 1 ? "" : "s"}
          </p>
        )}
      </div>
    </div>
  );
}
