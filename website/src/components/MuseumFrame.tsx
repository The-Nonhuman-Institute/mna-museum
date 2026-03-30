import Image from "next/image";

/*
 * MuseumFrame — Photorealistic gallery frame overlay system
 *
 * Architecture: Two-layer stack.
 *   Bottom layer: artwork image, positioned inside the frame's cutout area
 *   Top layer: frame PNG overlay with transparent center, pointer-events: none
 *
 * The frame PNG sits on top of the artwork. The artwork is inset to align
 * with the transparent cutout using measured percentages from the actual assets.
 *
 * Frame selection is automatic based on artwork aspect ratio, or manually
 * overridden via the `frame` prop.
 */

type FrameType = "1x1" | "3x4" | "16x9" | "21x9";

interface FrameConfig {
  src: string;
  /** Aspect ratio of the full frame image (width / height) */
  aspect: number;
  /** Inner cutout insets as percentages of the full frame dimensions */
  inset: { top: number; right: number; bottom: number; left: number };
}

const frames: Record<FrameType, FrameConfig> = {
  "1x1": {
    src: "/frames/mona-frame-standard-1x1-base.png",
    aspect: 810 / 854,
    inset: { top: 10.4, right: 12.1, bottom: 14.2, left: 12.3 },
  },
  "3x4": {
    src: "/frames/mona-frame-standard-3x4-base.png",
    aspect: 627 / 940,
    inset: { top: 8.5, right: 13.9, bottom: 10.0, left: 13.6 },
  },
  "16x9": {
    src: "/frames/mona-frame-standard-16x9-base.png",
    aspect: 1027 / 604,
    inset: { top: 14.9, right: 10.4, bottom: 16.2, left: 10.3 },
  },
  "21x9": {
    src: "/frames/mona-frame-standard-21x9-base.png",
    aspect: 1369 / 390,
    inset: { top: 10.0, right: 3.9, bottom: 12.3, left: 3.9 },
  },
};

/**
 * Given an artwork's aspect ratio, pick the best matching frame.
 */
function selectFrame(artworkAspect: number): FrameType {
  if (artworkAspect >= 2.5) return "21x9";
  if (artworkAspect >= 1.3) return "16x9";
  if (artworkAspect >= 0.85) return "1x1";
  return "3x4";
}

export interface MuseumFrameProps {
  /** URL of the artwork image */
  src?: string;
  alt?: string;
  /** Force a specific frame type. If omitted, auto-selects based on artworkAspect. */
  frame?: FrameType;
  /** Artwork's width/height ratio — used for auto frame selection. Defaults to 1. */
  artworkAspect?: number;
  /** Work ID for placard */
  workId?: string;
  /** Originator ID for placard */
  originatorId?: string;
  /** Phase designation for placard */
  phase?: string;
  /** Show placard below frame */
  showPlacard?: boolean;
  /** Max width in pixels. Defaults to 400. */
  maxWidth?: number;
  /** Render as hero (full-width, no max-width cap) */
  hero?: boolean;
  /** Additional className on the outer wrapper */
  className?: string;
}

export default function MuseumFrame({
  src,
  alt = "Work",
  frame: frameOverride,
  artworkAspect = 1,
  workId,
  originatorId,
  phase,
  showPlacard = true,
  maxWidth = 400,
  hero = false,
  className = "",
}: MuseumFrameProps) {
  const frameType = frameOverride ?? selectFrame(artworkAspect);
  const config = frames[frameType];

  const containerStyle: React.CSSProperties = {
    position: "relative",
    width: "100%",
    maxWidth: hero ? undefined : maxWidth,
    aspectRatio: `${config.aspect}`,
  };

  // The artwork area, inset from the frame edges
  const artworkStyle: React.CSSProperties = {
    position: "absolute",
    top: `${config.inset.top}%`,
    right: `${config.inset.right}%`,
    bottom: `${config.inset.bottom}%`,
    left: `${config.inset.left}%`,
    overflow: "hidden",
  };

  return (
    <div className={`inline-block ${className}`} style={hero ? { width: "100%" } : { maxWidth }}>
      {/* Frame + artwork container */}
      <div style={containerStyle}>
        {/* Layer 1: Artwork (behind) */}
        <div style={artworkStyle}>
          {src ? (
            <Image
              src={src}
              alt={alt}
              fill
              className="object-cover"
              sizes={hero ? "100vw" : `${maxWidth}px`}
            />
          ) : (
            <div className="w-full h-full bg-[#0e0c0a] flex items-center justify-center">
              <div className="text-center">
                {workId && (
                  <p className="text-[9px] font-mono text-[#3a3530]">
                    {workId}
                  </p>
                )}
                <p className="text-[8px] text-[#2a2520] mt-1">
                  Awaiting work
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Layer 2: Frame overlay (on top) */}
        <Image
          src={config.src}
          alt=""
          fill
          className="pointer-events-none object-contain"
          style={{ zIndex: 1 }}
          sizes={hero ? "100vw" : `${maxWidth}px`}
          priority
        />
      </div>

      {/* Placard */}
      {showPlacard && (workId || originatorId) && (
        <div className="mt-3 text-center">
          {workId && (
            <p className="text-[10px] font-mono text-[#8a8680]">{workId}</p>
          )}
          {originatorId && (
            <p className="text-[10px] text-[#8a8680]">{originatorId}</p>
          )}
          {phase && (
            <p className="text-[9px] text-[#8a8680]/60 uppercase tracking-wider mt-0.5">
              Phase {phase}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export { selectFrame, frames };
export type { FrameType };
