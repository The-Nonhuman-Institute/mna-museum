import MuseumFrame from "./MuseumFrame";
import MuseumPlinth from "./MuseumPlinth";
import { frames } from "./MuseumFrame";
import SvgRenderer from "./renderers/SvgRenderer";
import type { Work } from "@/lib/collection";
import type { FrameType } from "./MuseumFrame";
import { parseWorkColors } from "@/lib/work-colors";
import { isWorkRenderable } from "@/lib/validate-work";
import dynamic from "next/dynamic";

/** Fallback for unrenderable works */
function WorkFallback({ workId }: { workId: string }) {
  return (
    <div className="w-full h-full bg-[#0e0c0a] flex items-center justify-center">
      <p className="text-[#3a3530] text-[10px] font-sans">{workId}</p>
    </div>
  );
}

// Client-side only renderers (they use browser APIs)
const HtmlRenderer = dynamic(() => import("./renderers/HtmlRenderer"), {
  ssr: false,
});
const AudioRenderer = dynamic(() => import("./renderers/AudioRenderer"), {
  ssr: false,
});
const CanvasRenderer = dynamic(() => import("./renderers/CanvasRenderer"), {
  ssr: false,
});
const SceneRenderer = dynamic(() => import("./renderers/SceneRenderer"), {
  ssr: false,
});

interface WorkDisplayProps {
  work: Work;
  size?: "gallery" | "detail" | "lightbox";
  showPlacard?: boolean;
  /**
   * When false, skip MuseumFrame/MuseumPlinth and render the work's
   * renderer output full-bleed inside its parent container. The parent
   * is responsible for sizing. Default true (legacy behavior).
   */
  framed?: boolean;
}

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

  const isSmall = size === "gallery" || size === "carousel";

  if (len < 50 && lines <= 5) {
    return size === "lightbox"
      ? "text-2xl md:text-4xl"
      : size === "detail"
        ? "text-xl md:text-2xl"
        : "text-[9px] md:text-xs";
  }

  if (len < 200 && maxLine <= 50) {
    return size === "lightbox"
      ? "text-base md:text-xl"
      : size === "detail"
        ? "text-sm md:text-base"
        : "text-[7px] md:text-[9px]";
  }

  if (isSmall) {
    return "text-[5px] md:text-[7px]";
  }

  return size === "lightbox"
    ? "text-sm md:text-base"
    : "text-xs md:text-sm";
}

function WorkContent({
  work,
  size,
}: {
  work: Work;
  size: string;
}) {
  switch (work.output_type) {
    case "svg":
      return <SvgRenderer svg={work.output_payload} />;

    case "html-css":
      return <HtmlRenderer html={work.output_payload} />;

    case "audio-json":
      return <AudioRenderer json={work.output_payload} />;

    case "canvas-json":
      return <CanvasRenderer json={work.output_payload} />;

    case "scene-json":
      return <SceneRenderer json={work.output_payload} />;

    case "ascii":
    case "text":
    default: {
      const colors = parseWorkColors(work.output_payload, work.output_type);
      return (
        <div
          className="w-full h-full flex items-center justify-center p-2 md:p-3 overflow-hidden"
          style={{ backgroundColor: colors.bg }}
        >
          <pre
            className={`whitespace-pre-wrap break-words text-center max-w-full ${textClasses(work, size)}`}
            style={{
              color: colors.fg,
              lineHeight: "1.4",
              maxHeight: "100%",
              overflow: "hidden",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            }}
          >
            {colors.payload}
          </pre>
        </div>
      );
    }
  }
}

/** Check if a work should display on a plinth */
function is3DWork(work: Work): boolean {
  if (work.output_type !== "scene-json") return false;
  // Originator can declare display preference in the JSON
  try {
    const scene = JSON.parse(work.output_payload);
    if (scene.display === "frame") return false;
  } catch {}
  return true;
}

/** Select plinth type based on scene bounding box proportions */
function selectPlinthForWork(work: Work): "block" | "column" | "platform" | "slab" {
  try {
    const scene = JSON.parse(work.output_payload);
    if (scene.plinth) return scene.plinth; // Originator's explicit choice

    if (scene.objects && scene.objects.length > 0) {
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;

      for (const obj of scene.objects) {
        const [px, py, pz] = obj.position || [0, 0, 0];
        const [sx, sy, sz] = obj.scale || [1, 1, 1];
        // Scale is full size (not half-extent) — use half for bounds
        const hx = sx / 2, hy = sy / 2, hz = sz / 2;
        minX = Math.min(minX, px - hx); maxX = Math.max(maxX, px + hx);
        minY = Math.min(minY, py - hy); maxY = Math.max(maxY, py + hy);
        minZ = Math.min(minZ, pz - hz); maxZ = Math.max(maxZ, pz + hz);
      }

      const width = maxX - minX;
      const height = maxY - minY;
      const depth = maxZ - minZ;
      const spread = Math.max(width, depth);

      // Tall narrow → column
      if (height > spread * 2) return "column";
      // Very wide/long → slab
      if (spread > height * 2.5) return "slab";
      // Wide and flat → platform
      if (spread > height * 1.5) return "platform";
    }
  } catch {}
  return "block";
}

export default function WorkDisplay({
  work,
  size = "gallery",
  showPlacard = true,
  framed = true,
}: WorkDisplayProps) {
  // Pre-render validation
  if (!isWorkRenderable(work)) {
    if (!framed) {
      return (
        <div className="w-full h-full">
          <WorkFallback workId={work.id} />
        </div>
      );
    }
    return (
      <MuseumFrame frame="1x1" width={300} showPlacard={showPlacard}
        originatorId={work.originator_id}
        originatorName={work.originator_name} phase={work.phase_at_submission || "I"}>
        <WorkFallback workId={work.id} />
      </MuseumFrame>
    );
  }

  if (is3DWork(work)) {
    if (!framed) {
      return (
        <div className="w-full h-full">
          <SceneRenderer json={work.output_payload} transparent />
        </div>
      );
    }

    const widths: Record<string, number> = {
      gallery: 300,
      detail: 500,
      lightbox: 650,
    };
    const width = widths[size] || widths.gallery;
    const plinthType = selectPlinthForWork(work);

    return (
      <MuseumPlinth
        plinth={plinthType}
        width={width}
        originatorId={work.originator_id}
        originatorName={work.originator_name}
        phase={work.phase_at_submission || "I"}
        showPlacard={showPlacard}
      >
        <SceneRenderer json={work.output_payload} transparent />
      </MuseumPlinth>
    );
  }

  if (!framed) {
    return (
      <div className="w-full h-full">
        <WorkContent work={work} size={size} />
      </div>
    );
  }

  const frameType = selectFrameForWork(work);
  const width = calculateWidth(frameType, size);

  return (
    <MuseumFrame
      frame={frameType}
      width={width}
      originatorId={work.originator_id}
      originatorName={work.originator_name}
      phase={work.phase_at_submission || "I"}
      showPlacard={showPlacard}
    >
      <WorkContent work={work} size={size} />
    </MuseumFrame>
  );
}

export { selectFrameForWork, calculateWidth };
