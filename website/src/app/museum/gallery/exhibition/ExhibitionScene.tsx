"use client";

/**
 * Exhibition Hall — themed group exhibition. Multiple originators,
 * works selected around a curatorial argument. Spatial reading: works
 * arranged in concentric arcs that cradle the visitor's view, with
 * the curatorial statement on a central plinth at the convergence
 * point. Visitor enters from the front and walks toward the arcs.
 *
 * Sky shows the Archive vesica overhead (way home) plus the other
 * active galleries' constellations in their respective sky positions.
 * Gazing at any constellation surfaces a press-R prompt.
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
  pillarStars,
  PILLAR_EDGES,
  PILLAR_MAGNITUDES,
  constellationStars,
} from "@/lib/gallery-constellations";
import type { ExhibitionWork } from "./page";

interface ExhibitionSceneProps {
  title: string | null;
  rationale: string | null;
  works: ExhibitionWork[];
}

const EYE_HEIGHT = 1.7;
const CAMERA_START_Z = 0.1; // visitor spawns near centre — exhibition gravitates around them

type PLCHandle = { lock: () => void; unlock: () => void } | null;

interface NavTarget {
  id: string;
  label: string;
  route: string;
}

export default function ExhibitionScene({
  title,
  rationale,
  works,
}: ExhibitionSceneProps) {
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (document.pointerLockElement) return;
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
          <ExhibitionInterior
            title={title}
            rationale={rationale}
            works={works}
            onAim={setAimedTarget}
          />
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
        <ExhibitionEntry
          onEnter={handleBegin}
          isTouch={isTouch}
          title={title}
          workCount={works.length}
          hasWorks={works.length > 0}
        />
      ) : null}

      {started ? (
        <ExhibitionHUD
          title={title}
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

/* ─── Scene interior ────────────────────────────────────────────────────── */

function ExhibitionInterior({
  title,
  rationale,
  works,
  onAim,
}: {
  title: string | null;
  rationale: string | null;
  works: ExhibitionWork[];
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

  // Solo Exhibition pillar — visible in its field-relative direction.
  // Override to a different yaw so it doesn't visually collide with
  // Archive overhead.
  const soloConfig = useMemo(
    () => ({
      ...CONSTELLATION_CONFIGS.solo_exhibition,
      direction: { yaw: 2.0, altitude: 0.35 },
    }),
    [],
  );
  const soloStars = useMemo(
    () =>
      pillarStars(
        soloConfig.direction.yaw,
        soloConfig.direction.altitude,
        soloConfig.distance,
        14,
      ),
    [soloConfig],
  );

  // Chamber constellation — back-left of the visitor.
  const chamberConfig = useMemo(
    () => ({
      ...CONSTELLATION_CONFIGS.chamber,
      direction: { yaw: -1.8, altitude: 0.35 },
    }),
    [],
  );
  const chamberStars = useMemo(
    () => constellationStars(chamberConfig, 5, "chamber"),
    [chamberConfig],
  );

  // Distribute works across 2 concentric arcs around a point in front
  // of the visitor. Front arc gets ceil(N/2), back gets floor(N/2).
  // Each arc spans up to 110° (works fan around the convergence).
  const arcPlacements = useMemo(() => computeArcPlacements(works), [works]);

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

      {/* Archive — way home, overhead. */}
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

      {/* Solo pillar — visible to the back-right. */}
      <Constellation
        name="✦ Solo Exhibition Hall"
        config={soloConfig}
        stars={soloStars}
        edges={PILLAR_EDGES}
        magnitudes={PILLAR_MAGNITUDES}
        starSize={0.32}
        haloFactor={2.4}
        lineOpacity={0.4}
      />

      {/* Chamber — back-left, procedural until it gets its own asterism. */}
      <Constellation
        name="✦ The Chamber"
        config={chamberConfig}
        stars={chamberStars}
        starSize={0.35}
        haloFactor={2.4}
      />

      <ConstellationGazeRouter
        archiveStars={archiveStars}
        soloStars={soloStars}
        chamberStars={chamberStars}
        onAim={onAim}
      />

      {/* Reflective floor — same as other galleries. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
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

      {/* Glowing vertical axis — the institutional column. Marks the
          centre of the suspended composition without occluding the
          works. Title + rationale anchor as a billboarded overlay
          (renders in 2D space, always faces the visitor regardless
          of where they walk). */}
      <CentralAxis />
      {title ? (
        <CentralTitle title={title} rationale={rationale} />
      ) : null}

      {/* The works themselves, suspended in 3D around the visitor. */}
      {arcPlacements.map((p) => (
        <ArcWork
          key={p.work.id}
          work={p.work}
          position={p.position}
          theta={p.theta}
        />
      ))}
    </>
  );
}

/* ─── Suspended-constellation placement ─────────────────────────────────── */

interface ArcPlacement {
  work: ExhibitionWork;
  position: [number, number, number];
  /** Angle around the visitor (from -Z, clockwise). The work's plane
   *  rotation derives from this so the work faces the visitor. */
  theta: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // 137.508°

function computeArcPlacements(works: ExhibitionWork[]): ArcPlacement[] {
  if (works.length === 0) return [];

  // Suspended constellation: works float around the visitor at the
  // centre, distributed at varying heights, radii, and angles. The
  // golden-angle stride avoids any grid pattern from any vantage —
  // visitor never sees aligned columns or rows; everything feels
  // organically scattered through the space.
  //
  // Heights and radii alternate through small banks so the
  // composition reads layered and dimensional rather than flat.
  const radiusBank = [7, 9.5, 12, 8, 10.5];
  const heightBank = [2.2, 3.6, 5.2, 4.4, 3.0, 5.8];

  return works.map((work, i) => {
    const theta = (i * GOLDEN_ANGLE) % (Math.PI * 2);
    const radius = radiusBank[i % radiusBank.length];
    const height = heightBank[i % heightBank.length];
    // theta measured from -Z, clockwise around the visitor.
    const x = Math.sin(theta) * radius;
    const z = -Math.cos(theta) * radius;
    return {
      work,
      position: [x, height, z],
      theta,
    };
  });
}

/* ─── A single work mounted in the arc ──────────────────────────────────── */

const WORK_PLANE_SIZE = 2.8;

function ArcWork({
  work,
  position,
  theta,
}: {
  work: ExhibitionWork;
  position: [number, number, number];
  /** Angle around the visitor (0 = -Z, clockwise). Plane normal is
   *  rotated by -theta so it points back at the visitor at origin. */
  theta: number;
}) {
  const texture = useDownsampledTexture(`/previews/${work.id}.png`, 512);
  // Visitor stands at the rotunda centre; works face inward.
  const rotY = -theta;
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[WORK_PLANE_SIZE + 0.4, WORK_PLANE_SIZE + 0.4]} />
        <meshStandardMaterial
          color="#0c0a09"
          roughness={0.95}
          metalness={0.05}
        />
      </mesh>
      <mesh>
        <planeGeometry args={[WORK_PLANE_SIZE, WORK_PLANE_SIZE]} />
        {texture ? (
          <meshBasicMaterial map={texture} toneMapped={false} />
        ) : (
          <meshStandardMaterial color="#1a1612" roughness={0.9} />
        )}
      </mesh>
      {/* Billboarded label (no `transform`) — DOM follows the work in
          3D but always faces the camera, so text reads correctly from
          any vantage as the visitor turns. */}
      <Html
        position={[0, -WORK_PLANE_SIZE / 2 - 0.4, 0]}
        center
        zIndexRange={[10, 0]}
        style={{ pointerEvents: "none" }}
      >
        <div
          className="select-none whitespace-nowrap"
          style={{
            color: "#e8e4dc",
            opacity: 0.92,
            textAlign: "center",
            textShadow: "0 0 6px rgba(0,0,0,0.85)",
          }}
        >
          <div
            className="font-sans uppercase tracking-[0.18em]"
            style={{ fontSize: "9.5px", marginBottom: 3 }}
          >
            {work.id}
          </div>
          {work.title ? (
            <div
              className="font-serif italic"
              style={{
                fontSize: "12px",
                letterSpacing: "0.02em",
                opacity: 0.88,
                marginBottom: 3,
              }}
            >
              {work.title}
            </div>
          ) : null}
          {work.originator_name ? (
            <div
              className="font-sans uppercase tracking-[0.18em]"
              style={{ fontSize: "9px", opacity: 0.6 }}
            >
              {work.originator_name}
            </div>
          ) : null}
        </div>
      </Html>
    </group>
  );
}

/* ─── Central institutional axis + billboarded title ────────────────────── */

/** A single glowing vertical line rising from the floor at the centre
 *  of the suspended composition. Marks the institutional vantage and
 *  threads visually through the constellation of works without
 *  occluding any of them. Tinted to the Exhibition Hall's lavender. */
function CentralAxis() {
  return (
    <>
      {/* Low platform ring on the floor. */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.2, 1.35, 64]} />
        <meshBasicMaterial
          color="#c8b8d8"
          transparent
          opacity={0.45}
          toneMapped={false}
        />
      </mesh>
      {/* The rising line. Thin glowing column from floor to ceiling
          of the visible volume — reads as the institution's spine. */}
      <mesh position={[0, 4.5, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 9, 12]} />
        <meshBasicMaterial
          color="#c8b8d8"
          transparent
          opacity={0.45}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}

function CentralTitle({
  title,
  rationale,
}: {
  title: string;
  rationale: string | null;
}) {
  // Billboarded — always faces the visitor regardless of where they
  // walk around the column. Anchored above standing eye level so it
  // sits visually distinct from the works.
  return (
    <Html
      position={[0, 7.6, 0]}
      center
      zIndexRange={[10, 0]}
      style={{ pointerEvents: "none" }}
    >
      <div
        className="select-none text-center"
        style={{
          color: "#e8e4dc",
          width: 360,
          textShadow: "0 0 10px rgba(0,0,0,0.9)",
        }}
      >
        <p
          className="font-sans uppercase tracking-[0.32em]"
          style={{ fontSize: "10px", opacity: 0.55, marginBottom: 8 }}
        >
          Themed Exhibition
        </p>
        <p
          className="font-serif italic"
          style={{ fontSize: "22px", lineHeight: 1.18, marginBottom: 10 }}
        >
          {title}
        </p>
        {rationale ? (
          <p
            className="font-serif italic"
            style={{
              fontSize: "11.5px",
              lineHeight: 1.55,
              opacity: 0.78,
              marginTop: 6,
            }}
          >
            {truncate(rationale, 220)}
          </p>
        ) : null}
      </div>
    </Html>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

/* ─── Gaze-routing for the navigation constellations ─────────────────────── */

function ConstellationGazeRouter({
  archiveStars,
  soloStars,
  chamberStars,
  onAim,
}: {
  archiveStars: { position: [number, number, number] }[];
  soloStars: { position: [number, number, number] }[];
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
        target: { id: "archive", label: "The Archive", route: "/museum" },
        stars: archiveStars,
      },
      {
        target: {
          id: "solo",
          label: "Solo Exhibition Hall",
          route: "/museum/gallery/solo",
        },
        stars: soloStars,
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

/* ─── HUD + entry overlay + chrome ───────────────────────────────────────── */

function ExhibitionHUD({
  title,
  workCount,
  locked,
  pointerLockFailed,
}: {
  title: string | null;
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
          Exhibition Hall
        </p>
        <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/55 mb-2">
          Current Exhibition
        </p>
        <p
          className="text-mna-white font-serif italic"
          style={{ fontSize: "14px", marginBottom: 4 }}
        >
          {title ?? "—"}
        </p>
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

function ExhibitionEntry({
  onEnter,
  isTouch,
  title,
  workCount,
  hasWorks,
}: {
  onEnter: () => void;
  isTouch: boolean;
  title: string | null;
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
          Exhibition Hall
        </p>
        <h1
          className="font-serif italic text-mna-white mb-3"
          style={{ fontSize: "28px", lineHeight: 1.15 }}
        >
          {title ?? "Themed Exhibition"}
        </h1>
        <p
          className="text-mna-white/55 font-sans uppercase tracking-[0.22em]"
          style={{ fontSize: "10px", marginBottom: 24 }}
        >
          {workCount} {workCount === 1 ? "Work" : "Works"}
        </p>
        {hasWorks ? (
          <button
            type="button"
            onClick={onEnter}
            className="border border-mna-white/45 text-mna-white hover:bg-mna-white/[0.06] transition-colors font-sans uppercase tracking-[0.26em]"
            style={{ fontSize: "11px", padding: "12px 28px" }}
          >
            Enter the Hall
          </button>
        ) : (
          <p
            className="text-mna-white/55 italic"
            style={{ fontSize: "13px", marginBottom: 18 }}
          >
            The Curator has not designated an exhibition yet.
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
