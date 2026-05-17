"use client";

/**
 * GalleryMinimap — small field map for the chamber, solo, and
 * exhibition scenes.
 *
 * Differs from the archive's MinimapRadar in two ways:
 *
 * 1. Gallery spaces are intimate (≤ ~10m radius) so the world→pixel
 *    mapping uses a tighter MAP_RADIUS_M (12m default). At the
 *    archive's 60m, gallery visitors would all collapse onto the
 *    central pixel.
 * 2. There are no originator clusters to render — gallery scenes are
 *    composed by the Curator around a featured work or a themed group;
 *    there's nothing analogous to the archive's eight-cluster ring.
 *    So the map is *only* presences: self + others.
 *
 * The visitor is always centred. Humans appear as warm dots in their
 * cursor color; agents appear as small squares with their designation
 * floating above. An attending state (linger/mark) gets an outer ring.
 */

import { useEffect, useRef, useState } from "react";
import type { PresenceVisitor } from "@/lib/use-museum-presence";

const MAP_RADIUS_M = 12;
const MAP_SIZE_DESKTOP = 130;
const MAP_SIZE_TOUCH = 110;

export function GalleryMinimap({
  telemetryRef,
  others,
  galleryName,
  isTouch,
}: {
  telemetryRef: React.MutableRefObject<{ x: number; z: number; yaw: number }>;
  others: PresenceVisitor[];
  /** Short label shown in the panel header. e.g. "Chamber". */
  galleryName: string;
  isTouch: boolean;
}) {
  // Telemetry is written every frame inside the Canvas; we lift it into
  // React state at ~10Hz so the map re-renders smoothly without
  // re-rendering on every frame. Same pattern as MinimapRadar in the
  // archive scene.
  const [telemetry, setTelemetry] = useState({ x: 0, z: 0, yaw: 0 });
  useEffect(() => {
    const id = setInterval(() => {
      const t = telemetryRef.current;
      setTelemetry({ x: t.x, z: t.z, yaw: t.yaw });
    }, 100);
    return () => clearInterval(id);
  }, [telemetryRef]);

  const size = isTouch ? MAP_SIZE_TOUCH : MAP_SIZE_DESKTOP;
  const half = size / 2;
  function toPx(worldX: number, worldZ: number) {
    const dx = worldX - telemetry.x;
    const dz = worldZ - telemetry.z;
    const px = half + (dx / MAP_RADIUS_M) * half;
    const py = half + (dz / MAP_RADIUS_M) * half;
    return { x: px, y: py };
  }

  return (
    <div
      className={`pointer-events-none absolute z-20 ${isTouch ? "top-4 right-4" : "top-5 right-5"}`}
    >
      <div
        className={`bg-black/60 backdrop-blur-[3px] border border-mna-white/15 ${isTouch ? "p-2.5" : "p-3"}`}
      >
        <div className="flex items-baseline justify-between mb-2 px-1">
          <p className="text-[9.5px] font-sans uppercase tracking-[0.26em] text-mna-white/55">
            {galleryName}
          </p>
          <p className="text-[9px] font-sans uppercase tracking-[0.22em] text-mna-white/35 tabular-nums">
            N
          </p>
        </div>
        <div
          className="relative rounded-full border border-mna-white/12 bg-black/40 overflow-hidden"
          style={{ width: size, height: size }}
        >
          {/* Concentric guide rings */}
          <div className="absolute inset-0 rounded-full border border-mna-white/8" />
          <div
            className="absolute rounded-full border border-mna-white/8"
            style={{ left: "16%", top: "16%", width: "68%", height: "68%" }}
          />
          <div
            className="absolute rounded-full border border-mna-white/8"
            style={{ left: "33%", top: "33%", width: "34%", height: "34%" }}
          />

          {/* Other visitors. Same visual language as the archive radar
              so the field map reads identically across constellations. */}
          {others.map((v) => {
            const p = toPx(v.x, v.z);
            if (p.x < -8 || p.x > size + 8 || p.y < -8 || p.y > size + 8) {
              return null;
            }
            const attending = v.emote === "linger" || v.emote === "mark";
            if (v.kind === "agent") {
              return (
                <span key={v.id}>
                  {attending ? (
                    <span
                      aria-hidden
                      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                      style={{
                        left: p.x,
                        top: p.y,
                        width: 16,
                        height: 16,
                        border: `1px solid ${v.color}`,
                        opacity: 0.5,
                      }}
                    />
                  ) : null}
                  <span
                    aria-hidden
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{
                      left: p.x,
                      top: p.y,
                      width: 8,
                      height: 8,
                      backgroundColor: v.color,
                      boxShadow: `0 0 6px ${v.color}`,
                    }}
                  />
                  <span
                    className="absolute font-sans uppercase tracking-[0.18em] whitespace-nowrap"
                    style={{
                      left: p.x + 7,
                      top: p.y - 10,
                      fontSize: 8,
                      color: v.color,
                      textShadow: "0 0 4px rgba(0,0,0,0.9)",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {v.designation || v.registry_id || "Agent"}
                  </span>
                </span>
              );
            }
            return (
              <span key={v.id}>
                {attending ? (
                  <span
                    aria-hidden
                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{
                      left: p.x,
                      top: p.y,
                      width: 14,
                      height: 14,
                      border: `1px solid ${v.color}`,
                      opacity: 0.4,
                    }}
                  />
                ) : null}
                <span
                  aria-hidden
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    left: p.x,
                    top: p.y,
                    width: 6,
                    height: 6,
                    backgroundColor: v.color,
                    boxShadow: `0 0 6px ${v.color}`,
                    opacity: 0.85,
                  }}
                />
              </span>
            );
          })}

          {/* Visitor — triangle pointing in current facing direction. */}
          <span
            aria-hidden
            className="absolute left-1/2 top-1/2"
            style={{
              transform: `translate(-50%, -50%) rotate(${telemetry.yaw}rad)`,
            }}
          >
            <svg width="14" height="14" viewBox="-7 -7 14 14">
              <polygon
                points="0,-5 4,4 0,2 -4,4"
                fill="#ffffff"
                opacity="0.92"
              />
            </svg>
          </span>
        </div>
        {others.length > 0 ? (
          <p className="mt-2 px-1 text-[8.5px] font-sans uppercase tracking-[0.26em] text-mna-white/45 tabular-nums">
            {others.length} other{others.length === 1 ? "" : "s"} present
          </p>
        ) : (
          <p className="mt-2 px-1 text-[8.5px] font-sans uppercase tracking-[0.26em] text-mna-white/35">
            you are alone
          </p>
        )}
      </div>
    </div>
  );
}
