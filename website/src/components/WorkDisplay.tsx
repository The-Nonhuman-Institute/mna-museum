import MuseumFrame from "./MuseumFrame";
import { frames } from "./MuseumFrame";
import type { Work } from "@/lib/collection";
import type { FrameType } from "./MuseumFrame";

interface WorkDisplayProps {
  work: Work;
  size?: "gallery" | "detail" | "lightbox";
  showPlacard?: boolean;
}

/**
 * Target visual area (width × height in sq px) per display context.
 * Each frame type calculates its width from this so all frames
 * have roughly the same visual weight regardless of aspect ratio.
 */
const targetAreas: Record<string, number> = {
  gallery: 130000,
  detail: 360000,
  lightbox: 500000,
};

function selectFrameForWork(work: Work): FrameType {
  const aspect = work.display_aspect || 1;
  if (aspect >= 2.0) return "16x9";
  if (aspect >= 0.85) return "1x1";
  return "3x4";
}

/**
 * Calculate the width that gives a frame the target visual area.
 * area = width × height = width × (width / aspect)
 * width = sqrt(area × aspect)
 */
function calculateWidth(frameType: FrameType, size: string): number {
  const area = targetAreas[size] || targetAreas.gallery;
  const aspect = frames[frameType].aspect;
  return Math.round(Math.sqrt(area * aspect));
}

function textClasses(work: Work, size: string): string {
  const len = work.output_payload.length;
  const lines = work.output_payload.trim().split("\n").length;
  const maxLine = Math.max(
    ...work.output_payload.split("\n").map((l) => l.length)
  );

  if (len < 50 && lines <= 5) {
    return size === "lightbox"
      ? "text-2xl md:text-4xl"
      : size === "detail"
        ? "text-xl md:text-2xl"
        : "text-sm md:text-base";
  }

  if (len < 200 && maxLine <= 50) {
    return size === "lightbox"
      ? "text-base md:text-xl"
      : size === "detail"
        ? "text-sm md:text-base"
        : "text-[10px] md:text-xs";
  }

  return size === "lightbox"
    ? "text-sm md:text-base"
    : size === "detail"
      ? "text-xs md:text-sm"
      : "text-[8px] md:text-[10px]";
}

export default function WorkDisplay({
  work,
  size = "gallery",
  showPlacard = true,
}: WorkDisplayProps) {
  const frameType = selectFrameForWork(work);
  const width = calculateWidth(frameType, size);

  return (
    <MuseumFrame
      frame={frameType}
      width={width}
      originatorId={work.originator_id}
      phase={work.phase_at_submission || "I"}
      showPlacard={showPlacard}
    >
      <div className="w-full h-full bg-[#0e0c0a] flex items-center justify-center p-2 md:p-3 overflow-hidden">
        <pre
          className={`text-[#e8e4de] font-mono whitespace-pre-wrap break-words text-center max-w-full ${textClasses(work, size)}`}
          style={{ lineHeight: "1.4", maxHeight: "100%", overflow: "hidden" }}
        >
          {work.output_payload}
        </pre>
      </div>
    </MuseumFrame>
  );
}

export { selectFrameForWork, calculateWidth };
