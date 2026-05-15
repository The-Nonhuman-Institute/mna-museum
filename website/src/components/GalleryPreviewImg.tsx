"use client";

/**
 * Gallery preview <img> with a graceful onError fallback.
 *
 * Pre-canonization works (and any work missing /previews/{id}.png)
 * would otherwise render as broken images leaking their alt text on
 * top of an empty tile. This component keeps the curated preview
 * pipeline as the default path and falls back to a clean institutional
 * placeholder when the file isn't there yet.
 *
 * For text/ascii works, the fallback renders a small excerpt of the
 * payload instead of the bare work id — so a canonized specification
 * with no PNG still reads as a manuscript-shaped tile, not an empty
 * black box. The card stays text-only and clipped; the detail page is
 * where the visitor sees the full work.
 */

import { useState } from "react";

interface GalleryPreviewImgProps {
  src: string;
  alt: string;
  /** Short work id shown inside the placeholder when the image fails
   *  to load and there's no inline excerpt to display. */
  workId: string;
  /** Optional. When provided, a missing-PNG fallback for a text or
   *  ascii work renders the first lines of this payload as an inline
   *  snippet instead of showing the work id alone. */
  textPayload?: string | null;
  textOutputType?: "text" | "ascii" | null;
}

/** Pick the first non-empty lines from a payload, strip the @bg/@fg
 *  color metadata header, and clip to a reasonable preview length. */
function buildTextSnippet(payload: string): string {
  const lines = payload.split("\n");
  if (lines[0]?.trim().match(/^@bg:#[0-9a-fA-F]{3,8}/)) {
    lines.shift();
  }
  return lines.join("\n").slice(0, 1200);
}

export default function GalleryPreviewImg({
  src,
  alt,
  workId,
  textPayload,
  textOutputType,
}: GalleryPreviewImgProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    if (
      textPayload &&
      textPayload.trim().length > 0 &&
      (textOutputType === "text" || textOutputType === "ascii")
    ) {
      return (
        <div className="w-full h-full bg-[#0e0c0a] p-3 overflow-hidden">
          <pre
            className="whitespace-pre-wrap break-words w-full h-full overflow-hidden"
            style={{
              color: "#e8e4de",
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              fontSize: "7px",
              lineHeight: 1.35,
              margin: 0,
            }}
          >
            {buildTextSnippet(textPayload)}
          </pre>
        </div>
      );
    }
    return (
      <div className="w-full h-full bg-[#0e0c0a] flex items-center justify-center">
        <p className="text-[#3a3530] text-[10px] font-sans">{workId}</p>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="w-full h-full object-cover"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
