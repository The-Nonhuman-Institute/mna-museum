"use client";

/**
 * The Chamber scene. One monumental work, lit from above, in a quiet
 * void. The visitor can walk around to feel the work's scale — this
 * is the institutional cathedral; the architecture is the work, the
 * work is the architecture.
 *
 * Controls match the field: PointerLock on desktop, drag-look fallback
 * on Atlas/touch, WASD + virtual joystick. Pulled from MuseumField via
 * the exported sub-components; intentional reuse so the controls feel
 * identical across galleries.
 *
 * Multiplayer is deliberately omitted in v1 — the Chamber reads as
 * contemplation, not gathering. Future versions can opt in by passing
 * a room name to useMuseumPresence.
 */

import { Canvas } from "@react-three/fiber";
import { PointerLockControls, Stars } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DragLook,
  Movement,
  VirtualJoystick,
  KeyCap,
  useDownsampledTexture,
} from "../../MuseumField";

interface ChamberWork {
  id: string;
  title: string | null;
  originator_id: string;
  originator_name: string | null;
  medium: string;
  output_type: string;
  canon_date: string | null;
  phase_at_submission: string | null;
}

interface ChamberSceneProps {
  featuredWork: ChamberWork | null;
}

const EYE_HEIGHT = 1.7;
const WORK_HEIGHT = 8; // metres — monumental
const WORK_TEXTURE_MAX = 1024; // higher for the featured piece; only one texture
const CAMERA_START_DISTANCE = 14;
const CHAMBER_TINT = "#e6c890";

type PLCHandle = { lock: () => void; unlock: () => void } | null;

export default function ChamberScene({ featuredWork }: ChamberSceneProps) {
  const [started, setStarted] = useState(false);
  const [locked, setLocked] = useState(false);
  const [pointerLockFailed, setPointerLockFailed] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setIsTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  const controlsRef = useRef<PLCHandle>(null);
  const lockedRef = useRef(false);
  const pointerLockFailedRef = useRef(false);
  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);
  useEffect(() => {
    pointerLockFailedRef.current = pointerLockFailed;
  }, [pointerLockFailed]);

  const joystickRef = useRef({ forward: 0, strafe: 0 });

  function handleBegin() {
    setStarted(true);
    try {
      controlsRef.current?.lock();
    } catch {
      setPointerLockFailed(true);
      return;
    }
    window.setTimeout(() => {
      if (!document.pointerLockElement) {
        setPointerLockFailed(true);
      }
    }, 700);
  }

  function handleCanvasMaybeRelock() {
    if (!started) return;
    if (lockedRef.current) return;
    if (pointerLockFailedRef.current) return;
    try {
      controlsRef.current?.lock();
    } catch {
      setPointerLockFailed(true);
    }
  }

  // Pointer-lock error listener.
  useEffect(() => {
    function onErr() {
      setPointerLockFailed(true);
    }
    document.addEventListener("pointerlockerror", onErr);
    return () => document.removeEventListener("pointerlockerror", onErr);
  }, []);

  // Escape from Chamber → back to The Archive. When pointer-locked,
  // browser releases first; second Esc returns. When not locked,
  // single Esc returns.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (document.pointerLockElement) return; // browser releases lock
      router.push("/museum/next");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <div className="fixed inset-0 bg-black">
      <div
        className="absolute inset-0 select-none"
        style={{ touchAction: "none" }}
        onClick={handleCanvasMaybeRelock}
      >
        <Canvas
          camera={{
            fov: 60,
            near: 0.1,
            far: 220,
            position: [0, EYE_HEIGHT, CAMERA_START_DISTANCE],
          }}
          dpr={isTouch ? 1 : [1, 1.5]}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          onCreated={({ gl }) => {
            const onLost = (e: Event) => {
              e.preventDefault();
              setTimeout(() => window.location.reload(), 80);
            };
            gl.domElement.addEventListener("webglcontextlost", onLost);
          }}
        >
          <ChamberSceneInterior featuredWork={featuredWork} />
          <PointerLockControls
            ref={(r) => {
              controlsRef.current = r as PLCHandle;
            }}
            onLock={() => setLocked(true)}
            onUnlock={() => setLocked(false)}
          />
          <DragLook enabled={pointerLockFailed && started} />
          <Movement
            enabled={locked || (pointerLockFailed && started)}
            joystickRef={joystickRef}
          />
        </Canvas>
      </div>

      {!started ? (
        <ChamberEntry
          onEnter={handleBegin}
          isTouch={isTouch}
          work={featuredWork}
        />
      ) : null}

      {started ? (
        <>
          <ChamberHUD
            work={featuredWork}
            locked={locked}
            pointerLockFailed={pointerLockFailed}
          />
          {locked || pointerLockFailed ? <Reticle /> : null}
          {started && !locked && !pointerLockFailed ? <ResumeHint /> : null}
        </>
      ) : null}

      {isTouch && started ? (
        <VirtualJoystick joystickRef={joystickRef} />
      ) : null}
    </div>
  );
}

/* ─── Scene interior ─────────────────────────────────────────────────────── */

function ChamberSceneInterior({
  featuredWork,
}: {
  featuredWork: ChamberWork | null;
}) {
  return (
    <>
      <color attach="background" args={["#05040a"]} />
      <fog attach="fog" args={["#05040a", 22, 90]} />

      <ambientLight intensity={0.08} color="#a8b6cc" />

      {/* Warm spotlight from above the work — the institutional beam. */}
      <spotLight
        position={[0, 16, 0.5]}
        angle={0.35}
        penumbra={0.45}
        intensity={2.8}
        color={CHAMBER_TINT}
        distance={28}
        decay={1.4}
        target-position={[0, WORK_HEIGHT / 2 + 1, 0]}
      />

      {/* Soft fill light from below, in the same tint family. */}
      <pointLight
        position={[0, 0.6, 4]}
        intensity={0.45}
        color={CHAMBER_TINT}
        distance={12}
        decay={1.8}
      />

      {/* Subtle starfield — the visitor is still in the museum's
          cosmos, not removed from it. Less dense than the field. */}
      <Stars
        radius={120}
        depth={60}
        count={1800}
        factor={2.2}
        saturation={0}
        fade
        speed={0.08}
      />

      {/* Floor — matte dark, single plane. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial
          color="#0a0809"
          roughness={0.95}
          metalness={0.05}
        />
      </mesh>

      {/* Ground ring around the work — institutional baseline. */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4.6, 4.8, 64]} />
        <meshBasicMaterial
          color={CHAMBER_TINT}
          transparent
          opacity={0.32}
          toneMapped={false}
        />
      </mesh>

      {/* The featured work, or a placeholder note if the Curator
          hasn't selected one. */}
      {featuredWork ? (
        <FeaturedWorkPlane work={featuredWork} />
      ) : (
        <EmptyChamberMarker />
      )}
    </>
  );
}

function FeaturedWorkPlane({ work }: { work: ChamberWork }) {
  const texture = useDownsampledTexture(
    `/previews/${work.id}.png`,
    WORK_TEXTURE_MAX,
  );

  // Vertical center of the work. Bottom edge sits 1m above floor.
  const cy = 1 + WORK_HEIGHT / 2;

  if (!texture) {
    return (
      <mesh position={[0, cy, 0]}>
        <planeGeometry args={[WORK_HEIGHT, WORK_HEIGHT]} />
        <meshBasicMaterial
          color={CHAMBER_TINT}
          transparent
          opacity={0.08}
          toneMapped={false}
        />
      </mesh>
    );
  }

  return (
    <group position={[0, cy, 0]}>
      {/* Back glow — large soft plane behind the work tinted Chamber
          color. Adds presence without needing real lighting on the
          billboard. */}
      <mesh position={[0, 0, -0.3]}>
        <planeGeometry args={[WORK_HEIGHT * 1.15, WORK_HEIGHT * 1.15]} />
        <meshBasicMaterial
          color={CHAMBER_TINT}
          transparent
          opacity={0.06}
          toneMapped={false}
        />
      </mesh>
      {/* The work itself. */}
      <mesh>
        <planeGeometry args={[WORK_HEIGHT, WORK_HEIGHT]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

function EmptyChamberMarker() {
  return (
    <mesh position={[0, 1 + WORK_HEIGHT / 2, 0]}>
      <planeGeometry args={[WORK_HEIGHT, WORK_HEIGHT]} />
      <meshBasicMaterial
        color={CHAMBER_TINT}
        transparent
        opacity={0.04}
        toneMapped={false}
      />
    </mesh>
  );
}

/* ─── HUD ────────────────────────────────────────────────────────────────── */

function ChamberEntry({
  onEnter,
  isTouch,
  work,
}: {
  onEnter: () => void;
  isTouch: boolean;
  work: ChamberWork | null;
}) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-mna-white pointer-events-none px-5">
      <div className="bg-black/55 backdrop-blur-[2px] border border-mna-white/15 px-7 sm:px-10 py-8 sm:py-9 max-w-[480px] w-full text-center pointer-events-auto">
        <p className="text-[10px] font-sans uppercase tracking-[0.32em] text-mna-white/55 mb-4">
          Gallery · The Chamber
        </p>
        <h1 className="font-display text-[36px] sm:text-[42px] leading-[1.05] tracking-tight text-mna-white mb-3">
          Enter the Chamber
        </h1>
        {work ? (
          <p className="text-[12px] text-mna-white/72 leading-[1.6] mb-7">
            Currently featured: <span className="italic">{work.title || work.id}</span>
            {work.originator_name ? <> · {work.originator_name}</> : null}
          </p>
        ) : (
          <p className="text-[12px] text-mna-white/55 leading-[1.6] mb-7">
            The Curator has not placed a work here yet.
          </p>
        )}
        <button
          type="button"
          onClick={onEnter}
          className="inline-flex items-center gap-3 bg-mna-white text-ink px-6 py-3 text-[10.5px] font-sans uppercase tracking-[0.26em] hover:bg-mna-white/90 transition-colors"
        >
          <span>Begin Observation</span>
          <span aria-hidden>→</span>
        </button>
        <div className="mt-6 pt-5 border-t border-mna-white/15 grid grid-cols-2 gap-y-2 text-[10px] uppercase tracking-[0.22em] text-mna-white/55">
          {isTouch ? (
            <>
              <span className="text-left">Joystick</span>
              <span className="text-right">Move</span>
              <span className="text-left">Drag</span>
              <span className="text-right">Look</span>
            </>
          ) : (
            <>
              <span className="text-left">W A S D</span>
              <span className="text-right">Move</span>
              <span className="text-left">Mouse</span>
              <span className="text-right">Look</span>
              <span className="text-left">Esc</span>
              <span className="text-right">Return</span>
            </>
          )}
        </div>
        <Link
          href="/museum/next"
          className="mt-6 inline-block text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55 hover:text-mna-white transition-colors"
        >
          ← Return to The Archive
        </Link>
      </div>
    </div>
  );
}

function ChamberHUD({
  work,
  locked,
  pointerLockFailed,
}: {
  work: ChamberWork | null;
  locked: boolean;
  pointerLockFailed: boolean;
}) {
  void locked;
  void pointerLockFailed;
  return (
    <>
      {/* Top-left: gallery name + featured work. */}
      <div className="pointer-events-none absolute top-4 left-4 z-20 max-w-[280px]">
        <div className="bg-black/60 backdrop-blur-[3px] border border-mna-white/15 px-4 py-3">
          <p className="text-[9px] font-sans uppercase tracking-[0.32em] text-mna-white/55 mb-1">
            Gallery
          </p>
          <p className="font-display italic text-[15px] leading-tight text-mna-white mb-2">
            The Chamber
          </p>
          {work ? (
            <>
              <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55 mb-0.5">
                Featured
              </p>
              <p
                className="text-[12px] leading-tight text-mna-white mb-2"
                style={{ color: CHAMBER_TINT }}
              >
                {work.title || work.id}
              </p>
              {work.originator_name ? (
                <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55">
                  {work.originator_name}
                </p>
              ) : null}
            </>
          ) : null}
          <div className="pointer-events-auto mt-3 pt-3 border-t border-mna-white/10">
            <Link
              href="/museum/next"
              className="text-[9.5px] font-sans uppercase tracking-[0.26em] text-mna-white/55 hover:text-mna-white transition-colors"
            >
              ← Return to The Archive
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom-center: provenance link for the work. */}
      {work ? (
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-12 z-20 max-w-[460px] w-[88vw]">
          <div className="pointer-events-auto bg-black/60 border border-mna-white/15 px-5 py-3">
            <div className="flex flex-wrap items-center gap-4 text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55">
              <span>{work.id}</span>
              {work.canon_date ? <span>· Canonized</span> : null}
              <Link
                href={`/work/${work.id}/provenance?from=chamber`}
                className="ml-auto inline-flex items-center gap-2 text-mna-white/85 hover:text-mna-white transition-colors border-b border-mna-white/35 pb-0.5"
              >
                <KeyCap label="R" />
                <span>Trace Origin</span>
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Reticle() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
    >
      <span className="block w-[3px] h-[3px] rounded-full bg-mna-white/55" />
    </div>
  );
}

function ResumeHint() {
  return (
    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-14 z-20">
      <div className="bg-black/60 border border-mna-white/15 px-4 py-2 text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/75">
        Click anywhere to resume
      </div>
    </div>
  );
}
