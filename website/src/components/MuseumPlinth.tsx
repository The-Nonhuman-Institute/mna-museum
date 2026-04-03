import Image from "next/image";

type PlinthType = "block" | "column" | "platform" | "slab";

interface PlinthConfig {
  src: string;
  /** Aspect ratio of the plinth image (width / height) */
  aspect: number;
  /** How much of the total height the 3D scene occupies above the plinth */
  sceneRatio: number;
}

const plinths: Record<PlinthType, PlinthConfig> = {
  block: {
    src: "/plinths/mona-plinth-block-standard-1x1-base.png",
    aspect: 594 / 556,
    sceneRatio: 0.65,
  },
  column: {
    src: "/plinths/mona-plinth-column-standard-1x3-base.png",
    aspect: 237 / 904,
    sceneRatio: 0.55,
  },
  platform: {
    src: "/plinths/mona-plinth-platform-standard-2x2-base.png",
    aspect: 1014 / 362,
    sceneRatio: 0.75,
  },
  slab: {
    src: "/plinths/mona-plinth-slab-standard-3x1-base.png",
    aspect: 1302 / 352,
    sceneRatio: 0.78,
  },
};

function selectPlinth(): PlinthType {
  // Default to block — the most versatile
  return "block";
}

export interface MuseumPlinthProps {
  children?: React.ReactNode;
  plinth?: PlinthType;
  originatorId?: string;
  phase?: string;
  showPlacard?: boolean;
  width?: number;
  className?: string;
}

export default function MuseumPlinth({
  children,
  plinth: plinthOverride,
  originatorId,
  phase,
  showPlacard = true,
  width = 400,
  className = "",
}: MuseumPlinthProps) {
  const plinthType = plinthOverride ?? selectPlinth();
  const config = plinths[plinthType];

  // Calculate dimensions, capping total height to prevent viewport overflow
  const maxHeight = 600; // Max total height in pixels
  let plinthHeight = width / config.aspect;
  let sceneHeight = plinthHeight * (config.sceneRatio / (1 - config.sceneRatio));
  let overlap = plinthHeight * 0.15;
  let totalHeight = sceneHeight + plinthHeight - overlap;

  // If total height exceeds max, scale everything down proportionally
  if (totalHeight > maxHeight) {
    const scale = maxHeight / totalHeight;
    plinthHeight *= scale;
    sceneHeight *= scale;
    overlap *= scale;
    totalHeight = maxHeight;
  }

  return (
    <div className={className} style={{ width, maxWidth: "100%" }}>
      <div style={{ position: "relative", width: "100%", height: totalHeight }}>
        {/* Layer 1: 3D scene — overlaps plinth top */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: sceneHeight,
            zIndex: 1,
          }}
        >
          {children && (
            <div style={{ width: "100%", height: "100%" }}>{children}</div>
          )}
        </div>

        {/* Layer 2: Plinth PNG — anchored to bottom */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: plinthHeight,
          }}
        >
          <Image
            src={config.src}
            alt=""
            fill
            className="pointer-events-none"
            style={{ objectFit: "contain", objectPosition: "bottom" }}
            sizes={`${width}px`}
          />
        </div>
      </div>

      {/* Placard */}
      {showPlacard && originatorId && (
        <div className="mt-3 text-center">
          <p className="text-[11px] text-[#8a8680]">{originatorId}</p>
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

export { plinths, selectPlinth };
export type { PlinthType };
