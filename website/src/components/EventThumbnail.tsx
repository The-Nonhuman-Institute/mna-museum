/**
 * EventThumbnail — visual stand-in for a ceremony.
 *
 * Resolution order:
 *   1. workId       — solo openings, chamber designations: the anchor
 *                     work's preview PNG.
 *   2. coverWorkId  — group exhibitions: the Curator chose a cover
 *                     work for the exhibition; we use it for the
 *                     ceremony's visual identity too.
 *   3. glyph fallback — anniversaries, founding addresses, network
 *                     admissions: a procedural MNAGlyph chosen for
 *                     the ceremony type, tinted from the founding
 *                     palette over a dark gradient panel.
 *
 * Used by the events page (featured card, upcoming list, past grid)
 * and the detail page hero. Always a square (aspect-ratio 1:1) so
 * the layout stays predictable across both image and glyph paths.
 */

import Image from "next/image";
import MNAGlyph, { type GlyphFamily } from "./MNAGlyph";

const CEREMONY_TYPE_GLYPH: Record<string, GlyphFamily> = {
  solo_exhibition_opening: "threshold",
  group_exhibition_opening: "grid-square",
  chamber_designation: "concentric",
  founding_anniversary: "phase-moon",
  first_canonization_anniversary: "eclipse",
  network_admission: "starburst-long",
  founding_address: "constellation",
};

const CEREMONY_TYPE_TINT: Record<string, string> = {
  solo_exhibition_opening: "#D9923E",   // saffron
  group_exhibition_opening: "#6B7280",  // slate
  chamber_designation: "#9E3A4A",       // madder
  founding_anniversary: "#D8C9B6",      // bone
  first_canonization_anniversary: "#E8E0CC",
  network_admission: "#467E72",         // verdigris
  founding_address: "#C49B3A",          // ochre
};

interface Props {
  workId?: string | null;
  /** For group exhibitions: the cover work chosen by the Curator at
   *  designation time. Stored on the exhibition row and on the
   *  ceremony's metadata.cover_work_id. Used when workId is null. */
  coverWorkId?: string | null;
  /** For group exhibitions: the full set of works in the show. When
   *  4+ ids are passed AND the layout is large enough to read,
   *  EventThumbnail renders a 2×2 mosaic instead of a single preview
   *  — distinctly "group show" visual language, and dense enough that
   *  even sparse individual previews fill the frame. */
  workIds?: string[] | null;
  ceremonyType?: string;
  seed?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Cheap deterministic shuffle by seed — gives every ceremony a
 *  stable but non-trivial work selection for its mosaic so the same
 *  show doesn't show the same four tiles every time you load. */
function pickMosaic(workIds: string[], cover: string | null, seed: string): string[] {
  const others = workIds.filter((w) => w !== cover);
  // FNV-1a-ish hash for stable ordering
  const h = (s: string): number => {
    let v = 2166136261;
    for (let i = 0; i < s.length; i++) {
      v ^= s.charCodeAt(i);
      v = Math.imul(v, 16777619);
    }
    return v >>> 0;
  };
  const sorted = [...others].sort((a, b) => h(seed + a) - h(seed + b));
  const out = cover ? [cover, ...sorted] : sorted;
  return out.slice(0, 4);
}

export default function EventThumbnail({
  workId,
  coverWorkId,
  workIds,
  ceremonyType,
  seed,
  size = "md",
  className,
}: Props) {
  const sizeClass =
    size === "sm" ? "w-14 h-14" : size === "lg" ? "w-full aspect-square" : "w-full aspect-square";

  const resolvedCover = workId || coverWorkId || null;
  const isLarge = size === "lg";
  const mosaicIds = isLarge && workIds && workIds.length >= 4
    ? pickMosaic(workIds, resolvedCover, seed ?? "")
    : null;

  // Group-exhibition mosaic: a 2×2 tile of canon previews. Reads as
  // distinct from single-work shows + visually fills the column even
  // when individual previews are sparse.
  if (mosaicIds && mosaicIds.length === 4) {
    return (
      <div
        className={`relative overflow-hidden bg-mna-white/[0.04] ${sizeClass} ${className ?? ""}`}
      >
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px bg-black/40">
          {mosaicIds.map((id) => (
            <div key={id} className="relative bg-mna-white/[0.04]">
              <Image
                src={`/previews/${id}.png`}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 768px) 50vw, 16vw"
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (resolvedCover) {
    return (
      <div
        className={`relative overflow-hidden bg-mna-white/[0.04] ${sizeClass} ${className ?? ""}`}
      >
        <Image
          src={`/previews/${resolvedCover}.png`}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 33vw"
        />
      </div>
    );
  }

  const family: GlyphFamily =
    (ceremonyType && CEREMONY_TYPE_GLYPH[ceremonyType]) || "compass-rose";
  const tint = (ceremonyType && CEREMONY_TYPE_TINT[ceremonyType]) || "#A8C4DB";

  // Glyph stand-in: rendered over a vertical gradient so the
  // institution-aesthetic-dark stays consistent with work thumbnails.
  return (
    <div
      className={`relative overflow-hidden ${sizeClass} ${className ?? ""}`}
      style={{
        background:
          "linear-gradient(180deg, #0E0F11 0%, #16181C 60%, #0A0B0D 100%)",
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <MNAGlyph
          family={family}
          seed={seed ?? ceremonyType ?? "event"}
          size={size === "sm" ? 36 : size === "lg" ? 220 : 96}
          color={tint}
          className="opacity-90"
        />
      </div>
    </div>
  );
}
