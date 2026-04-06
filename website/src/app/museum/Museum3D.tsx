"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { MuseumEngine, MuseumState } from "@/lib/museum/engine";
import { MuseumData } from "@/lib/museum/placement";
import { drawMuseumMap } from "@/lib/museum/map";

function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  ) || (window.innerWidth < 768 && "ontouchstart" in window);
}

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
      <Link
        href="/"
        className="text-[12px] uppercase tracking-[0.2em] px-8 py-3 border border-[#3a3530] text-[#8a8680] hover:text-[#d0ccc6] hover:border-[#6a6560] transition-colors"
      >
        Explore the Collection
      </Link>
    </div>
  );
}

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

export default function Museum3D({ museumData }: { museumData: MuseumData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MuseumEngine | null>(null);
  const [hasEntered, setHasEntered] = useState(false);
  const [state, setState] = useState<MuseumState>({
    currentRoom: null,
    isLocked: false,
    fps: 60,
    visitorCount: 0,
    playerX: 0,
    playerZ: 0,
    emoteFlash: "",
    mapOpen: false,
    showFps: false,
  });
  const [ready, setReady] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const hasEnteredRef = useRef(false);

  // Stable callback — doesn't change on state updates
  const onStateChange = useCallback((s: MuseumState) => {
    setState(s);
    if (s.isLocked && !hasEnteredRef.current) {
      hasEnteredRef.current = true;
      setHasEntered(true);
    }
  }, []);

  useEffect(() => {
    if (isMobileDevice()) { setIsMobile(true); return; }
    const el = containerRef.current;
    if (!el || engineRef.current) return;
    engineRef.current = new MuseumEngine(el, onStateChange, museumData);
    setReady(true);
    return () => { engineRef.current?.dispose(); engineRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detect iframe/fenced frame context — pointer lock doesn't work there
  useEffect(() => {
    if (typeof window !== "undefined" && window.self !== window.top) {
      console.warn("[museum] page is in an iframe/fenced frame — pointer lock may be blocked");
    }
  }, []);

  // Native click listener — calls requestPointerLock on the canvas
  // directly inside the click handler to preserve the user gesture context.
  useEffect(() => {
    if (!ready) return;
    const container = containerRef.current;
    if (!container) return;

    const handleClick = async () => {
      if (state.isLocked) return;
      const canvas = container.querySelector("canvas") as HTMLCanvasElement | null;
      if (!canvas) {
        console.error("[museum] no canvas found for pointer lock");
        return;
      }
      // Verify canvas is in the same document as the click target
      if (canvas.ownerDocument !== document) {
        console.error("[museum] canvas in different document — pointer lock impossible");
        return;
      }
      console.log("[museum] click → requesting pointer lock");
      try {
        canvas.focus();
        const result = (canvas.requestPointerLock as unknown as () => Promise<void> | undefined)();
        if (result instanceof Promise) {
          await result;
          console.log("[museum] pointer lock granted");
        }
      } catch (err) {
        console.warn("[museum] pointer lock denied — falling back to free-look mode:", err);
        // Fallback: enable free-look mode (mouse position drives camera)
        engineRef.current?.enableFreeLook();
      }
    };

    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, [ready, state.isLocked]);

  // Redraw map when open and player moves
  useEffect(() => {
    if (!state.mapOpen) return;
    const canvas = drawMuseumMap(state.playerX, state.playerZ);
    const container = document.getElementById("map-overlay-canvas");
    if (container) {
      container.innerHTML = "";
      canvas.style.maxWidth = "90vmin";
      canvas.style.maxHeight = "90vmin";
      canvas.style.width = "auto";
      canvas.style.height = "auto";
      container.appendChild(canvas);
    }
  }, [state.mapOpen, state.playerX, state.playerZ]);

  if (isMobile) return <MobileFallback />;

  const roomName = state.currentRoom?.name || "";
  const roomSubtitle = state.currentRoom?.subtitle || "";
  const totalVisitors = state.visitorCount + 1;

  return (
    <div className="fixed inset-0 bg-[#0a0908]">
      <div ref={containerRef} className="w-full h-full" />

      {!ready && <LoadingScreen />}

      {ready && (
        <>
          {/* ===== TOP BAR ===== */}
          <div className="absolute top-4 left-5 right-5 md:left-8 md:right-8 z-40 pointer-events-none flex items-center justify-between">
            {/* Left: Exit Museum */}
            <Link
              href="/"
              className="pointer-events-auto bg-[#0a0908]/80 backdrop-blur-sm border border-[#3a3530]/60 px-5 py-2.5 text-[12px] uppercase tracking-[0.15em] text-[#d0ccc6] hover:text-white hover:border-[#6a6560] transition-colors"
            >
              Exit Museum
            </Link>

            {/* Right: Visitor count + Map in one container */}
            <div className="pointer-events-auto bg-[#0a0908]/80 backdrop-blur-sm border border-[#3a3530]/60 px-5 py-2.5 flex items-center gap-5">
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-[#7BA393] shadow-[0_0_6px_#7BA393]" />
                <span className="text-[12px] tracking-[0.1em] text-[#d0ccc6]">
                  {totalVisitors} {totalVisitors === 1 ? "visitor" : "visitors"}
                </span>
              </div>
              <span className="text-[#3a3530]">|</span>
              <button
                className="text-[12px] uppercase tracking-[0.15em] text-[#d0ccc6] hover:text-white transition-colors"
                onClick={() => engineRef.current && setState(prev => ({ ...prev, mapOpen: !prev.mapOpen }))}
              >
                Map <span className="text-[10px] text-[#6a6560] ml-1">[M]</span>
              </button>
            </div>
          </div>

          {/* ===== ROOM NAME — bottom center ===== */}
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

          {/* ===== EMOTE FLASH — bottom left ===== */}
          {state.emoteFlash && (
            <div className="absolute bottom-20 left-8 z-40 pointer-events-none animate-pulse">
              <p className="text-[14px] text-[#d0ccc6] tracking-[0.1em]">
                ✦ {state.emoteFlash}
              </p>
            </div>
          )}

          {/* ===== PAUSE / ENTRY OVERLAY =====
              Pointer-events-none on every layer so the click reaches
              the canvas underneath. The canvas has its own click handler
              that calls requestPointerLock — this is the most reliable
              cross-browser approach. */}
          {!state.isLocked && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center pointer-events-none">
              <div className="bg-[#0a0908]/90 backdrop-blur-sm border border-[#3a3530] px-12 py-8 text-center max-w-md pointer-events-none">
                <p className="text-[16px] text-[#d0ccc6] mb-5">
                  {hasEntered ? "Click to resume" : "Click to enter the museum"}
                </p>

                {/* Controls */}
                <div className="space-y-2 mb-5">
                  <p className="text-[11px] text-[#8a8580] tracking-wide">
                    WASD to move · Mouse to look · ESC to pause
                  </p>
                  <p className="text-[11px] text-[#8a8580] tracking-wide">
                    M for map · 1-4 to emote
                  </p>
                </div>

                {/* Emote legend */}
                <div className="flex justify-center gap-6 text-[10px] text-[#6a6560] tracking-wide">
                  <span>1 Wave</span>
                  <span>2 Glow</span>
                  <span>3 Orbit</span>
                  <span>4 Pulse</span>
                </div>
              </div>
            </div>
          )}

          {/* ===== MAP OVERLAY ===== */}
          {state.mapOpen && (
            <div
              className="absolute inset-0 z-50 flex items-center justify-center bg-[#0a0908]/80 backdrop-blur-sm cursor-pointer"
              onClick={() => setState(prev => ({ ...prev, mapOpen: false }))}
            >
              <div id="map-overlay-canvas" className="pointer-events-none" />
              <p className="absolute bottom-6 text-[11px] text-[#6a6560] tracking-wide">
                Press M or click to close
              </p>
            </div>
          )}

          {/* ===== FPS (toggle with F key) ===== */}
          {state.showFps && (
            <div className="absolute top-16 right-8 z-40 pointer-events-none">
              <div className="bg-[#0a0908]/80 backdrop-blur-sm border border-[#3a3530]/60 px-3 py-1.5">
                <p className="text-[10px] font-mono text-[#a0a0a0]">
                  {state.fps} fps
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
