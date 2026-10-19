"use client";

import { useState } from "react";

/** A work's preview from the museum, or nothing when it has none yet. */
export default function WorkThumb({ id, className }: { id: string; className?: string }) {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.mnamuseum.org/previews/${id}.png`}
      alt=""
      loading="lazy"
      onError={() => setGone(true)}
      className={className}
    />
  );
}
