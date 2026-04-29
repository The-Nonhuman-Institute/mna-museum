"use client";

import Image from "next/image";
import { useEffect, useState, useCallback } from "react";

export default function ExhibitionCarousel({
  workIds,
  title,
  intervalMs = 6000,
}: {
  workIds: string[];
  title: string;
  intervalMs?: number;
}) {
  const [index, setIndex] = useState(0);
  const count = workIds.length;

  const go = useCallback(
    (i: number) => {
      if (count === 0) return;
      setIndex(((i % count) + count) % count);
    },
    [count]
  );

  // Auto-advance
  useEffect(() => {
    if (count <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [count, intervalMs]);

  // Arrow keys
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") go(index - 1);
      if (e.key === "ArrowRight") go(index + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index]);

  if (count === 0) {
    return (
      <div className="relative aspect-[4/3] bg-bone border border-ink/10" />
    );
  }

  return (
    <div>
      <div className="relative aspect-[4/3] bg-bone border border-ink/10 overflow-hidden">
        {workIds.map((id, i) => (
          <div
            key={id}
            className={`absolute inset-0 transition-opacity duration-700 ${
              i === index ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            aria-hidden={i !== index}
          >
            <Image
              src={`/previews/${id}.png`}
              alt={i === index ? `${title} — work ${i + 1} of ${count}` : ""}
              fill
              className="object-cover"
              sizes="(min-width: 1024px) 50vw, 100vw"
              priority={i === 0}
            />
          </div>
        ))}
      </div>

      {count > 1 ? (
        <div className="mt-5 flex items-center justify-center gap-2">
          {workIds.map((id, i) => (
            <button
              key={id}
              onClick={() => go(i)}
              aria-label={`Show work ${i + 1} of ${count}`}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === index ? "bg-ink" : "bg-ink/25 hover:bg-ink/50"
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
