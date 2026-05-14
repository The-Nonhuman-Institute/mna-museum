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

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, PointerLockControls, Stars } from "@react-three/drei";
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
  KeyCap,
  SceneObjectMesh,
  useDownsampledTexture,
  type SceneSpec,
} from "../../MuseumField";
import {
  CONSTELLATION_CONFIGS,
  constellationStars,
} from "@/lib/gallery-constellations";

interface ChamberWork {
  id: string;
  title: string | null;
  originator_id: string;
  originator_name: string | null;
  medium: string;
  output_type: string;
  canon_date: string | null;
  phase_at_submission: string | null;
  /** For scene-json works, the full payload so we can render the 3D
   *  geometry at monumental scale. null for other output types. */
  scene_payload?: string | null;
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
  // single Esc returns. R also returns immediately from anywhere —
  // matches the field's R-key affordance and gives the Archive
  // constellation a real keypress to teach the visitor.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (document.pointerLockElement) return; // browser releases lock
        router.push("/museum");
        return;
      }
      if (e.key === "r" || e.key === "R") {
        router.push("/museum");
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
          <DragLook
            enabled={pointerLockFailed && started}
            isTouch={isTouch}
          />
          <Movement
            enabled={locked || (pointerLockFailed && started)}
            joystickRef={joystickRef}
          />

          {/* Matches the main field's postprocessing — Bloom is what
              makes the bright stars and the Archive constellation glow
              into legible halos. Without it the constellation stars at
              120m read as a pixel or two, invisible at any real FOV.
              Kept light (no mipmapBlur) to stay within the OOM
              budget that previously crashed the field. */}
          <EffectComposer>
            <Bloom
              luminanceThreshold={0.55}
              luminanceSmoothing={0.9}
              intensity={0.55}
            />
            <Vignette eskil={false} offset={0.5} darkness={0.28} />
          </EffectComposer>
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
  // Pre-compute the Archive constellation stars once. The "archive"
  // config is positioned overhead-forward and uses a wider spread +
  // higher star count than gallery constellations so it visually reads
  // as "the whole cosmos" pointing the visitor back home.
  const archiveConfig = CONSTELLATION_CONFIGS.archive;
  const archiveStars = useMemo(
    () => constellationStars(archiveConfig, 11, "archive"),
    [archiveConfig],
  );

  return (
    <>
      <color attach="background" args={["#06050a"]} />
      <fog attach="fog" args={["#06050a", 24, 120]} />

      {/* Three-light institutional ambient + directional setup so the
          chamber reads as "same cosmos, smaller room." Ambient is
          warmer and slightly stronger than the field's so geometry
          outside the spotlight cone has readable form rather than
          crushing to black. */}
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

      {/* Warm spotlight from above the work — the institutional beam.
          Sits on top of the directional fill, giving the statue rim
          light + a centred altar beam. Brighter + slightly wider cone
          than v1 since the new ambient is now stronger. */}
      <spotLight
        position={[0, 16, 0.5]}
        angle={0.48}
        penumbra={0.45}
        intensity={3.6}
        color={CHAMBER_TINT}
        distance={36}
        decay={1.3}
        target-position={[0, WORK_HEIGHT / 2 + 1, 0]}
      />

      {/* Close-in key light at viewer eye level, slightly in front of
          the statue. This is what actually shows the silhouette to
          someone walking around — pure directional fill aimed across
          the figure. Without it the side facing the camera is always
          in shadow because the spotlight is straight down. */}
      <pointLight
        position={[3.5, 3, 6]}
        intensity={1.4}
        color="#e6d4ad"
        distance={22}
        decay={1.6}
      />
      <pointLight
        position={[-4, 4, -3]}
        intensity={0.9}
        color="#a5b8d0"
        distance={18}
        decay={1.6}
      />

      {/* Soft fill light from below, in the same tint family. */}
      <pointLight
        position={[0, 0.6, 4]}
        intensity={0.55}
        color={CHAMBER_TINT}
        distance={14}
        decay={1.8}
      />

      {/* Two-layer starfield identical to the main field — background
          pinpoints + a few bright bloom-grabbed stars. Continuity:
          looking up in the Chamber, the sky is the same sky as the
          Archive, not a separate dark void. */}
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

      {/* The Archive constellation — the way home, rendered as its own
          star chart in the chamber sky. Bigger, denser, brighter than
          the field's gallery constellations because it represents the
          whole institution, not a single space. */}
      <Constellation
        name="↩ The Archive"
        config={archiveConfig}
        stars={archiveStars}
      />

      {/* When the visitor is gazing at the Archive constellation, show
          a small prompt teaching the R-key affordance. */}
      <ArchiveGazePrompt stars={archiveStars} />

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

/** Gaze detector for the Archive constellation. When the camera's
 *  forward vector lands inside the constellation's screen-space
 *  footprint, render a DOM prompt teaching the R-key affordance. The
 *  prompt anchors to the constellation centroid so it appears right
 *  where the visitor is already looking. */
function ArchiveGazePrompt({
  stars,
}: {
  stars: { position: [number, number, number] }[];
}) {
  const { camera } = useThree();
  const [aiming, setAiming] = useState(false);
  const projected = useRef(new THREE.Vector3());

  const centroid = useMemo<[number, number, number]>(() => {
    let sx = 0, sy = 0, sz = 0;
    for (const s of stars) {
      sx += s.position[0];
      sy += s.position[1];
      sz += s.position[2];
    }
    const n = stars.length || 1;
    return [sx / n, sy / n - 10, sz / n];
  }, [stars]);

  useFrame(() => {
    // 12% NDC radius — slightly wider than the main field's per-star
    // detector because the Archive constellation has a bigger spread
    // and the prompt should appear whenever the visitor is looking
    // "up and forward" at it, not only when dead-centred on a star.
    const AIM_THRESH_SQ = 0.12 * 0.12;
    let inside = false;
    for (const s of stars) {
      projected.current.set(s.position[0], s.position[1], s.position[2]);
      projected.current.project(camera);
      if (projected.current.z >= 1) continue;
      const d =
        projected.current.x * projected.current.x +
        projected.current.y * projected.current.y;
      if (d < AIM_THRESH_SQ) {
        inside = true;
        break;
      }
    }
    if (inside !== aiming) setAiming(inside);
  });

  if (!aiming) return null;
  return (
    <Html
      position={centroid}
      center
      zIndexRange={[10, 0]}
      style={{ pointerEvents: "none" }}
    >
      <div
        className="font-sans uppercase tracking-[0.22em] whitespace-nowrap select-none"
        style={{
          fontSize: "10px",
          color: "#e8e4dc",
          textShadow: "0 0 10px #e8e4dc, 0 0 2px rgba(0,0,0,0.85)",
          opacity: 0.92,
        }}
      >
        Press R to return
      </div>
    </Html>
  );
}

function FeaturedWorkPlane({ work }: { work: ChamberWork }) {
  // Scene-json works render as their actual 3D geometry at monumental
  // scale (cathedral altarpiece). All other output types fall back to
  // the high-res preview PNG.
  if (work.output_type === "scene-json" && work.scene_payload) {
    return <MonumentalSculpture json={work.scene_payload} />;
  }
  return <MonumentalBillboard work={work} />;
}

/** Renders a scene-json work as actual 3D geometry, scaled so the
 *  longest dimension reaches MONUMENTAL_TARGET metres. Auto-rotates
 *  slowly (~5°/sec) so the visitor can stand still and see the piece
 *  from all sides — the institution presents the work, the visitor
 *  observes. */
function MonumentalSculpture({ json }: { json: string }) {
  const groupRef = useRef<THREE.Group>(null);

  const { scene, center, scale } = useMemo(() => {
    let parsed: SceneSpec | null = null;
    try {
      parsed = JSON.parse(json);
    } catch {
      parsed = null;
    }
    if (!parsed || !parsed.objects || parsed.objects.length === 0) {
      return { scene: null, center: [0, 0, 0] as const, scale: 1 };
    }
    const mn = [Infinity, Infinity, Infinity];
    const mx = [-Infinity, -Infinity, -Infinity];
    for (const o of parsed.objects) {
      const p = o.position ?? [0, 0, 0];
      const s = o.scale ?? [1, 1, 1];
      for (let i = 0; i < 3; i++) {
        mn[i] = Math.min(mn[i], p[i] - Math.abs(s[i]) / 2);
        mx[i] = Math.max(mx[i], p[i] + Math.abs(s[i]) / 2);
      }
    }
    const dims = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
    const longest = Math.max(...dims, 0.001);
    const fit = WORK_HEIGHT / longest;
    const c: [number, number, number] = [
      (mn[0] + mx[0]) / 2,
      (mn[1] + mx[1]) / 2,
      (mn[2] + mx[2]) / 2,
    ];
    return { scene: parsed, center: c, scale: fit };
  }, [json]);

  useFrame((_, dt) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += dt * 0.08;
    }
  });

  if (!scene || !scene.objects) {
    return null;
  }

  // Position: bottom of the work's bounding box sits 0.6m above floor.
  // Centered horizontally on the chamber's axis. group rotates as a
  // whole around vertical axis for slow presentation.
  return (
    <group ref={groupRef} position={[0, 0.6, 0]}>
      <group
        position={[
          -center[0] * scale,
          -center[1] * scale + WORK_HEIGHT / 2,
          -center[2] * scale,
        ]}
        scale={scale}
      >
        {scene.objects.map((o, i) => (
          <SceneObjectMesh key={i} obj={o} />
        ))}
      </group>
    </group>
  );
}

/** Renders a 2D work (image / canvas / SVG / etc.) as a billboarded
 *  plane at monumental scale. Used when the featured work isn't a
 *  scene-json sculpture. */
function MonumentalBillboard({ work }: { work: ChamberWork }) {
  const texture = useDownsampledTexture(
    `/previews/${work.id}.png`,
    WORK_TEXTURE_MAX,
  );

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
      <mesh position={[0, 0, -0.3]}>
        <planeGeometry args={[WORK_HEIGHT * 1.15, WORK_HEIGHT * 1.15]} />
        <meshBasicMaterial
          color={CHAMBER_TINT}
          transparent
          opacity={0.06}
          toneMapped={false}
        />
      </mesh>
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
          href="/museum"
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
              href="/museum"
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
