"use client";

/**
 * ExhibitionWorkPanel — work presentation for the exhibition page.
 *
 * Unlike WorkDisplay (which wraps every work in a heavy MuseumFrame), this
 * component renders a work with a quieter container suited to a Curator's
 * arranged sequence: clean borders, generous breathing room, a serif placard,
 * and sizing that scales with the work's actual content.
 *
 * The component does not change anything about WorkDisplay or MuseumFrame —
 * those continue to be used elsewhere on the site (canon page, work detail
 * page) where the framed museum object aesthetic is correct. This component
 * exists because an exhibition page should feel composed, not surveyed.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { parseWorkColors } from "@/lib/work-colors";
import type { Work } from "@/lib/collection";

// Match WorkDisplay's dynamic-import pattern. These chunks are shared.
const HtmlRenderer = dynamic(() => import("./renderers/HtmlRenderer"), {
  ssr: false,
});
const SvgRenderer = dynamic(() => import("./renderers/SvgRenderer"));
const CanvasRenderer = dynamic(() => import("./renderers/CanvasRenderer"), {
  ssr: false,
});
const SceneRenderer = dynamic(() => import("./renderers/SceneRenderer"), {
  ssr: false,
});
const AudioRenderer = dynamic(() => import("./renderers/AudioRenderer"), {
  ssr: false,
});

interface ExhibitionWorkPanelProps {
  work: Work;
  index: number; // 1-based position in the curatorial sequence
}

/**
 * Choose a display height for the work area based on its medium and content
 * length. Text works that say more get more room. The HTML/CSS animation gets
 * its own generous square. 3D and other media use the standard exhibition height.
 */
function selectDisplayHeight(work: Work): number {
  const isText = work.output_type === "text" || work.output_type === "ascii";
  if (isText) {
    const len = work.output_payload.length;
    if (len < 150) return 360; // tiny fragments
    if (len < 500) return 460; // medium texts
    return 580; // long texts
  }
  if (work.output_type === "html-css") return 600;
  if (work.output_type === "scene-json") return 540;
  return 500;
}

function selectTextSize(payloadLen: number): string {
  // At exhibition scale, text should be readable. These sizes are deliberately
  // larger than WorkDisplay's gallery sizes — the visitor is here to read.
  if (payloadLen < 80) return "text-xl md:text-2xl";
  if (payloadLen < 200) return "text-base md:text-lg";
  if (payloadLen < 500) return "text-sm md:text-base";
  return "text-xs md:text-sm";
}

function renderWorkArea(work: Work) {
  const isText = work.output_type === "text" || work.output_type === "ascii";

  if (isText) {
    const colors = parseWorkColors(work.output_payload, work.output_type);
    const sizeClass = selectTextSize(colors.payload.length);
    return (
      <div
        className="w-full h-full flex items-center justify-center px-8 md:px-16 py-10 md:py-14 overflow-hidden"
        style={{ backgroundColor: colors.bg }}
      >
        <pre
          className={`font-mono whitespace-pre-wrap break-words text-center max-w-full ${sizeClass}`}
          style={{
            color: colors.fg,
            lineHeight: "1.7",
            maxHeight: "100%",
            overflow: "hidden",
          }}
        >
          {colors.payload}
        </pre>
      </div>
    );
  }

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
    default:
      return (
        <div className="w-full h-full bg-[#0e0c0a] flex items-center justify-center">
          <p className="text-[#3a3530] text-[10px] font-mono">{work.id}</p>
        </div>
      );
  }
}

export default function ExhibitionWorkPanel({ work, index }: ExhibitionWorkPanelProps) {
  const height = selectDisplayHeight(work);

  return (
    <article className="max-w-[640px] mx-auto">
      {/* Sequence index — small, quiet, gives the visitor a sense of order */}
      <div className="text-[10px] uppercase tracking-[0.25em] text-muted mb-4 font-mono">
        {String(index).padStart(2, "0")} / {work.medium}
      </div>

      {/* Work area — clean border, no ornate frame */}
      <div
        className="w-full border border-border/70 overflow-hidden"
        style={{ height: `${height}px` }}
      >
        {renderWorkArea(work)}
      </div>

      {/* Placard — serif title, muted metadata, links */}
      <div className="mt-5 pb-2">
        <h3
          className="text-lg md:text-xl font-light italic mb-1.5 leading-snug"
          style={{ fontFamily: "Georgia, serif" }}
        >
          {work.title || work.id}
        </h3>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted mb-3">
          {work.originator_name || work.originator_id}
          {work.phase_at_submission ? ` — Phase ${work.phase_at_submission}` : ""}
        </p>
        <div className="flex items-center gap-5">
          <Link
            href={`/work/${work.id}`}
            className="text-[10px] uppercase tracking-[0.18em] text-muted hover:text-foreground transition-colors"
          >
            View Work →
          </Link>
          <Link
            href={`/agent/${work.originator_id}`}
            className="text-[10px] uppercase tracking-[0.18em] text-muted hover:text-foreground transition-colors"
          >
            View Originator →
          </Link>
        </div>
      </div>
    </article>
  );
}
