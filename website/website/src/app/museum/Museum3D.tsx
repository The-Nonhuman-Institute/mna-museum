"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { MuseumEngine, MuseumState } from "@/lib/museum/engine";

function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  ) || (window.innerWidth < 768 && "ontouchstart" in window);
}

// === MOBILE FALLBACK ===
function MobileFallback() {
  return (
    <div className="fixed inset-0 bg-[#0a0908] flex flex-col items-center justify-center px-8">
      <Image
        src="/MNA-Standard-Logo-White-Horizontal.svg"
        alt="Museum of Nonhuman Art"
        width={280}
        height={106}
        className="mb-10 opacity-80"
      />
      <p className="text-[15px] text-[#b0a89e] text-center leading-relaxed mb-6 max-w-sm">
        The virtual museum experience requires a desktop browser with keyboard and mouse.
      </p>
      <p className="text-[12px] text-[#6a6560] text-center mb-10 max-w-xs">
        WASD movement and mouse look are essential to navigating the space.
      </p>
      <Link
        href="/"
        className="text-[12px] uppercase tracking-[0.2em] px-8 py-3 border border-[#3a3530] text-[#8a8680] hover:text-[#d0ccc6] hover:border-[#6a6560] transition-colors"
      >
        Explore the Collection
      </Link>
    </div>
  );
}

// === LOADING SCREEN ===
function LoadingScreen() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0908] z-50">
      <Image
        src="/MNA-Icon-White.svg"
        alt=""
        width={48}
        height={48}
        className="mb-6 opacity-60 animate-pulse"
      />
      <p className="text-[12px] text-[#6a6560] tracking-[0.25em] uppercase mb-2">
        Museum of Nonhuman Art
      </p>
      <p className="text-[11px] text-[#4a4540] tracking-[0.15em]">
        Preparing the space...
      </p>
    </div>
  );
}

// === MAIN 3D EXPERIENCE ===
export default function Museum3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MuseumEngine | null>(null);
  const [state, setState] = useState<MuseumState>({
    currentRoom: null,
    isLocked: false,
    fps: 60,
    visitorCount: 0,
  });
  const [ready, setReady] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const onStateChange = useCallback((s: MuseumState) => {
    setState(s);
  }, []);

  useEffect(() => {
    if (isMobileDevice()) {
      setIsMobile(true);
      return;
    }

    const el = containerRef.current;
    if (!el || engineRef.current) return;

    engineRef.current = new MuseumEngine(el, onStateChange);
    setReady(true);

    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [onStateChange]);

  if (isMobile) return <MobileFallback />;

  const roomName = state.currentRoom?.name || "";
  const roomSubtitle = state.currentRoom?.subtitle || "";

  return (
    <div className="fixed inset-0 bg-[#0a0908]">
      {/* Three.js canvas container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Loading screen */}
      {!ready && <LoadingScreen />}

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
              <div className="bg-[#0a0908]/85 backdrop-blur-sm border border-[#3a3530] px-10 py-6 text-center">
                <p className="text-[14px] text-[#d0ccc6] mb-3">
                  Click to enter the museum
                </p>
                <p className="text-[10px] text-[#6a6560] tracking-wide">
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

          {/* Visitor count */}
          {state.visitorCount > 0 && (
            <div className="absolute top-14 left-5 z-40 pointer-events-none">
              <p className="text-[10px] tracking-[0.15em] text-[#6a6560]">
                {state.visitorCount + 1} {state.visitorCount + 1 === 1 ? "visitor" : "visitors"}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
