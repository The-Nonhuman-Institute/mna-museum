"use client";

/**
 * Solo Exhibition Hall — one originator's body of canon work shown
 * in a procession down a quiet corridor. The featured originator is
 * the subject of the latest FEATURE_SOLO / FEATURE_SOLO_EXHIBITION
 * curatorial decision; works are displayed in the order the decision
 * recorded them.
 *
 * Visually: same cosmos as the Chamber and the field — two-layer
 * Stars, warm/cool directionals, reflective floor, EffectComposer for
 * bloom. The corridor is intentionally simple — no walls, just a
 * floor + the works floating at eye level on alternating sides — so
 * the visitor's attention stays on the works themselves.
 *
 * Sky has three constellations: the Archive overhead (vesica, the
 * way home), and the Chamber's gallery constellation in its sky
 * direction. Gazing at any of them surfaces a "Press R" prompt; R
 * navigates to whatever the visitor is currently aimed at, defaulting
 * to /museum (the Archive) when nothing is aimed.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Html,
  MeshReflectorMaterial,
  PointerLockControls,
  Stars,
} from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  Vignette,
} from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Constellation,
  DragLook,
  Movement,
  VirtualJoystick,
  useDownsampledTexture,
} from "../../MuseumField";
import {
  CONSTELLATION_CONFIGS,
  vesicaPiscisStars,
  VESICA_EDGES,
  VESICA_MAGNITUDES,
  constellationStars,
} from "@/lib/gallery-constellations";
import type { SoloWork } from "./page";

interface SoloSceneProps {
  originatorId: string | null;
  originatorName: string | null;
  exhibitionTitle: string | null;
  works: SoloWork[];
}

const EYE_HEIGHT = 1.7;
const CAMERA_START_Z = 9;
const HALL_WORK_SPACING = 7; // metres between consecutive works along Z
const HALL_OFFSET_X = 4.2;   // metres left/right of centre for each work
const WORK_PLANE_SIZE = 3.4; // metres — each work plane

type PLCHandle = { lock: () => void; unlock: () => void } | null;

export default function SoloScene({
  originatorId,
  originatorName,
  exhibitionTitle,
  works,
}: SoloSceneProps) {
  const [started, setStarted] = useState(false);
  const [locked, setLocked] = useState(false);
  const [pointerLockFailed, setPointerLockFailed] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [aimedTarget, setAimedTarget] = useState<NavTarget | null>(null);
  const router = useRouter();

  useEffect(() => {
    setIsTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  const controlsRef = useRef<PLCHandle>(null);
  const lockedRef = useRef(false);
  const pointerLockFailedRef = useRef(false);
  const aimedTargetRef = useRef<NavTarget | null>(null);
  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);
  useEffect(() => {
    pointerLockFailedRef.current = pointerLockFailed;
  }, [pointerLockFailed]);
  useEffect(() => {
    aimedTargetRef.current = aimedTarget;
  }, [aimedTarget]);

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

  useEffect(() => {
    function onErr() {
      setPointerLockFailed(true);
    }
    document.addEventListener("pointerlockerror", onErr);
    return () => document.removeEventListener("pointerlockerror", onErr);
  }, []);

  // Navigation keys. Escape leaves the hall when unlocked. R navigates
  // to the currently-aimed-at constellation if any, otherwise the
  // Archive (matches the chamber's pattern + the visitor's habit).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (document.pointerLockElement) return; // browser releases lock
        router.push("/museum");
        return;
      }
      if (e.key === "r" || e.key === "R") {
        const target = aimedTargetRef.current;
        router.push(target?.route ?? "/museum");
      }
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
            far: 300,
            position: [0, EYE_HEIGHT, CAMERA_START_Z],
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
          <SoloSceneInterior works={works} onAim={setAimedTarget} />
          <PointerLockControls
            ref={(r) => {
              controlsRef.current = r as PLCHandle;
            }}
            onLock={() => setLocked(true)}
            onUnlock={() => setLocked(false)}
          />
          <DragLook
            enabled={pointerLockFailed && started}
            isTouch={isTouch}
          />
          <Movement
            enabled={locked || (pointerLockFailed && started)}
            joystickRef={joystickRef}
          />

          <EffectComposer>
            <Bloom
              luminanceThreshold={0.35}
              luminanceSmoothing={0.9}
              intensity={0.85}
            />
            <Vignette eskil={false} offset={0.55} darkness={0.22} />
          </EffectComposer>
        </Canvas>
      </div>

      {!started ? (
        <SoloEntry
          onEnter={handleBegin}
          isTouch={isTouch}
          originatorName={originatorName}
          exhibitionTitle={exhibitionTitle}
          workCount={works.length}
          hasWorks={works.length > 0}
        />
      ) : null}

      {started ? (
        <SoloHUD
          originatorId={originatorId}
          originatorName={originatorName}
          exhibitionTitle={exhibitionTitle}
          workCount={works.length}
          locked={locked}
          pointerLockFailed={pointerLockFailed}
        />
      ) : null}

      {started && (locked || pointerLockFailed) ? <Reticle /> : null}
      {started && !locked && !pointerLockFailed ? <ResumeHint /> : null}

      {isTouch && started ? (
        <VirtualJoystick joystickRef={joystickRef} />
      ) : null}
    </div>
  );
}

/* ─── Navigation target (which constellation the visitor is aiming at) ── */

interface NavTarget {
  id: string;
  label: string;
  route: string;
}

/* ─── Scene interior ────────────────────────────────────────────────────── */

function SoloSceneInterior({
  works,
  onAim,
}: {
  works: SoloWork[];
  onAim: (t: NavTarget | null) => void;
}) {
  const archiveConfig = CONSTELLATION_CONFIGS.archive;
  const archiveStars = useMemo(
    () =>
      vesicaPiscisStars(
        archiveConfig.direction.yaw,
        archiveConfig.direction.altitude,
        archiveConfig.distance,
        16,
        12,
      ),
    [archiveConfig],
  );

  // Chamber's constellation — visible from the Solo Hall, but
  // repositioned to a different sky direction than the field's view.
  // The field's chamber config sits at yaw 0 (due-north of the
  // field's centre), which from inside the Solo Hall would collide
  // visually with the Archive vesica (also at yaw 0). Place it
  // back-right of the visitor so the two constellations occupy
  // genuinely distinct parts of the sky.
  const chamberConfig = useMemo(
    () => ({
      ...CONSTELLATION_CONFIGS.chamber,
      direction: { yaw: 1.7, altitude: 0.35 },
    }),
    [],
  );
  const chamberStars = useMemo(
    () => constellationStars(chamberConfig, 5, "chamber"),
    [chamberConfig],
  );

  return (
    <>
      <color attach="background" args={["#06050a"]} />
      <fog attach="fog" args={["#06050a", 50, 240]} />

      <ambientLight intensity={0.32} color="#cdd2dc" />
      <directionalLight
        position={[40, 30, 10]}
        intensity={0.6}
        color="#d8c4a0"
      />
      <directionalLight
        position={[-30, 20, -25]}
        intensity={0.3}
        color="#8aa0bc"
      />

      {/* Continuous cosmos shared with the field + chamber. */}
      <Stars
        radius={180}
        depth={90}
        count={4500}
        factor={2.0}
        saturation={0}
        fade
        speed={0.12}
      />
      <Stars
        radius={95}
        depth={45}
        count={140}
        factor={6}
        saturation={0.05}
        fade
        speed={0.4}
      />

      {/* Archive constellation — the way home (vesica). */}
      <Constellation
        name="↩ The Archive"
        config={archiveConfig}
        stars={archiveStars}
        edges={VESICA_EDGES}
        magnitudes={VESICA_MAGNITUDES}
        starSize={0.3}
        haloFactor={2.2}
        lineOpacity={0.45}
      />

      {/* The Chamber's constellation as seen from this gallery —
          procedural for now, until a named asterism is designed. */}
      <Constellation
        name="✦ The Chamber"
        config={chamberConfig}
        stars={chamberStars}
        starSize={0.35}
        haloFactor={2.4}
      />

      {/* Gaze detector that maps the aimed constellation to a nav
          target and pushes it up to the page-level R-key handler. */}
      <ConstellationGazeRouter
        archiveStars={archiveStars}
        chamberStars={chamberStars}
        onAim={onAim}
      />

      {/* Reflective floor — same treatment as the chamber. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[260, 260]} />
        <MeshReflectorMaterial
          blur={[80, 20]}
          resolution={256}
          mixBlur={1.4}
          mixStrength={0.85}
          mirror={0.4}
          roughness={0.92}
          depthScale={0.5}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.2}
          color="#0a0808"
          metalness={0.22}
        />
      </mesh>

      {/* The corridor — works alternating left/right at fixed spacing. */}
      {works.map((work, i) => {
        // Left side for even i, right for odd. Walks the visitor's
        // gaze through the body of work like a real exhibition hall.
        const side = i % 2 === 0 ? -1 : 1;
        const z = -(i + 1) * HALL_WORK_SPACING;
        return (
          <WorkPlaque
            key={work.id}
            work={work}
            position={[side * HALL_OFFSET_X, 2.6, z]}
            side={side}
          />
        );
      })}

      {/* End plaque at the far end of the procession — the originator's
          name + the exhibition title, the institutional sign-off. */}
      {works.length > 0 ? (
        <EndPlaque
          z={-(works.length + 1) * HALL_WORK_SPACING}
        />
      ) : null}
    </>
  );
}

/* ─── A single work, mounted on a wall plane ─────────────────────────────── */

function WorkPlaque({
  work,
  position,
  side,
}: {
  work: SoloWork;
  position: [number, number, number];
  /** -1: work is on the LEFT wall of the aisle (x = -HALL_OFFSET_X)
   *  and faces +X (toward the visitor). +1: work is on the RIGHT
   *  wall, faces -X. */
  side: number;
}) {
  const texture = useDownsampledTexture(`/previews/${work.id}.png`, 512);
  // Plane geometry's default normal is +Z. To face the aisle:
  //   side=-1 → normal must point +X → rotateY = +π/2
  //   side=+1 → normal must point -X → rotateY = -π/2
  const rotY = -side * (Math.PI / 2);
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      {/* Backing plate — keeps the work readable even when its texture
          is missing or transparent. */}
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[WORK_PLANE_SIZE + 0.5, WORK_PLANE_SIZE + 0.5]} />
        <meshStandardMaterial
          color="#0c0a09"
          roughness={0.95}
          metalness={0.05}
        />
      </mesh>
      {/* The work itself. */}
      <mesh>
        <planeGeometry args={[WORK_PLANE_SIZE, WORK_PLANE_SIZE]} />
        {texture ? (
          <meshBasicMaterial map={texture} toneMapped={false} />
        ) : (
          <meshStandardMaterial color="#1a1612" roughness={0.9} />
        )}
      </mesh>
      {/* Placard underneath — work id + title, in the institutional
          voice. Floats slightly forward so it doesn't z-fight the wall. */}
      <Html
        position={[0, -WORK_PLANE_SIZE / 2 - 0.5, 0.02]}
        center
        transform
        distanceFactor={4}
        style={{ pointerEvents: "none" }}
      >
        <div
          className="font-sans uppercase tracking-[0.18em] whitespace-nowrap select-none"
          style={{
            fontSize: "10px",
            color: "#e8e4dc",
            opacity: 0.9,
            textAlign: "center",
            textShadow: "0 0 6px rgba(0,0,0,0.85)",
          }}
        >
          <div style={{ marginBottom: 4 }}>{work.id}</div>
          {work.title ? (
            <div
              style={{
                fontFamily: "var(--font-display, serif)",
                fontStyle: "italic",
                fontSize: "12px",
                letterSpacing: "0.02em",
                textTransform: "none",
                opacity: 0.85,
              }}
            >
              {work.title}
            </div>
          ) : null}
        </div>
      </Html>
    </group>
  );
}

/* ─── End-of-hall plaque ─────────────────────────────────────────────────── */

function EndPlaque({ z }: { z: number }) {
  return (
    <group position={[0, 2.4, z]}>
      <Html
        position={[0, 0, 0]}
        center
        transform
        distanceFactor={6}
        style={{ pointerEvents: "none" }}
      >
        <div
          className="font-sans uppercase tracking-[0.26em] whitespace-nowrap select-none text-center"
          style={{
            fontSize: "11px",
            color: "#e8e4dc",
            opacity: 0.75,
            textShadow: "0 0 8px rgba(0,0,0,0.85)",
          }}
        >
          End of Procession
        </div>
      </Html>
    </group>
  );
}

/* ─── Gaze-routing for the navigation constellations ─────────────────────── */

function ConstellationGazeRouter({
  archiveStars,
  chamberStars,
  onAim,
}: {
  archiveStars: { position: [number, number, number] }[];
  chamberStars: { position: [number, number, number] }[];
  onAim: (t: NavTarget | null) => void;
}) {
  const { camera } = useThree();
  const lastAimed = useRef<string | null>(null);
  const projected = useRef(new THREE.Vector3());

  useFrame(() => {
    const AIM_THRESH_SQ = 0.12 * 0.12;
    const groups: Array<{
      target: NavTarget;
      stars: { position: [number, number, number] }[];
    }> = [
      {
        target: {
          id: "archive",
          label: "The Archive",
          route: "/museum",
        },
        stars: archiveStars,
      },
      {
        target: {
          id: "chamber",
          label: "The Chamber",
          route: "/museum/gallery/chamber",
        },
        stars: chamberStars,
      },
    ];

    let best: NavTarget | null = null;
    let bestDist = AIM_THRESH_SQ;
    for (const g of groups) {
      for (const s of g.stars) {
        projected.current.set(s.position[0], s.position[1], s.position[2]);
        projected.current.project(camera);
        if (projected.current.z >= 1) continue;
        const d =
          projected.current.x * projected.current.x +
          projected.current.y * projected.current.y;
        if (d < bestDist) {
          bestDist = d;
          best = g.target;
        }
      }
    }

    const id = best?.id ?? null;
    if (id !== lastAimed.current) {
      lastAimed.current = id;
      onAim(best);
    }
  });

  return null;
}

/* ─── HUD ────────────────────────────────────────────────────────────────── */

function SoloHUD({
  originatorId,
  originatorName,
  exhibitionTitle,
  workCount,
  locked,
  pointerLockFailed,
}: {
  originatorId: string | null;
  originatorName: string | null;
  exhibitionTitle: string | null;
  workCount: number;
  locked: boolean;
  pointerLockFailed: boolean;
}) {
  return (
    <div
      className="absolute top-0 left-0 pointer-events-auto"
      style={{ width: 340, padding: 24 }}
    >
      <div
        className="border border-mna-white/15"
        style={{ background: "rgba(6,5,10,0.72)", padding: "20px 22px" }}
      >
        <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/55 mb-2">
          Gallery
        </p>
        <p
          className="font-serif italic text-mna-white"
          style={{ fontSize: "20px", lineHeight: 1.15, marginBottom: 18 }}
        >
          Solo Exhibition Hall
        </p>
        <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/55 mb-2">
          Featured
        </p>
        <p
          className="text-mna-white"
          style={{ fontSize: "13px", marginBottom: 4 }}
        >
          {originatorName ?? "—"}
        </p>
        {exhibitionTitle ? (
          <p
            className="text-mna-white/70 font-serif italic"
            style={{ fontSize: "13px", marginBottom: 6 }}
          >
            {exhibitionTitle}
          </p>
        ) : null}
        <p
          className="text-mna-white/55 font-sans uppercase tracking-[0.18em]"
          style={{ fontSize: "10px", marginBottom: 16 }}
        >
          {workCount} {workCount === 1 ? "work" : "works"}
        </p>
        <div
          className="border-t border-mna-white/15"
          style={{ paddingTop: 14 }}
        >
          {originatorId ? (
            <Link
              href={`/agent/${originatorId}`}
              className="block text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55 hover:text-mna-white mb-2"
            >
              → Agent profile
            </Link>
          ) : null}
          <Link
            href="/museum"
            className="block text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55 hover:text-mna-white"
          >
            ← Return to the Archive
          </Link>
        </div>
        <p
          className="text-[9.5px] font-sans uppercase tracking-[0.22em] text-mna-white/35 mt-5"
          style={{ lineHeight: 1.5 }}
        >
          {locked
            ? "Look — WASD walk — R return"
            : pointerLockFailed
              ? "Drag to look — WASD walk — R return"
              : "Click to resume"}
        </p>
      </div>
    </div>
  );
}

/* ─── Entry overlay ─────────────────────────────────────────────────────── */

function SoloEntry({
  onEnter,
  isTouch,
  originatorName,
  exhibitionTitle,
  workCount,
  hasWorks,
}: {
  onEnter: () => void;
  isTouch: boolean;
  originatorName: string | null;
  exhibitionTitle: string | null;
  workCount: number;
  hasWorks: boolean;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
      <div
        className="border border-mna-white/15 text-center"
        style={{
          background: "rgba(6,5,10,0.85)",
          padding: "44px 56px",
          maxWidth: 520,
        }}
      >
        <p className="text-[10px] font-sans uppercase tracking-[0.32em] text-mna-white/55 mb-4">
          Solo Exhibition Hall
        </p>
        <h1
          className="font-serif italic text-mna-white mb-3"
          style={{ fontSize: "30px", lineHeight: 1.1 }}
        >
          {originatorName ?? "—"}
        </h1>
        {exhibitionTitle ? (
          <p
            className="text-mna-white/75 font-serif italic"
            style={{ fontSize: "15px", marginBottom: 18 }}
          >
            {exhibitionTitle}
          </p>
        ) : null}
        <p
          className="text-mna-white/55 font-sans uppercase tracking-[0.22em]"
          style={{ fontSize: "10px", marginBottom: 24 }}
        >
          {workCount} {workCount === 1 ? "Work" : "Works"} in Procession
        </p>
        {hasWorks ? (
          <button
            type="button"
            onClick={onEnter}
            className="border border-mna-white/45 text-mna-white hover:bg-mna-white/[0.06] transition-colors font-sans uppercase tracking-[0.26em]"
            style={{
              fontSize: "11px",
              padding: "12px 28px",
            }}
          >
            Enter the Hall
          </button>
        ) : (
          <p
            className="text-mna-white/55 italic"
            style={{ fontSize: "13px", marginBottom: 18 }}
          >
            The Curator has not designated a Solo Exhibition yet.
          </p>
        )}
        <p
          className="text-mna-white/35 font-sans uppercase tracking-[0.22em] mt-6"
          style={{ fontSize: "9.5px" }}
        >
          {isTouch
            ? "Touch + drag to look — Joystick to walk"
            : "WASD to walk — Mouse to look — R returns"}
        </p>
        <Link
          href="/museum"
          className="block text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55 hover:text-mna-white mt-6"
        >
          ← Return to the Archive
        </Link>
      </div>
    </div>
  );
}

/* ─── Reticle + resume hint ─────────────────────────────────────────────── */

function Reticle() {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      aria-hidden
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: 99,
          background: "rgba(232,228,220,0.5)",
          boxShadow: "0 0 4px rgba(0,0,0,0.85)",
        }}
      />
    </div>
  );
}

function ResumeHint() {
  return (
    <div className="absolute inset-x-0 bottom-12 flex justify-center pointer-events-none">
      <div
        className="border border-mna-white/25 font-sans uppercase tracking-[0.26em] text-mna-white/80"
        style={{
          fontSize: "10px",
          padding: "8px 20px",
          background: "rgba(6,5,10,0.85)",
        }}
      >
        Click Anywhere to Resume
      </div>
    </div>
  );
}
