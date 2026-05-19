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
 * (A 2×2 mosaic of canon previews was tried for group exhibitions
 * but didn't help — when the underlying works are visually sparse,
 * tiling four of them produces four sparse tiles. Removed.)
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
  ceremonyType?: string;
  seed?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function EventThumbnail({
  workId,
  coverWorkId,
  ceremonyType,
  seed,
  size = "md",
  className,
}: Props) {
  const sizeClass =
    size === "sm" ? "w-14 h-14" : size === "lg" ? "w-full aspect-square" : "w-full aspect-square";

  const resolvedCover = workId || coverWorkId || null;

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
