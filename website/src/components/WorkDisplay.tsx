import MuseumFrame from "./MuseumFrame";
import MuseumPlinth from "./MuseumPlinth";
import { frames } from "./MuseumFrame";
import SvgRenderer from "./renderers/SvgRenderer";
import MNAComposition, { type CompositionTheme } from "./MNAComposition";
import type { Work } from "@/lib/collection";
import type { FrameType } from "./MuseumFrame";
import { parseWorkColors } from "@/lib/work-colors";
import { isWorkRenderable } from "@/lib/validate-work";
import dynamic from "next/dynamic";

/** Map a work's medium to a composition theme. Used as a visual fallback
 *  when the work has no renderable payload (mis-typed records, audio works
 *  stored as text, empty placeholders). */
function compositionThemeForWork(work: Work): CompositionTheme {
  const m = (work.medium || "").toLowerCase();
  if (/audio|sound|sonic|acoustic|music/.test(m)) return "fragmentation";
  if (/video|moving|motion|animation|temporal|film/.test(m)) return "fragmentation";
  if (/sculpture|spatial|3d|three-dimensional|installation/.test(m)) return "interruption";
  if (/image|visual|svg|painting|drawing|photograph/.test(m)) return "absence";
  if (/text|language|writing|word|poem|essay/.test(m)) return "structure";
  return "absence";
}

/** A work qualifies for composition fallback when its payload is empty or
 *  trivially short — i.e., it has no actual visual content to render. We
 *  deliberately don't substitute composition for substantive text/ASCII
 *  art, since that *is* the work. */
function needsCompositionFallback(work: Work): boolean {
  const payload = (work.output_payload ?? "").trim();
  return payload.length < 30;
}

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

/**
 * Heavy renderers each spin up their own browser context — html-css
 * mounts an iframe with srcDoc (separate JS realm), audio-json
 * initializes Web Audio, scene-json creates a WebGL context, etc. On
 * a list page with N works, that's N concurrent contexts. Beefy
 * desktops handle it; Atlas / agent browsers / older mobile freeze.
 *
 * For gallery-size cards we substitute the pre-generated static
 * preview PNG. Detail and lightbox sizes still mount the live
 * renderer so the work plays / animates / responds when a viewer is
 * actually looking at it.
 */
const HEAVY_OUTPUT_TYPES = new Set([
  "html-css",
  "audio-json",
  "canvas-json",
  "scene-json",
]);

function StaticPreview({ work }: { work: Work }) {
  return (
    <div className="w-full h-full bg-[#0e0c0a] relative overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/previews/${work.id}.png`}
        alt={work.title || work.id}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover block"
      />
      {/* Subtle motion indicator on cards whose live version animates,
          so a viewer knows there's more to see at the detail size. */}
      {work.output_type === "html-css" ||
      work.output_type === "canvas-json" ||
      work.output_type === "scene-json" ? (
        <div className="absolute bottom-2 right-2 flex items-center gap-1 opacity-40 pointer-events-none">
          <div className="w-1 h-2 bg-[#6a6560] rounded-full animate-pulse" />
          <div
            className="w-1 h-3 bg-[#6a6560] rounded-full animate-pulse"
            style={{ animationDelay: "0.2s" }}
          />
          <div
            className="w-1 h-2 bg-[#6a6560] rounded-full animate-pulse"
            style={{ animationDelay: "0.4s" }}
          />
        </div>
      ) : null}
    </div>
  );
}

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
  /* Gallery-size cards on list pages substitute the static preview
     for any heavy renderer. See HEAVY_OUTPUT_TYPES note above for
     why. */
  if (size === "gallery" && HEAVY_OUTPUT_TYPES.has(work.output_type)) {
    return <StaticPreview work={work} />;
  }

  switch (work.output_type) {
    case "svg":
      return <SvgRenderer svg={work.output_payload} />;

    case "html-css":
      return (
        <HtmlRenderer
          html={work.output_payload}
          interactive={size === "detail" || size === "lightbox"}
        />
      );

    case "audio-json":
      return <AudioRenderer json={work.output_payload} />;

    case "canvas-json":
      return <CanvasRenderer json={work.output_payload} />;

    case "scene-json":
      return <SceneRenderer json={work.output_payload} />;

    case "ascii":
    case "text":
    default: {
      if (needsCompositionFallback(work)) {
        return (
          <div className="w-full h-full overflow-hidden bg-ink">
            <MNAComposition
              theme={compositionThemeForWork(work)}
              seed={work.id}
              className="block w-full h-full"
            />
          </div>
        );
      }
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
    /* Gallery-size 3D works also fall back to the static preview —
       see HEAVY_OUTPUT_TYPES note. Each SceneRenderer creates a
       WebGL context, and the per-page context limit is small. */
    const sceneNode =
      size === "gallery" ? (
        <StaticPreview work={work} />
      ) : (
        <SceneRenderer json={work.output_payload} transparent />
      );

    if (!framed) {
      return <div className="w-full h-full">{sceneNode}</div>;
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
        {sceneNode}
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
