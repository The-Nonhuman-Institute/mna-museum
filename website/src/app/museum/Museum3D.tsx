"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { MuseumEngine, MuseumState } from "@/lib/museum/engine";
import { MuseumData } from "@/lib/museum/placement";
import { drawMuseumMap } from "@/lib/museum/map";

/**
 * Detect whether the visitor's primary input is touch. Used to:
 *   - auto-enable split-screen touch controls in the engine
 *   - branch the pause-overlay instructions (drag-to-move vs WASD)
 *   - show the optional joystick toggle in the HUD
 *
 * Uses the CSS pointer media query rather than User Agent sniffing, which
 * is more reliable on modern iPadOS (reports as desktop Safari) and phones.
 */
function isTouchPrimary(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
  // Fallback for browsers that don't support the pointer media query
  return "ontouchstart" in window && navigator.maxTouchPoints > 0;
}

/**
 * Visible virtual joystick overlay for touch devices when toggled on.
 *
 * Polls the engine's touch state via requestAnimationFrame and renders a
 * circular stick indicator at the thumb's origin position. Purely visual —
 * the engine's internal touch handler is the actual input source. The
 * joystick never consumes pointer events (pointer-events: none) so it can't
 * interfere with the engine's split-screen drag.
 */
function VirtualJoystick({
  engineRef,
}: {
  engineRef: React.RefObject<MuseumEngine | null>;
}) {
  const [snap, setSnap] = useState<{
    active: boolean;
    originX: number;
    originY: number;
    currentX: number;
    currentY: number;
    maxRadius: number;
  }>({
    active: false,
    originX: 0,
    originY: 0,
    currentX: 0,
    currentY: 0,
    maxRadius: 72,
  });

  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      const s = engineRef.current?.getTouchState();
      if (s) {
        // Only call setState when the active flag changes or positions move,
        // to avoid tight infinite re-renders.
        setSnap((prev) => {
          if (
            prev.active === s.active &&
            prev.originX === s.originX &&
            prev.originY === s.originY &&
            prev.currentX === s.currentX &&
            prev.currentY === s.currentY
          ) {
            return prev;
          }
          return s;
        });
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [engineRef]);

  if (!snap.active) return null;

  // Clamp the knob's visual position to the stick base radius.
  const dx = snap.currentX - snap.originX;
  const dy = snap.currentY - snap.originY;
  const mag = Math.sqrt(dx * dx + dy * dy);
  const clamped = Math.min(1, mag / snap.maxRadius);
  const angle = mag > 0 ? Math.atan2(dy, dx) : 0;
  const knobX = Math.cos(angle) * clamped * snap.maxRadius;
  const knobY = Math.sin(angle) * clamped * snap.maxRadius;

  const baseSize = snap.maxRadius * 2;
  const knobSize = 36;

  return (
    <div
      className="fixed z-40 pointer-events-none"
      style={{
        left: snap.originX - snap.maxRadius,
        top: snap.originY - snap.maxRadius,
        width: baseSize,
        height: baseSize,
      }}
    >
      {/* Base ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          border: "2px solid rgba(208, 204, 198, 0.25)",
          background: "rgba(10, 9, 8, 0.2)",
          backdropFilter: "blur(2px)",
        }}
      />
      {/* Knob */}
      <div
        className="absolute rounded-full"
        style={{
          left: snap.maxRadius + knobX - knobSize / 2,
          top: snap.maxRadius + knobY - knobSize / 2,
          width: knobSize,
          height: knobSize,
          background: "rgba(208, 204, 198, 0.4)",
          border: "1px solid rgba(208, 204, 198, 0.6)",
        }}
      />
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
  const [isTouch, setIsTouch] = useState(false);
  const [freeLookMode, setFreeLookMode] = useState(false);
  const [joystickVisible, setJoystickVisible] = useState(false);
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
    // Detect touch device up front so the HUD and engine can adapt.
    const touch = isTouchPrimary();
    setIsTouch(touch);

    // Restore the visitor's joystick-visibility preference (touch devices only).
    if (touch && typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem("mna.joystick-visible");
        if (stored === "1") setJoystickVisible(true);
      } catch {
        // localStorage may be unavailable — default to hidden
      }
    }

    const el = containerRef.current;
    if (!el || engineRef.current) return;
    engineRef.current = new MuseumEngine(el, onStateChange, museumData);
    setReady(true);

    // On touch devices, enable split-screen touch controls immediately so the
    // visitor can move and look as soon as they enter.
    if (touch) {
      engineRef.current.enableTouchMode();
    }

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

      // If we already know pointer lock doesn't work, skip straight to free-look
      if (freeLookMode) {
        engineRef.current?.enableFreeLook();
        return;
      }

      const canvas = container.querySelector("canvas") as HTMLCanvasElement | null;
      if (!canvas) {
        console.error("[museum] no canvas found for pointer lock");
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
        engineRef.current?.enableFreeLook();
        setFreeLookMode(true);
      }
    };

    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, [ready, state.isLocked, freeLookMode]);

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

  const roomName = state.currentRoom?.name || "";
  const roomSubtitle = state.currentRoom?.subtitle || "";
  const totalVisitors = state.visitorCount + 1;

  /** Toggle the visible joystick (touch devices only) and persist the preference. */
  const toggleJoystick = () => {
    setJoystickVisible((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("mna.joystick-visible", next ? "1" : "0");
      } catch {
        // localStorage may be unavailable — preference won't persist
      }
      return next;
    });
  };

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

            {/* Right: Visitor count + Map + (touch only) Joystick toggle */}
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
              {isTouch && (
                <>
                  <span className="text-[#3a3530]">|</span>
                  <button
                    className={`text-[12px] uppercase tracking-[0.15em] transition-colors ${joystickVisible ? "text-white" : "text-[#d0ccc6] hover:text-white"}`}
                    onClick={toggleJoystick}
                    aria-pressed={joystickVisible}
                    aria-label="Toggle joystick visibility"
                  >
                    Joystick
                  </button>
                </>
              )}
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
                  {isTouch
                    ? (hasEntered ? "Tap to resume" : "Tap to enter the museum")
                    : (hasEntered ? "Click to resume" : "Click to enter the museum")}
                </p>

                {/* Controls — instructions differ for touch vs desktop */}
                <div className="space-y-2 mb-5">
                  {isTouch ? (
                    <>
                      <p className="text-[11px] text-[#8a8580] tracking-wide">
                        Drag left half to move · Drag right half to look
                      </p>
                      <p className="text-[11px] text-[#8a8580] tracking-wide">
                        Tap Map to open · Tap Joystick to toggle the stick overlay
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-[11px] text-[#8a8580] tracking-wide">
                        {freeLookMode
                          ? "WASD to move · Click and drag to look · ESC to pause"
                          : "WASD to move · Mouse to look · ESC to pause"}
                      </p>
                      <p className="text-[11px] text-[#8a8580] tracking-wide">
                        M for map · 1-4 to emote
                      </p>
                    </>
                  )}
                </div>

                {/* Emote legend — desktop only (no touch gesture maps to them) */}
                {!isTouch && (
                  <div className="flex justify-center gap-6 text-[10px] text-[#6a6560] tracking-wide">
                    <span>1 Wave</span>
                    <span>2 Glow</span>
                    <span>3 Orbit</span>
                    <span>4 Pulse</span>
                  </div>
                )}
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

          {/* ===== VIRTUAL JOYSTICK (touch devices, opt-in) ===== */}
          {isTouch && joystickVisible && state.isLocked && (
            <VirtualJoystick engineRef={engineRef} />
          )}
        </>
      )}
    </div>
  );
}
