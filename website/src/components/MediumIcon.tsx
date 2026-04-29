/**
 * MediumIcon — minimal, abstract geometric glyphs communicating the medium of
 * a canonized work. No emoji. Inline SVG, currentColor, sized by font.
 *
 * Mapping is driven by output_type (the technical substrate): svg, html-css,
 * audio-json, canvas-json, scene-json, ascii, text. Each glyph is a single
 * 16×16 icon at 1.25px stroke, meant to read at 12–14px in a card placard.
 */

import type { Work } from "@/lib/collection";

type IconKind =
  | "vector"
  | "markup"
  | "audio"
  | "canvas"
  | "scene"
  | "text";

function kindFor(output_type: string): IconKind {
  switch (output_type) {
    case "svg":
      return "vector";
    case "html-css":
      return "markup";
    case "audio-json":
      return "audio";
    case "canvas-json":
      return "canvas";
    case "scene-json":
      return "scene";
    case "ascii":
    case "text":
    default:
      return "text";
  }
}

const LABELS: Record<IconKind, string> = {
  vector: "Vector",
  markup: "Markup",
  audio: "Audio",
  canvas: "Generative",
  scene: "3D Scene",
  text: "Text",
};

function Glyph({ kind }: { kind: IconKind }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.25,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (kind) {
    case "vector":
      // Open square with a single anchor dot — "vector primitive"
      return (
        <svg {...common}>
          <rect x="2.5" y="2.5" width="11" height="11" />
          <circle cx="8" cy="8" r="0.9" fill="currentColor" />
        </svg>
      );
    case "markup":
      // Angle brackets — "markup"
      return (
        <svg {...common}>
          <polyline points="5.5,4 2.5,8 5.5,12" />
          <polyline points="10.5,4 13.5,8 10.5,12" />
        </svg>
      );
    case "audio":
      // Sine wave — "audio"
      return (
        <svg {...common}>
          <path d="M1.5 8 C 3.5 4, 5.5 4, 7.5 8 S 11.5 12, 13.5 8" />
          <line x1="14.5" y1="8" x2="14.5" y2="8" />
        </svg>
      );
    case "canvas":
      // Scatter nodes — "generative / procedural"
      return (
        <svg {...common}>
          <circle cx="4" cy="4.5" r="0.9" fill="currentColor" />
          <circle cx="11.5" cy="4" r="0.9" fill="currentColor" />
          <circle cx="8" cy="8.5" r="0.9" fill="currentColor" />
          <circle cx="3.5" cy="11.5" r="0.9" fill="currentColor" />
          <circle cx="12" cy="12" r="0.9" fill="currentColor" />
        </svg>
      );
    case "scene":
      // Isometric cube — "3D scene"
      return (
        <svg {...common}>
          <polygon points="8,2.5 14,6 14,12 8,15.5 2,12 2,6" />
          <polyline points="2,6 8,9.5 14,6" />
          <line x1="8" y1="9.5" x2="8" y2="15.5" />
        </svg>
      );
    case "text":
    default:
      // Three short horizontal rules — "text"
      return (
        <svg {...common}>
          <line x1="3" y1="5" x2="13" y2="5" />
          <line x1="3" y1="8" x2="10" y2="8" />
          <line x1="3" y1="11" x2="12" y2="11" />
        </svg>
      );
  }
}

interface MediumIconProps {
  work: Pick<Work, "output_type">;
  className?: string;
  showLabel?: boolean;
}

export default function MediumIcon({
  work,
  className = "",
  showLabel = false,
}: MediumIconProps) {
  const kind = kindFor(work.output_type);
  const label = LABELS[kind];
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      title={label}
      aria-label={label}
    >
      <Glyph kind={kind} />
      {showLabel && (
        <span className="text-[10px] uppercase tracking-[0.15em]">{label}</span>
      )}
    </span>
  );
}

export { kindFor };
export type { IconKind };
