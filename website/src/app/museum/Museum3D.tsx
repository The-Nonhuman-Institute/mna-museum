"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { MuseumEngine, MuseumState } from "@/lib/museum/engine";

export default function Museum3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MuseumEngine | null>(null);
  const [state, setState] = useState<MuseumState>({
    currentRoom: null,
    isLocked: false,
    fps: 60,
  });
  const [ready, setReady] = useState(false);

  const onStateChange = useCallback((s: MuseumState) => {
    setState(s);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || engineRef.current) return;

    engineRef.current = new MuseumEngine(el, onStateChange);
    setReady(true);

    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [onStateChange]);

  const roomName = state.currentRoom?.name || "";
  const roomSubtitle = state.currentRoom?.subtitle || "";

  return (
    <div className="fixed inset-0 bg-[#3a3835]">
      {/* Three.js canvas container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Loading overlay */}
      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#3a3835] z-50">
          <p className="text-[13px] text-[#a0a09a] tracking-[0.2em] uppercase">
            Entering Museum...
          </p>
        </div>
      )}

      {/* HUD Overlay */}
      {ready && (
        <>
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 z-40 pointer-events-none">
            <div className="px-5 md:px-8 h-12 flex items-center justify-between">
              <Link
                href="/"
                className="pointer-events-auto text-[11px] uppercase tracking-[0.15em] text-[#b0aaa5] hover:text-[#e0ddd8] transition-colors"
              >
                Exit Museum
              </Link>
              <Link
                href="/agents"
                className="pointer-events-auto text-[11px] uppercase tracking-[0.15em] text-[#b0aaa5] hover:text-[#e0ddd8] transition-colors"
              >
                Directory
              </Link>
            </div>
          </div>

          {/* Room name — bottom center */}
          {roomName && (
            <div className="absolute bottom-8 left-0 right-0 z-40 flex flex-col items-center pointer-events-none">
              <p className="text-[14px] md:text-[16px] uppercase tracking-[0.2em] text-[#d0ccc6]">
                {roomName}
              </p>
              {roomSubtitle && (
                <p className="text-[10px] md:text-[11px] tracking-[0.15em] text-[#9a9590] mt-1">
                  {roomSubtitle}
                </p>
              )}
            </div>
          )}

          {/* Click to enter prompt */}
          {!state.isLocked && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center pointer-events-none">
              <div className="bg-[#2a2825]/90 backdrop-blur-sm border border-[#4a4540] px-8 py-5 text-center">
                <p className="text-[13px] text-[#d0ccc6] mb-2">
                  Click to enter the museum
                </p>
                <p className="text-[10px] text-[#8a8580]">
                  WASD to move &middot; Mouse to look &middot; ESC to pause
                </p>
              </div>
            </div>
          )}

          {/* FPS counter (dev only) */}
          {process.env.NODE_ENV === "development" && (
            <div className="absolute top-14 right-5 z-40 pointer-events-none">
              <p className="text-[10px] font-mono text-[#a0a0a0]">
                {state.fps} fps
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
