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
import {
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
  KeyCap,
  SceneObjectMesh,
  useDownsampledTexture,
  OtherVisitors,
  PositionPublisher,
  Telemetry,
  type SceneSpec,
} from "../../MuseumField";
import { useGalleryPresence } from "@/lib/use-museum-presence";
import ConstellationNavPanel from "@/components/museum/ConstellationNavPanel";
import { GalleryMinimap } from "@/components/museum/GalleryMinimap";
import {
  CONSTELLATION_CONFIGS,
  vesicaPiscisStars,
  VESICA_EDGES,
  VESICA_MAGNITUDES,
  pillarStars,
  PILLAR_EDGES,
  PILLAR_MAGNITUDES,
  arrowStars,
  ARROW_EDGES,
  ARROW_MAGNITUDES,
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

interface NavTarget {
  id: string;
  label: string;
  name: string;
  tint?: string;
  isReturn?: boolean;
  route: string;
}

export default function ChamberScene({ featuredWork }: ChamberSceneProps) {
  const [started, setStarted] = useState(false);
  const [locked, setLocked] = useState(false);
  const [pointerLockFailed, setPointerLockFailed] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [aimedTarget, setAimedTarget] = useState<NavTarget | null>(null);
  const aimedTargetRef = useRef<NavTarget | null>(null);
  useEffect(() => {
    aimedTargetRef.current = aimedTarget;
  }, [aimedTarget]);
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
  const telemetryRef = useRef({ x: 0, z: CAMERA_START_DISTANCE, yaw: 0 });

  // Realtime presence — same PartyKit room as the field, scoped to
  // the chamber constellation. A visitor entering the chamber sees
  // any agent or human currently in this gallery; visitors elsewhere
  // in the institution are filtered out.
  const presenceHost = process.env.NEXT_PUBLIC_PARTY_HOST ?? null;
  const { others, publish } = useGalleryPresence(presenceHost, "chamber");

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
  // single Esc returns. E navigates to whichever constellation the
  // visitor is currently aimed at — Archive (return), Solo Exhibition,
  // or Exhibition Hall. Matches the field's affordance verbatim.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (document.pointerLockElement) return; // browser releases lock
        router.push("/museum");
        return;
      }
      if (e.key === "e" || e.key === "E") {
        const target = aimedTargetRef.current;
        if (target) router.push(target.route);
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
          <ChamberSceneInterior
            featuredWork={featuredWork}
            onAim={setAimedTarget}
          />
          {started ? <OtherVisitors others={others} /> : null}
          <PositionPublisher publish={publish} />
          <Telemetry telemetryRef={telemetryRef} />
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
              luminanceThreshold={0.35}
              luminanceSmoothing={0.9}
              intensity={0.85}
            />
            <Vignette eskil={false} offset={0.55} darkness={0.22} />
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
            hideTraceOrigin={!!aimedTarget}
            othersPresent={others.length}
          />
          <GalleryMinimap
            telemetryRef={telemetryRef}
            others={others}
            galleryName="Chamber"
            isTouch={isTouch}
          />
          {locked || pointerLockFailed ? <Reticle /> : null}
          {started && !locked && !pointerLockFailed ? <ResumeHint /> : null}
        </>
      ) : null}

      {started && aimedTarget && (locked || pointerLockFailed) ? (
        <ConstellationNavPanel
          target={{
            id: aimedTarget.id,
            name: aimedTarget.name,
            tint: aimedTarget.tint,
            isReturn: aimedTarget.isReturn,
            route: aimedTarget.route,
          }}
          isTouch={isTouch}
          onActivate={() => router.push(aimedTarget.route)}
        />
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
  onAim,
}: {
  featuredWork: ChamberWork | null;
  onAim: (t: NavTarget | null) => void;
}) {
  // The Archive's asterism is a vesica piscis — two arcs meeting at
  // two kissing points, forming a lens shape. Symbolically: the
  // intersection of the institutional layer and the collection layer
  // (the museum is what their meeting *generates*). Eight stars
  // arranged on the two arcs, with the kissing points as the brightest
  // anchors (the structural pivots) and shoulders dimmest. Sized to a
  // realistic naked-eye scale — angular spread ~11°, individual stars
  // well under 1° even with halos.
  const archiveConfig = CONSTELLATION_CONFIGS.archive;
  const archiveStars = useMemo(
    () =>
      vesicaPiscisStars(
        archiveConfig.direction.yaw,
        archiveConfig.direction.altitude,
        archiveConfig.distance,
        16, // total width in metres
        12, // total height in metres
      ),
    [archiveConfig],
  );

  // Solo Exhibition pillar — pre-compute so the gaze router can detect
  // it the same way it detects the Archive. Built with the same helper
  // the field uses, so the chamber sees the constellation in exactly
  // the same position as the field's view of it.
  const soloConfig = CONSTELLATION_CONFIGS.solo_exhibition;
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

  // Exhibition Hall ring — visible to the west of the chamber.
  const exhibitionConfig = CONSTELLATION_CONFIGS.exhibition;
  const exhibitionStars = useMemo(
    () =>
      arrowStars(
        exhibitionConfig.direction.yaw,
        exhibitionConfig.direction.altitude,
        exhibitionConfig.distance,
        14,
      ),
    [exhibitionConfig],
  );

  return (
    <>
      <color attach="background" args={["#06050a"]} />
      {/* Fog pushed out from (24, 120) to (50, 240) so the bright
          Stars layer (radius 95, depth 45 — sits 50–140m out) and
          the Archive constellation (now 85m) aren't eaten by fog
          before they hit the camera. Also makes the room feel
          cathedral-sized instead of closet-sized. */}
      <fog attach="fog" args={["#06050a", 50, 240]} />

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

      {/* The Archive constellation — the way home, rendered as a
          vesica-piscis asterism in the chamber sky. Star size is set
          to a realistic naked-eye scale: 0.3m core with ~0.66m halo
          at 85m distance ≈ 0.5° angular (about one full-moon halo
          for the bright anchors). Variable magnitudes give the
          asterism the bright-anchor / dim-shoulder rhythm of real
          night-sky patterns. */}
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

      {/* Solo Exhibition Hall — visible from the Chamber in its own
          sky direction (yaw 2.35, ~26° up). Mirrors the field's view
          of the same constellation so each gallery feels like it
          shares the same sky rather than a private bubble. */}
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

      {/* Exhibition Hall arrow — west of the chamber. */}
      <Constellation
        name="↗ Exhibition Hall"
        config={exhibitionConfig}
        stars={exhibitionStars}
        edges={ARROW_EDGES}
        magnitudes={ARROW_MAGNITUDES}
        starSize={0.32}
        haloFactor={2.4}
        lineOpacity={0.4}
      />

      {/* Gaze router — when the visitor's view is centred on a
          constellation, surface the press-R affordance and push the
          aimed target up to the page so R navigates correctly. */}
      <ConstellationGazeRouter
        archiveStars={archiveStars}
        soloStars={soloStars}
        exhibitionStars={exhibitionStars}
        onAim={onAim}
      />

      {/* Floor — polished obsidian reflector. The single biggest
          atmosphere lift in a chamber-sized space: the statue, beam,
          and stars catch softly in the floor and the room reads as a
          cathedral interior rather than a black box. Smaller plane
          and lower reflector resolution than the main field since the
          chamber is a single focal scene with no other geometry to
          mirror. Roughness kept high so it's a "polished stone"
          surface, not a mirror. */}
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

/** Multi-target gaze router. Detects which constellation (Archive,
 *  Solo Exhibition, …) the camera is currently centred on and pushes
 *  the corresponding NavTarget up to the parent. The visible
 *  affordance is the DOM-level <ConstellationNavPanel/> rendered in
 *  the scene chrome — same component the field uses, so the
 *  navigation reads identically from any vantage in the museum. */
function ConstellationGazeRouter({
  archiveStars,
  soloStars,
  exhibitionStars,
  onAim,
}: {
  archiveStars: { position: [number, number, number] }[];
  soloStars: { position: [number, number, number] }[];
  exhibitionStars: { position: [number, number, number] }[];
  onAim: (t: NavTarget | null) => void;
}) {
  const { camera } = useThree();
  const projected = useRef(new THREE.Vector3());
  const lastAimedId = useRef<string | null>(null);

  const groups = useMemo(() => {
    return [
      {
        target: {
          id: "archive",
          label: "Press E to return",
          name: "The Archive",
          tint: CONSTELLATION_CONFIGS.archive.tint,
          isReturn: true,
          route: "/museum",
        } satisfies NavTarget,
        stars: archiveStars,
      },
      {
        target: {
          id: "solo",
          label: "Press E for Solo Exhibition",
          name: "Solo Exhibition Hall",
          tint: CONSTELLATION_CONFIGS.solo_exhibition.tint,
          route: "/museum/gallery/solo",
        } satisfies NavTarget,
        stars: soloStars,
      },
      {
        target: {
          id: "exhibition",
          label: "Press E for Exhibition Hall",
          name: "Exhibition Hall",
          tint: CONSTELLATION_CONFIGS.exhibition.tint,
          route: "/museum/gallery/exhibition",
        } satisfies NavTarget,
        stars: exhibitionStars,
      },
    ];
  }, [archiveStars, soloStars, exhibitionStars]);

  useFrame(() => {
    // 12% NDC radius — wide enough that "looking up at the
    // constellation" counts as aim even when not perfectly centred.
    const AIM_THRESH_SQ = 0.12 * 0.12;
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
    if (id !== lastAimedId.current) {
      lastAimedId.current = id;
      onAim(best);
    }
  });

  return null;
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
  hideTraceOrigin,
  othersPresent,
}: {
  work: ChamberWork | null;
  locked: boolean;
  pointerLockFailed: boolean;
  /** True when the visitor is gazing at a constellation. The
   *  ConstellationNavPanel renders at the same bottom-12 position as
   *  Trace Origin, so we hide Trace Origin while a sky target is
   *  primed. */
  hideTraceOrigin: boolean;
  /** Count of other visitors currently in the chamber (humans +
   *  agents). Rendered as a small line in the gallery card; hidden
   *  when zero so the panel doesn't make a claim about gathering
   *  when the visitor is alone. */
  othersPresent: number;
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
          {othersPresent > 0 ? (
            <p className="mt-2 pt-2 border-t border-mna-white/10 text-[9px] font-sans uppercase tracking-[0.26em] text-mna-white/55">
              {othersPresent} other{othersPresent === 1 ? "" : "s"} in the chamber
            </p>
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

      {/* Bottom-center: provenance link for the work. Hidden while a
          constellation is aimed so the lower-third doesn't render two
          stacked panels on top of each other. */}
      {work && !hideTraceOrigin ? (
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
