import Image from "next/image";
import { originatorName as resolveOriginator } from "@/lib/originator-name";

type FrameType = "1x1" | "3x4" | "16x9" | "21x9";

interface FrameConfig {
  src: string;
  aspect: number;
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

function selectFrame(artworkAspect: number): FrameType {
  if (artworkAspect >= 2.5) return "21x9";
  if (artworkAspect >= 1.3) return "16x9";
  if (artworkAspect >= 0.85) return "1x1";
  return "3x4";
}

export interface MuseumFrameProps {
  src?: string;
  alt?: string;
  children?: React.ReactNode;
  frame?: FrameType;
  artworkAspect?: number;
  workId?: string;
  originatorId?: string;
  originatorName?: string | null;
  phase?: string;
  showPlacard?: boolean;
  /** Width in pixels. The frame renders at exactly this width. */
  width?: number;
  /** Additional className on the outer wrapper */
  className?: string;
}

export default function MuseumFrame({
  src,
  alt = "Work",
  children,
  frame: frameOverride,
  artworkAspect = 1,
  workId,
  originatorId,
  originatorName,
  phase,
  showPlacard = true,
  width = 400,
  className = "",
}: MuseumFrameProps) {
  const frameType = frameOverride ?? selectFrame(artworkAspect);
  const config = frames[frameType];

  return (
    <div className={className} style={{ width, maxWidth: "100%" }}>
      {/* Frame container — aspect-ratio based, scales with container */}
      <div style={{ position: "relative", width: "100%", aspectRatio: `${config.aspect}` }}>
        {/* Layer 1: Artwork — positioned inside the frame cutout */}
        <div
          style={{
            position: "absolute",
            top: `${config.inset.top}%`,
            right: `${config.inset.right}%`,
            bottom: `${config.inset.bottom}%`,
            left: `${config.inset.left}%`,
            overflow: "hidden",
          }}
        >
          {children ? (
            <div style={{ width: "100%", height: "100%" }}>{children}</div>
          ) : src ? (
            <Image
              src={src}
              alt={alt}
              fill
              className="object-cover"
              sizes={`${width}px`}
            />
          ) : (
            <div className="w-full h-full bg-[#0e0c0a] flex items-center justify-center">
              <p className="text-[9px] text-[#2a2520]">Awaiting work</p>
            </div>
          )}
        </div>

        {/* Layer 2: Frame PNG overlay */}
        <Image
          src={config.src}
          alt=""
          fill
          className="pointer-events-none"
          style={{ zIndex: 1, objectFit: "fill" }}
          sizes={`${width}px`}
          priority
        />
      </div>

      {/* Placard */}
      {showPlacard && (workId || originatorId) && (
        <div className="mt-3 text-center">
          {(originatorName || originatorId) && (
            <p className="text-[11px] text-[#8a8680]">
              {resolveOriginator(originatorName, originatorId ?? "")}
            </p>
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
