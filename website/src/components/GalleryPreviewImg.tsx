"use client";

/**
 * Gallery preview <img> with a graceful onError fallback.
 *
 * Pre-canonization works (and any work missing /previews/{id}.png)
 * would otherwise render as broken images leaking their alt text on
 * top of an empty tile. This component keeps the curated preview
 * pipeline as the default path and falls back to a clean institutional
 * placeholder when the file isn't there yet.
 */

import { useState } from "react";

interface GalleryPreviewImgProps {
  src: string;
  alt: string;
  /** Short work id shown inside the placeholder when the image fails
   *  to load. */
  workId: string;
}

export default function GalleryPreviewImg({
  src,
  alt,
  workId,
}: GalleryPreviewImgProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
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
