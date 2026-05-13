"use client";

/**
 * MuseumField — observation field.
 *
 * Visitors walk through a procedurally placed canon. Each canonized
 * work appears in seeded position around its originator's cluster.
 * Flat works hang at eye-level as billboarded textured planes;
 * scene-json sculptures stand on plinths with their real 3D geometry.
 *
 * State model (rewritten — two states, two truths):
 *
 *   `started`  one-way: false → true the moment the visitor first
 *              hits "Begin Observation". Sticky. Drives whether the
 *              entry overlay is on screen.
 *
 *   `locked`   mirrors document.pointerLockElement. Updated by
 *              Drei's PointerLockControls onLock/onUnlock callbacks.
 *              Drives WASD movement, the reticle, the resume hint,
 *              and the hover readout.
 *
 *   `selectedWork`  the in-museum work overlay. Opening a work
 *              releases pointer-lock but does NOT clear `started`.
 *
 * The previous implementation conflated started + locked into one
 * `entered` boolean and tried to imperatively call requestPointerLock
 * inside the Begin gesture. That raced with Drei's controls and could
 * leave the visitor stuck on the entry overlay. The new model puts
 * the controls in charge of the lock state and lets the React state
 * trail what the browser actually did.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  PointerLockControls,
  Grid,
  Billboard,
  Stars,
  MeshReflectorMaterial,
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

const EYE_HEIGHT = 1.7;
const WALK_SPEED = 4.5;
const SPRINT_SPEED = 8.5;
const RING_RADIUS = 28;
const CLUSTER_RADIUS = 9;
const MIN_WORK_DISTANCE = 2.5;
const PLACEMENT_RETRIES = 24;
const HEIGHT_MIN = 1.2;
const HEIGHT_MAX = 3.4;
const WORK_BASE_SIZE = 2.2;
const SCULPTURE_TARGET = 2.4;
const PLINTH_HEIGHT = 0.9;
const HOVER_TINT = "#cdb798";

// Aggressive cap on per-work texture size. Source PNGs are 2000×2000;
// uploading 100+ of those to the GPU at full res blows out VRAM
// (Metal: GL_OUT_OF_MEMORY, context lost, page crash). 512² is more
// than enough for a billboarded plane viewed from 5-30m away.
const WORK_TEXTURE_MAX = 512;

// Per-originator tint palette. Each originator gets one of these based
// on a stable hash of its registry id, so walking between clusters
// feels like walking between palettes ("realms") without needing
// separate scenes. Constrained to the institutional warm/cool family
// — none of these clash with each other or the bone/ink chrome.
const ORIGINATOR_TINTS = [
  "#e6c890", // warm amber
  "#a5c4d8", // cool slate
  "#cab69c", // dusty bone
  "#d8b0a0", // peach
  "#9fb8a8", // sage
  "#c8a4be", // mauve
  "#b8a890", // tan
  "#a6abc2", // pale violet
];

function originatorTint(id: string): string {
  return ORIGINATOR_TINTS[stringHash(id) % ORIGINATOR_TINTS.length];
}

interface ClusterCentroid {
  id: string;
  name: string;
  x: number;
  z: number;
  count: number;
}

interface CurrentCluster {
  id: string;
  name: string;
  count: number;
  /** Metres from visitor to centroid. */
  distance: number;
  /** 0..1 — 1 at the centroid, fades to 0 at PROX_OUTER. */
  proximity: number;
}

// How far from a centroid the visitor still counts as "in" the cluster
// for the purposes of the floor glow + HUD callout. Slightly larger
// than CLUSTER_RADIUS so you feel the cluster *before* the first work
// arrives, and the transition out is gradual.
const PROX_OUTER = CLUSTER_RADIUS * 1.5;

function nearestCluster(
  x: number,
  z: number,
  centroids: ClusterCentroid[],
): CurrentCluster | null {
  if (centroids.length === 0) return null;
  let best: ClusterCentroid | null = null;
  let bestDist = Infinity;
  for (const c of centroids) {
    const dx = c.x - x;
    const dz = c.z - z;
    const d = Math.hypot(dx, dz);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  if (!best || bestDist > PROX_OUTER) return null;
  const proximity = Math.max(0, 1 - bestDist / PROX_OUTER);
  return {
    id: best.id,
    name: best.name,
    count: best.count,
    distance: bestDist,
    proximity,
  };
}

export interface FieldWork {
  id: string;
  originator_id: string;
  originator_name: string | null;
  title: string | null;
  medium: string;
  output_type: string;
  canon_date: string | null;
  phase_at_submission: string | null;
  scene_payload?: string | null;
}

interface PlacedWork extends FieldWork {
  position: [number, number, number];
  size: number;
  isSculpture: boolean;
}

interface MuseumFieldProps {
  works: FieldWork[];
}

// Drei's PointerLockControls ref exposes the underlying Three.js
// instance with lock()/unlock(). We don't need the full type.
type PLCHandle = { lock: () => void; unlock: () => void } | null;

export default function MuseumField({ works }: MuseumFieldProps) {
  const [started, setStarted] = useState(false);
  const [locked, setLocked] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedWork, setSelectedWork] = useState<PlacedWork | null>(null);
  // Set to true when the browser refuses or silently fails our Pointer
  // Lock request. Atlas, sandboxed iframes, and (eventually) mobile all
  // land here. Switches the resume hint to a real diagnostic panel and
  // stops retrying the failing lock() call.
  const [pointerLockFailed, setPointerLockFailed] = useState(false);
  const pointerLockFailedRef = useRef(false);
  useEffect(() => {
    pointerLockFailedRef.current = pointerLockFailed;
  }, [pointerLockFailed]);

  const controlsRef = useRef<PLCHandle>(null);
  // Refs mirror state so the canvas-click handler (which captures
  // its closure once) can read fresh values without re-binding.
  const lockedRef = useRef(false);
  const selectedRef = useRef<PlacedWork | null>(null);
  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);
  useEffect(() => {
    selectedRef.current = selectedWork;
  }, [selectedWork]);

  const placed = useMemo(() => placeWorks(works), [works]);
  const hovered = hoveredId ? placed.find((w) => w.id === hoveredId) : null;

  // Camera telemetry for the HUD minimap. Inside Canvas, the
  // Telemetry component reads camera position + yaw and writes them
  // into this ref every frame; a separate interval lifts the ref into
  // React state at ~10Hz so the minimap re-renders smoothly without
  // tanking framerate.
  const telemetryRef = useRef({ x: 0, z: 8, yaw: 0 });
  const [telemetry, setTelemetry] = useState({ x: 0, z: 8, yaw: 0 });
  useEffect(() => {
    const id = setInterval(() => {
      const t = telemetryRef.current;
      setTelemetry({ x: t.x, z: t.z, yaw: t.yaw });
    }, 100);
    return () => clearInterval(id);
  }, []);

  // Originator centroids (for the minimap + visitor glow). Memoize
  // once. Names are sourced from the first work in each group; the
  // placement math here mirrors `placeWorks` so the dot on the minimap
  // sits on the same world point as the actual cluster.
  const centroids = useMemo<ClusterCentroid[]>(() => {
    const grouped = new Map<string, FieldWork[]>();
    for (const w of works) {
      const a = grouped.get(w.originator_id) ?? [];
      a.push(w);
      grouped.set(w.originator_id, a);
    }
    const ids = Array.from(grouped.keys()).sort();
    return ids.map((id, i) => {
      const angle = (i / Math.max(1, ids.length)) * Math.PI * 2;
      const group = grouped.get(id)!;
      return {
        id,
        name: originatorLabel(group[0]),
        x: Math.cos(angle) * RING_RADIUS,
        z: Math.sin(angle) * RING_RADIUS,
        count: group.length,
      };
    });
  }, [works]);

  // The cluster the visitor is currently in (or approaching). Recomputed
  // at the 10Hz telemetry tick — fine for the HUD; the in-world floor
  // glow reads camera position every frame and doesn't depend on this.
  const currentCluster = useMemo(
    () => nearestCluster(telemetry.x, telemetry.z, centroids),
    [telemetry.x, telemetry.z, centroids],
  );

  // E / R key handlers — operate on whatever the visitor is currently
  // looking at (hoveredId). Only active when pointer-locked and no
  // modal is open. E opens the in-museum overlay (same as click), R
  // navigates straight to the work's provenance.
  const router = useRouter();
  const hoveredRef = useRef<PlacedWork | null>(null);
  useEffect(() => {
    hoveredRef.current = hovered ?? null;
  }, [hovered]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!lockedRef.current) return;
      if (selectedRef.current) return;
      const h = hoveredRef.current;
      if (!h) return;
      if (e.code === "KeyE") {
        e.preventDefault();
        openWork(h);
      } else if (e.code === "KeyR") {
        e.preventDefault();
        router.push(`/work/${h.id}/provenance?from=museum`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleBegin() {
    setStarted(true);
    // We're inside the click gesture — safe to request pointer-lock.
    // If it fails for any reason, started is already true, so the
    // visitor at least sees the canvas and can click again.
    try {
      controlsRef.current?.lock();
    } catch {
      setPointerLockFailed(true);
      return;
    }
    // Watchdog: if pointer-lock doesn't engage within 700ms, treat
    // it as failed. onLock fires synchronously-ish when it succeeds
    // (real browser path), so by 700ms we know. Atlas, sandboxed
    // iframes, and any browser without Pointer Lock API land here.
    window.setTimeout(() => {
      if (!document.pointerLockElement) {
        setPointerLockFailed(true);
      }
    }, 700);
  }

  function openWork(work: PlacedWork) {
    // Releasing the lock so the visitor can interact with the modal.
    // The onUnlock callback will update `locked` to false.
    try {
      controlsRef.current?.unlock();
    } catch {
      // ignored
    }
    setSelectedWork(work);
  }

  // Click the canvas to resume walking. Only re-engages lock when:
  // visitor has started, isn't already locked, and no modal is open.
  // We read from refs so any in-flight state updates from a work-
  // click in the same event don't cause a double-action. Skips when
  // pointer-lock has already failed once — re-trying just re-fails.
  function handleCanvasMaybeRelock() {
    if (!started) return;
    if (lockedRef.current) return;
    if (selectedRef.current) return;
    if (pointerLockFailedRef.current) return;
    try {
      controlsRef.current?.lock();
    } catch {
      setPointerLockFailed(true);
    }
  }

  // Global pointerlockerror listener — fires when the browser
  // explicitly rejects the lock request. Belt-and-suspenders with the
  // 700ms watchdog above.
  useEffect(() => {
    function onErr() {
      setPointerLockFailed(true);
    }
    document.addEventListener("pointerlockerror", onErr);
    return () => document.removeEventListener("pointerlockerror", onErr);
  }, []);

  // Universal Escape handler — guarantees the visitor always has a
  // way out, even when pointer-lock is broken. The browser already
  // handles Escape when actually pointer-locked (releases the lock),
  // so we only act when we're stuck on the field with no lock and
  // no modal open. Drops back to the entry overlay.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (document.pointerLockElement) return; // browser handles it
      if (selectedRef.current) return; // WorkOverlay handles it
      if (!started) return;
      setStarted(false);
      setPointerLockFailed(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started]);

  return (
    <div className="fixed inset-0 bg-black">
      {/* Canvas + its click area. Clicks here re-lock when applicable. */}
      <div className="absolute inset-0" onClick={handleCanvasMaybeRelock}>
        <Canvas
          camera={{ fov: 70, near: 0.1, far: 240, position: [0, EYE_HEIGHT, 8] }}
          gl={{ antialias: true, powerPreference: "high-performance" }}
        >
          <Scene>
            <WorksField
              placed={placed}
              onHover={setHoveredId}
              onSelect={openWork}
            />
            <VisitorGlow centroids={centroids} />
          </Scene>
          <PointerLockControls
            ref={(r) => {
              controlsRef.current = r as PLCHandle;
            }}
            onLock={() => setLocked(true)}
            onUnlock={() => setLocked(false)}
          />
          <Movement enabled={locked} />
          <Telemetry telemetryRef={telemetryRef} />

          {/* Atmosphere: bloom around emissive things (horizon beams,
              bright stars, sculpture haloes). Vignette is now very
              subtle — the previous version was darkening the corners
              enough to eat the starfield as the visitor turned. */}
          <EffectComposer>
            <Bloom
              luminanceThreshold={0.4}
              luminanceSmoothing={0.92}
              intensity={0.55}
              mipmapBlur
            />
            <Vignette eskil={false} offset={0.45} darkness={0.22} />
          </EffectComposer>
        </Canvas>
      </div>

      {/* Entry overlay — only visible until first Begin. */}
      {!started ? <EntryOverlay onEnter={handleBegin} /> : null}

      {/* Persistent HUD — visible whenever the visitor is in the
          observation field (started + no entry overlay). Each panel
          hides during the work modal so the visitor's full attention
          is on the work. */}
      {started && !selectedWork ? (
        <>
          <CanonFieldPanel
            originatorCount={centroids.length}
            workCount={works.length}
            locked={locked}
          />
          <MinimapRadar
            telemetry={telemetry}
            centroids={centroids}
            currentCluster={currentCluster}
          />
          <SystemTimeStrip />
        </>
      ) : null}

      {/* Focused-work card — bottom-center, only when looking at
          something. Replaces the previous bottom-left HoverReadout and
          adds E / R keyboard hints. */}
      {locked && hovered && !selectedWork ? (
        <FocusedWorkCard work={hovered} />
      ) : null}

      {locked && !selectedWork ? <Reticle /> : null}

      {started && !locked && !selectedWork ? (
        pointerLockFailed ? (
          <PointerLockFailedPanel onExit={() => setStarted(false)} />
        ) : (
          <ResumeHint />
        )
      ) : null}

      <FooterLine />

      {selectedWork ? (
        <WorkOverlay
          work={selectedWork}
          onClose={() => setSelectedWork(null)}
        />
      ) : null}
    </div>
  );
}

/* ─── Telemetry (camera → HUD ref) ───────────────────────────────────────── */

function Telemetry({
  telemetryRef,
}: {
  telemetryRef: React.MutableRefObject<{ x: number; z: number; yaw: number }>;
}) {
  const { camera } = useThree();
  useFrame(() => {
    // Yaw extracted from the camera's local forward vector projected
    // to the horizontal plane. atan2 gives 0 = -Z (forward), pi/2 = +X.
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const yaw = Math.atan2(fwd.x, -fwd.z);
    telemetryRef.current.x = camera.position.x;
    telemetryRef.current.z = camera.position.z;
    telemetryRef.current.yaw = yaw;
  });
  return null;
}

/* ─── Scene ──────────────────────────────────────────────────────────────── */

function Scene({ children }: { children: React.ReactNode }) {
  return (
    <>
      <color attach="background" args={["#0a0908"]} />
      <fog attach="fog" args={["#0a0908", 24, 160]} />

      <ambientLight intensity={0.14} color="#bcc6d0" />
      <directionalLight
        position={[40, 30, 10]}
        intensity={0.32}
        color="#d8c4a0"
      />
      <directionalLight
        position={[-30, 20, -25]}
        intensity={0.14}
        color="#8aa0bc"
      />

      {/* Two-layer starfield:
          - Background: thousands of dim pinpoints, far away, slow drift
          - Foreground: a few bright stars closer in, larger size, faster
            drift. With higher factor + fade these are the ones bloom
            grabs onto, giving real "stars" with halos rather than dust.  */}
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

      {/* Reflective floor — the single biggest atmosphere lift. A wide
          dark plane just under the grid catches everything above it
          (works, sculptures, beams, stars). Tuned dark and high-
          roughness so it doesn't over-mirror — reads as a polished
          stone slab, not a swimming pool. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.01, 0]}
      >
        <planeGeometry args={[600, 600]} />
        <MeshReflectorMaterial
          blur={[200, 50]}
          resolution={512}
          mixBlur={1.4}
          mixStrength={1.1}
          mirror={0.4}
          roughness={0.94}
          depthScale={0.6}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.2}
          color="#0c0a09"
          metalness={0.25}
        />
      </mesh>

      <Grid
        position={[0, 0, 0]}
        args={[400, 400]}
        cellSize={2}
        cellThickness={0.5}
        cellColor="#2e2924"
        sectionSize={20}
        sectionThickness={1.2}
        sectionColor="#4e4640"
        fadeDistance={130}
        fadeStrength={1.4}
        infiniteGrid
      />

      <FloorRings />

      <HorizonBeams />

      {children}
    </>
  );
}

function FloorRings() {
  // Four thin rings on the floor: 4m, 8m, 14m, 22m radius. Treated as
  // line-style rings via thin RingGeometry; sits a hair above y=0 to
  // avoid z-fighting with the Grid.
  const rings: Array<[number, number]> = [
    [3.8, 4.0],
    [7.7, 7.9],
    [13.8, 14.0],
    [21.8, 22.0],
  ];
  return (
    <group position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      {rings.map(([inner, outer], i) => (
        <mesh key={i}>
          <ringGeometry args={[inner, outer, 96]} />
          <meshBasicMaterial
            color="#5a5249"
            transparent
            opacity={0.45}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Eight beams placed around the visitor at varying distances + heights
 *  + brightnesses + thicknesses. Wherever you turn, at least one is in
 *  view, and they read as a constellation of landmarks rather than a
 *  single forward marker. Positions are hand-picked rather than ringed
 *  so the field doesn't feel like a stage. */
function HorizonBeams() {
  // [x, z, brightness 0..1, height in m, radius in m]
  const beams: Array<[number, number, number, number, number]> = [
    [0, -90, 1.0, 70, 0.08],
    [62, -70, 0.6, 55, 0.06],
    [-58, -75, 0.55, 50, 0.05],
    [98, 25, 0.25, 45, 0.04],
    [-95, 30, 0.22, 50, 0.04],
    [55, 90, 0.3, 50, 0.04],
    [-50, 88, 0.28, 55, 0.04],
    [0, 105, 0.18, 60, 0.05],
  ];
  return (
    <>
      {beams.map(([x, z, b, h, r], i) => (
        <HorizonBeam
          key={i}
          x={x}
          z={z}
          brightness={b}
          height={h}
          radius={r}
        />
      ))}
    </>
  );
}

function HorizonBeam({
  x,
  z,
  brightness,
  height,
  radius,
}: {
  x: number;
  z: number;
  brightness: number;
  height: number;
  radius: number;
}) {
  // Color shifts slightly with brightness — bright beams trend warm
  // white, dim ones trend dusky amber, so the field doesn't look like
  // a single bulb cloned in eight places.
  const baseColor = new THREE.Color().lerpColors(
    new THREE.Color("#705038"),
    new THREE.Color("#fff0d8"),
    brightness,
  );
  // HDR intensity for bloom — exponentiates the brighter end.
  const intensity = 1.0 + brightness * 5.5;
  const hdrColor = baseColor.clone().multiplyScalar(intensity);
  return (
    <mesh position={[x, height / 2, z]}>
      <cylinderGeometry args={[radius, radius, height, 12, 1, true]} />
      <meshBasicMaterial color={hdrColor} toneMapped={false} />
    </mesh>
  );
}

/* ─── Visitor glow ───────────────────────────────────────────────────────── */

/** A soft tinted disc that follows the visitor's feet. Color comes from
 *  the cluster the visitor is currently nearest, opacity fades with
 *  proximity (1 at the centroid, 0 outside PROX_OUTER). This is the
 *  in-world counterpart to the minimap's active-cluster pulse — the
 *  same color appears under your feet that's lit up on the map, so the
 *  field map and the field itself stop reading as separate systems.
 *
 *  Runs inside the Canvas and reads camera position every frame so the
 *  transition is silky regardless of the HUD's 10Hz refresh cadence. */
function VisitorGlow({ centroids }: { centroids: ClusterCentroid[] }) {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const colorRef = useRef(new THREE.Color("#000000"));

  useFrame(() => {
    const g = groupRef.current;
    const m = matRef.current;
    if (!g || !m) return;
    // Glow follows the visitor in X/Z, sits a hair above the floor to
    // avoid z-fighting with the grid + the world floor rings.
    g.position.set(camera.position.x, 0.008, camera.position.z);

    const cluster = nearestCluster(camera.position.x, camera.position.z, centroids);
    if (!cluster) {
      // Lerp opacity toward 0 — still keep last color so the fade is
      // smooth rather than a hard cut to default.
      m.opacity += (0 - m.opacity) * 0.12;
      return;
    }
    const target = new THREE.Color(originatorTint(cluster.id));
    colorRef.current.lerp(target, 0.12);
    m.color.copy(colorRef.current);
    const targetOpacity = 0.28 * cluster.proximity;
    m.opacity += (targetOpacity - m.opacity) * 0.12;
  });

  return (
    <group ref={groupRef} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <ringGeometry args={[1.4, 4.2, 64]} />
        <meshBasicMaterial
          ref={matRef}
          color="#000000"
          transparent
          opacity={0}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/* ─── Works field ────────────────────────────────────────────────────────── */

function WorksField({
  placed,
  onHover,
  onSelect,
}: {
  placed: PlacedWork[];
  onHover: (id: string | null) => void;
  onSelect: (placed: PlacedWork) => void;
}) {
  return (
    <>
      {placed.map((w) =>
        w.isSculpture && w.scene_payload ? (
          <SceneSculpture
            key={w.id}
            placed={w}
            json={w.scene_payload}
            onHover={onHover}
            onSelect={onSelect}
          />
        ) : (
          <WorkPlane
            key={w.id}
            placed={w}
            onHover={onHover}
            onSelect={onSelect}
          />
        ),
      )}
    </>
  );
}

function PlaceholderPlane({ placed }: { placed: PlacedWork }) {
  return (
    <Billboard position={placed.position} follow lockX={false} lockY={false} lockZ={false}>
      <mesh>
        <planeGeometry args={[placed.size, placed.size]} />
        <meshBasicMaterial color="#1a1714" toneMapped={false} />
      </mesh>
    </Billboard>
  );
}

/** Loads `url`, downscales it to at most `maxSize × maxSize` via an
 *  offscreen canvas, and returns a Three.js CanvasTexture with mipmaps
 *  disabled. Mipmaps add ~33% per-texture memory and aren't useful for
 *  camera-facing billboards. Disposes the texture on unmount/URL change
 *  so navigating away frees GPU memory. */
function useDownsampledTexture(
  url: string,
  maxSize: number,
): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    let canceled = false;
    let createdTexture: THREE.Texture | null = null;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (canceled) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const longest = Math.max(w, h, 1);
      const scale = longest > maxSize ? maxSize / longest : 1;
      const dw = Math.max(1, Math.round(w * scale));
      const dh = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = dw;
      canvas.height = dh;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, dw, dh);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      createdTexture = tex;
      setTexture(tex);
    };
    img.onerror = () => {
      // swallow — placeholder will render
    };
    img.src = url;
    return () => {
      canceled = true;
      if (createdTexture) createdTexture.dispose();
    };
  }, [url, maxSize]);

  return texture;
}

function WorkPlane({
  placed,
  onHover,
  onSelect,
}: {
  placed: PlacedWork;
  onHover: (id: string | null) => void;
  onSelect: (placed: PlacedWork) => void;
}) {
  const texture = useDownsampledTexture(
    `/previews/${placed.id}.png`,
    WORK_TEXTURE_MAX,
  );
  const [hovered, setHovered] = useState(false);

  const size = placed.size;
  const halo = size * 1.06;

  const tint = originatorTint(placed.originator_id);

  if (!texture) {
    // Hold the work's slot in the field while its texture is loading
    // so other works don't reflow visually. Tinted to its originator
    // so the cluster reads correctly even pre-texture.
    return (
      <Billboard position={placed.position} follow lockX={false} lockY={false} lockZ={false}>
        <mesh>
          <planeGeometry args={[size, size]} />
          <meshBasicMaterial color={tint} transparent opacity={0.18} toneMapped={false} />
        </mesh>
      </Billboard>
    );
  }

  return (
    <Billboard position={placed.position} follow lockX={false} lockY={false} lockZ={false}>
      {hovered ? (
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[halo, halo]} />
          <meshBasicMaterial
            color={tint}
            transparent
            opacity={0.42}
            toneMapped={false}
          />
        </mesh>
      ) : null}

      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          onHover(placed.id);
        }}
        onPointerOut={() => {
          setHovered(false);
          onHover(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          // Also stop the underlying DOM click from bubbling to the
          // canvas wrapper (which would try to re-lock the cursor).
          e.nativeEvent.stopPropagation();
          onSelect(placed);
        }}
      >
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </Billboard>
  );
}

/* ─── Sculpture (scene-json) rendering ──────────────────────────────────── */

interface SceneObjectSpec {
  shape: "box" | "sphere" | "cylinder" | "cone" | "torus" | "plane";
  position?: number[];
  rotation?: number[];
  scale?: number[];
  color?: string;
  opacity?: number;
  metalness?: number;
  roughness?: number;
}
interface SceneSpec {
  bg?: string;
  objects?: SceneObjectSpec[];
}

function SceneSculpture({
  placed,
  json,
  onHover,
  onSelect,
}: {
  placed: PlacedWork;
  json: string;
  onHover: (id: string | null) => void;
  onSelect: (placed: PlacedWork) => void;
}) {
  const [hovered, setHovered] = useState(false);

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
    const fit = SCULPTURE_TARGET / longest;
    const c: [number, number, number] = [
      (mn[0] + mx[0]) / 2,
      (mn[1] + mx[1]) / 2,
      (mn[2] + mx[2]) / 2,
    ];
    return { scene: parsed, center: c, scale: fit };
  }, [json]);

  if (!scene || !scene.objects) {
    return <PlaceholderPlane placed={placed} />;
  }

  return (
    <group position={placed.position}>
      {/* Plinth */}
      <mesh position={[0, PLINTH_HEIGHT / 2, 0]}>
        <boxGeometry args={[1.6, PLINTH_HEIGHT, 1.6]} />
        <meshStandardMaterial
          color="#1a1714"
          metalness={0.18}
          roughness={0.85}
          emissive="#2a1e10"
          emissiveIntensity={0.18}
        />
      </mesh>

      {/* Sculpture spotlight — per-originator tinted key light above
          the piece. Visitors walking across the field cross between
          warm and cool pools of light depending on whose region they
          enter. Tight falloff so the surrounding void stays dark. */}
      <pointLight
        position={[0, 3.4, 0]}
        intensity={1.6}
        color={originatorTint(placed.originator_id)}
        distance={5.2}
        decay={1.6}
      />

      {/* Soft ground glow — always-on tinted ring under the plinth.
          Hover flips to the warm hover tint regardless of region. */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.95, 2.1, 48]} />
        <meshBasicMaterial
          color={hovered ? HOVER_TINT : originatorTint(placed.originator_id)}
          transparent
          opacity={hovered ? 0.45 : 0.16}
          toneMapped={false}
        />
      </mesh>

      <group
        position={[-center[0] * scale, PLINTH_HEIGHT + 0.02, -center[2] * scale]}
        scale={scale}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          onHover(placed.id);
        }}
        onPointerOut={() => {
          setHovered(false);
          onHover(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          e.nativeEvent.stopPropagation();
          onSelect(placed);
        }}
      >
        {scene.objects.map((o, i) => (
          <SceneObjectMesh key={i} obj={o} />
        ))}
      </group>
    </group>
  );
}

function SceneObjectMesh({ obj }: { obj: SceneObjectSpec }) {
  const opacity = obj.opacity ?? 1;
  const pos = (obj.position ?? [0, 0, 0]) as [number, number, number];
  const rot = (obj.rotation ?? [0, 0, 0]) as [number, number, number];
  const scl = (obj.scale ?? [1, 1, 1]) as [number, number, number];
  return (
    <mesh position={pos} rotation={rot} scale={scl}>
      {geomForShape(obj.shape)}
      <meshStandardMaterial
        color={obj.color || "#9b938a"}
        opacity={opacity}
        transparent={opacity < 1}
        metalness={obj.metalness ?? 0.15}
        roughness={obj.roughness ?? 0.75}
      />
    </mesh>
  );
}

function geomForShape(shape: SceneObjectSpec["shape"]) {
  switch (shape) {
    case "sphere":
      return <sphereGeometry args={[0.5, 24, 18]} />;
    case "cylinder":
      return <cylinderGeometry args={[0.5, 0.5, 1, 24]} />;
    case "cone":
      return <coneGeometry args={[0.5, 1, 24]} />;
    case "torus":
      return <torusGeometry args={[0.5, 0.15, 12, 36]} />;
    case "plane":
      return <planeGeometry args={[1, 1]} />;
    case "box":
    default:
      return <boxGeometry args={[1, 1, 1]} />;
  }
}

/* ─── Placement ──────────────────────────────────────────────────────────── */

function placeWorks(works: FieldWork[]): PlacedWork[] {
  const grouped = new Map<string, FieldWork[]>();
  for (const w of works) {
    const arr = grouped.get(w.originator_id) ?? [];
    arr.push(w);
    grouped.set(w.originator_id, arr);
  }
  const originators = Array.from(grouped.keys()).sort();

  const centroids = new Map<string, [number, number]>();
  originators.forEach((id, i) => {
    const angle = (i / Math.max(1, originators.length)) * Math.PI * 2;
    centroids.set(id, [
      Math.cos(angle) * RING_RADIUS,
      Math.sin(angle) * RING_RADIUS,
    ]);
  });

  const placed: PlacedWork[] = [];
  for (const w of works) {
    const [cx, cz] = centroids.get(w.originator_id) ?? [0, 0];
    const rng = seededRandom(w.id);
    const isSculpture = w.output_type === "scene-json" && Boolean(w.scene_payload);

    let x = cx, y = 0, z = cz;
    for (let attempt = 0; attempt < PLACEMENT_RETRIES; attempt++) {
      const r = Math.sqrt(rng()) * CLUSTER_RADIUS;
      const a = rng() * Math.PI * 2;
      const tx = cx + Math.cos(a) * r;
      const tz = cz + Math.sin(a) * r;
      const ty = isSculpture
        ? 0
        : HEIGHT_MIN + rng() * (HEIGHT_MAX - HEIGHT_MIN);
      let ok = true;
      for (const p of placed) {
        const dx = p.position[0] - tx;
        const dy = p.position[1] - ty;
        const dz = p.position[2] - tz;
        if (dx * dx + dy * dy + dz * dz < MIN_WORK_DISTANCE * MIN_WORK_DISTANCE) {
          ok = false;
          break;
        }
      }
      if (ok || attempt === PLACEMENT_RETRIES - 1) {
        x = tx;
        y = ty;
        z = tz;
        if (ok) break;
      }
    }

    const size = WORK_BASE_SIZE * (0.85 + rng() * 0.45);
    placed.push({ ...w, position: [x, y, z], size, isSculpture });
  }
  return placed;
}

function seededRandom(seed: string): () => number {
  let a = stringHash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stringHash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ─── Movement (WASD) ────────────────────────────────────────────────────── */

/** Walks the camera in its horizontal frame based on key state. Gated
 *  by `enabled` so the visitor doesn't slide around while a modal is
 *  open or before they begin observation. */
function Movement({ enabled }: { enabled: boolean }) {
  const keys = useRef<Record<string, boolean>>({});
  const { camera } = useThree();

  useEffect(() => {
    function down(e: KeyboardEvent) {
      keys.current[e.code] = true;
    }
    function up(e: KeyboardEvent) {
      keys.current[e.code] = false;
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useFrame((_, dt) => {
    if (!enabled) return;
    const k = keys.current;
    const forward =
      Number(k.KeyW || k.ArrowUp || 0) - Number(k.KeyS || k.ArrowDown || 0);
    const strafe =
      Number(k.KeyD || k.ArrowRight || 0) - Number(k.KeyA || k.ArrowLeft || 0);
    if (forward === 0 && strafe === 0) return;

    const speed = k.ShiftLeft || k.ShiftRight ? SPRINT_SPEED : WALK_SPEED;

    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const right = new THREE.Vector3()
      .crossVectors(fwd, new THREE.Vector3(0, 1, 0))
      .normalize();

    const step = speed * dt;
    camera.position.addScaledVector(fwd, forward * step);
    camera.position.addScaledVector(right, strafe * step);
    camera.position.y = EYE_HEIGHT;
  });

  return null;
}

/* ─── HUD pieces ─────────────────────────────────────────────────────────── */

function EntryOverlay({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-mna-white pointer-events-none">
      <div className="bg-black/55 backdrop-blur-[2px] border border-mna-white/15 px-10 py-9 max-w-[480px] text-center pointer-events-auto">
        <p className="text-[10px] font-sans uppercase tracking-[0.32em] text-mna-white/55 mb-4">
          Observation Field · Preview
        </p>
        <h1 className="font-display text-[42px] leading-[1.05] tracking-tight text-mna-white mb-5">
          Enter the Archive
        </h1>
        <p className="text-[13px] text-mna-white/72 leading-[1.7] mb-7">
          You are a visitor. Observe. Do not interfere.
        </p>
        <button
          type="button"
          onClick={onEnter}
          className="inline-flex items-center gap-3 bg-mna-white text-ink px-6 py-3 text-[10.5px] font-sans uppercase tracking-[0.26em] hover:bg-mna-white/90 transition-colors"
        >
          <span>Begin Observation</span>
          <span aria-hidden>→</span>
        </button>
        <div className="mt-7 pt-6 border-t border-mna-white/15 grid grid-cols-2 gap-y-2 text-[10px] uppercase tracking-[0.22em] text-mna-white/55">
          <span className="text-left">W A S D</span>
          <span className="text-right">Move</span>
          <span className="text-left">Mouse</span>
          <span className="text-right">Look</span>
          <span className="text-left">Shift</span>
          <span className="text-right">Walk Faster</span>
          <span className="text-left">Click</span>
          <span className="text-right">Open Work</span>
          <span className="text-left">Esc</span>
          <span className="text-right">Release</span>
        </div>
        <Link
          href="/canon"
          className="mt-6 inline-block text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55 hover:text-mna-white transition-colors"
        >
          Return to Canon →
        </Link>
      </div>
    </div>
  );
}

/** Bottom-center card surfaced whenever the visitor is looking at a
 *  work. Replaces the old bottom-left HoverReadout and adds keyboard
 *  shortcuts so the visitor can act without unlocking the cursor. */
function FocusedWorkCard({ work }: { work: PlacedWork }) {
  const tint = originatorTint(work.originator_id);
  return (
    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-12 z-20 max-w-[520px] w-[88vw]">
      <div className="bg-black/68 backdrop-blur-[3px] border border-mna-white/15 px-6 py-4">
        <div className="flex items-baseline gap-3 mb-1.5">
          <span
            aria-hidden
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: tint }}
          />
          <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55">
            {work.id}
          </p>
          {work.canon_date ? (
            <p className="ml-auto text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/45">
              Canonized
            </p>
          ) : null}
        </div>
        {work.title ? (
          <p className="font-display italic text-[20px] leading-tight text-mna-white mb-1">
            {work.title}
          </p>
        ) : null}
        <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/70 mb-3.5">
          {originatorLabel(work)} · {work.medium || work.output_type}
        </p>
        <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-mna-white/10 text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55">
          <span className="inline-flex items-center gap-2">
            <KeyCap label="E" />
            Observe
          </span>
          <span className="inline-flex items-center gap-2">
            <KeyCap label="R" />
            Trace Origin
          </span>
          <span className="ml-auto text-mna-white/35">or click</span>
        </div>
      </div>
    </div>
  );
}

function KeyCap({ label }: { label: string }) {
  return (
    <span
      className="inline-block min-w-[18px] text-center px-1.5 py-0.5 border border-mna-white/35 text-mna-white/80 text-[9px] tracking-[0.06em] uppercase"
      aria-hidden
    >
      {label}
    </span>
  );
}

function originatorLabel(w: FieldWork): string {
  const name = (w.originator_name || "").trim();
  if (
    name &&
    name.toUpperCase() !== "PENDING_EMERGENCE" &&
    name !== "[Pending Emergence]"
  ) {
    return name.toUpperCase();
  }
  return w.originator_id;
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

function FooterLine() {
  return (
    <div className="pointer-events-none absolute bottom-4 left-0 right-0 flex justify-between items-center px-6 text-[9.5px] font-sans uppercase tracking-[0.26em] text-mna-white/40">
      <span>The Observer is Human. We Observe. We Do Not Interfere.</span>
      <span>Museum of Nonhuman Art</span>
    </div>
  );
}

/* ─── Canon Field panel (top-left) ───────────────────────────────────────── */

function CanonFieldPanel({
  originatorCount,
  workCount,
  locked,
}: {
  originatorCount: number;
  workCount: number;
  locked: boolean;
}) {
  return (
    <div className="pointer-events-none absolute top-5 left-5 z-20 max-w-[290px]">
      <div className="bg-black/60 backdrop-blur-[3px] border border-mna-white/15 px-5 py-4">
        <p className="text-[10px] font-sans uppercase tracking-[0.32em] text-mna-white/55 mb-1.5">
          Canon Field
        </p>
        <p className="font-display italic text-[16px] leading-tight text-mna-white mb-3">
          The Archive
        </p>
        <p className="text-[11px] leading-[1.55] text-mna-white/65 mb-4">
          A navigable space for observing the emergence of nonhuman
          creativity. Walk the canon; each work stands where it was
          placed by the institution.
        </p>
        <div className="flex items-center justify-between text-[9.5px] font-sans uppercase tracking-[0.22em] text-mna-white/55 pt-3 border-t border-mna-white/10">
          <span>
            {workCount} works · {originatorCount} originators
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${locked ? "bg-emerald-400" : "bg-mna-white/30"}`}
              aria-hidden
            />
            {locked ? "Observing" : "Idle"}
          </span>
        </div>
        {/* Always-visible exit. pointer-events-auto so it works even
            when the surrounding card is click-through, and when pointer
            lock is broken (Atlas, sandbox, etc.) the visitor is one
            click away from leaving the field. */}
        <div className="pointer-events-auto mt-3 pt-3 border-t border-mna-white/10">
          <Link
            href="/canon"
            className="text-[9.5px] font-sans uppercase tracking-[0.26em] text-mna-white/55 hover:text-mna-white transition-colors"
          >
            ← Exit · Return to Canon
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ─── System Time strip (bottom-right) ───────────────────────────────────── */

function SystemTimeStrip() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const date = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const time = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return (
    <div className="pointer-events-none absolute bottom-12 right-5 z-20">
      <div className="bg-black/60 backdrop-blur-[3px] border border-mna-white/15 px-5 py-4 min-w-[180px] text-right">
        <p className="text-[9.5px] font-sans uppercase tracking-[0.26em] text-mna-white/55 mb-1.5">
          System Time
        </p>
        <p className="font-display text-[20px] leading-none text-mna-white tabular-nums mb-1">
          {time}
        </p>
        <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55 mb-3">
          {date} · UTC
        </p>
        <p className="text-[9px] font-sans uppercase tracking-[0.26em] text-mna-white/45 pt-3 border-t border-mna-white/10">
          Visitor · Observer
        </p>
      </div>
    </div>
  );
}

/* ─── Minimap radar (top-right) ──────────────────────────────────────────── */

const MINIMAP_SIZE = 168; // px
const MINIMAP_RADIUS_M = 60; // world-metres → maps to MINIMAP_SIZE / 2

function MinimapRadar({
  telemetry,
  centroids,
  currentCluster,
}: {
  telemetry: { x: number; z: number; yaw: number };
  centroids: ClusterCentroid[];
  currentCluster: CurrentCluster | null;
}) {
  const half = MINIMAP_SIZE / 2;
  // World → minimap pixel mapping. Visitor is always centered.
  // North-up: world +z extends down on the minimap, world -z is up.
  function toPx(worldX: number, worldZ: number) {
    const dx = worldX - telemetry.x;
    const dz = worldZ - telemetry.z;
    const px = half + (dx / MINIMAP_RADIUS_M) * half;
    const py = half + (dz / MINIMAP_RADIUS_M) * half;
    return { x: px, y: py };
  }
  return (
    <div className="pointer-events-none absolute top-5 right-5 z-20">
      <div className="bg-black/60 backdrop-blur-[3px] border border-mna-white/15 p-3">
        <div className="flex items-baseline justify-between mb-2 px-1">
          <p className="text-[9.5px] font-sans uppercase tracking-[0.26em] text-mna-white/55">
            Field Map
          </p>
          <p className="text-[9px] font-sans uppercase tracking-[0.22em] text-mna-white/35 tabular-nums">
            N
          </p>
        </div>
        <div
          className="relative rounded-full border border-mna-white/12 bg-black/40 overflow-hidden"
          style={{ width: MINIMAP_SIZE, height: MINIMAP_SIZE }}
        >
          {/* Concentric guide rings */}
          <div className="absolute inset-0 rounded-full border border-mna-white/8" />
          <div
            className="absolute rounded-full border border-mna-white/8"
            style={{
              left: "16%",
              top: "16%",
              width: "68%",
              height: "68%",
            }}
          />
          <div
            className="absolute rounded-full border border-mna-white/8"
            style={{
              left: "33%",
              top: "33%",
              width: "34%",
              height: "34%",
            }}
          />

          {/* Cluster centroids. The currently-occupied cluster gets a
              brighter dot + halo so the dot-on-map and pool-of-light-
              in-world read as the same thing. */}
          {centroids.map((c) => {
            const p = toPx(c.x, c.z);
            if (
              p.x < -8 ||
              p.x > MINIMAP_SIZE + 8 ||
              p.y < -8 ||
              p.y > MINIMAP_SIZE + 8
            )
              return null;
            const tint = originatorTint(c.id);
            const active = currentCluster?.id === c.id;
            const dotSize = active ? 8 : 6;
            return (
              <span key={c.id}>
                {active ? (
                  <span
                    aria-hidden
                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{
                      left: p.x,
                      top: p.y,
                      width: 22,
                      height: 22,
                      backgroundColor: tint,
                      opacity: 0.18 + currentCluster!.proximity * 0.18,
                      filter: "blur(4px)",
                    }}
                  />
                ) : null}
                <span
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    left: p.x,
                    top: p.y,
                    width: dotSize,
                    height: dotSize,
                    backgroundColor: tint,
                    boxShadow: active
                      ? `0 0 10px ${tint}, 0 0 2px #fff8`
                      : `0 0 6px ${tint}`,
                    border: active ? "1px solid rgba(255,255,255,0.45)" : undefined,
                  }}
                  aria-hidden
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

        {/* Current-cluster callout. Replaces the previous static
            "N clusters · 60m radius" footer with a contextual label
            that names whose region you're standing in. Falls back to
            the static line when you're in the void between clusters. */}
        {currentCluster ? (
          <div className="mt-2 px-1 pt-2 border-t border-mna-white/10">
            <p className="text-[8.5px] font-sans uppercase tracking-[0.26em] text-mna-white/40 mb-1">
              Observing
            </p>
            <p
              className="text-[10.5px] font-sans uppercase tracking-[0.22em] leading-tight truncate"
              style={{ color: originatorTint(currentCluster.id) }}
              title={currentCluster.name}
            >
              {currentCluster.name}
            </p>
            <p className="mt-1 text-[8.5px] font-sans uppercase tracking-[0.22em] text-mna-white/45 tabular-nums">
              {currentCluster.count} {currentCluster.count === 1 ? "work" : "works"} · {Math.round(currentCluster.distance)}m to centroid
            </p>
          </div>
        ) : (
          <p className="mt-2 px-1 text-[8.5px] font-sans uppercase tracking-[0.26em] text-mna-white/40">
            {centroids.length} clusters · {Math.round(MINIMAP_RADIUS_M)}m radius
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Resume hint ────────────────────────────────────────────────────────── */

function ResumeHint() {
  return (
    <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-14 z-20">
      <div className="bg-black/60 border border-mna-white/15 px-4 py-2 text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/75">
        Click anywhere to resume
      </div>
    </div>
  );
}

/** Surfaced when the browser refuses our Pointer Lock request. Replaces
 *  the "Click anywhere to resume" loop with a real diagnosis and a way
 *  out. Atlas's agent overlay, sandboxed iframes, and (eventually)
 *  touch devices land here. */
function PointerLockFailedPanel({ onExit }: { onExit: () => void }) {
  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-14 z-20 max-w-[520px] w-[92vw]">
      <div className="bg-black/85 border border-mna-white/20 px-7 py-6">
        <p className="text-[10px] font-sans uppercase tracking-[0.32em] text-mna-white/55 mb-3">
          Observation Field · Browser Not Supported
        </p>
        <p className="text-[13px] leading-[1.6] text-mna-white/85 mb-4">
          The observation field requires the Pointer Lock API, which this
          browser does not appear to support — likely an agent overlay or
          sandbox restriction is intercepting the request.
        </p>
        <p className="text-[11px] leading-[1.55] text-mna-white/60 mb-5">
          Open in Chrome, Safari, or Firefox to walk the field. Touch
          and agent-browser support is in development.
        </p>
        <div className="flex flex-wrap items-center gap-4 text-[10.5px] font-sans uppercase tracking-[0.26em]">
          <Link
            href="/canon"
            className="inline-flex items-center gap-2 bg-mna-white text-ink px-4 py-2 hover:bg-mna-white/90 transition-colors"
          >
            Return to Canon →
          </Link>
          <button
            type="button"
            onClick={onExit}
            className="text-mna-white/65 hover:text-mna-white transition-colors border-b border-mna-white/35 pb-1"
          >
            Reset observation
          </button>
          <span className="ml-auto text-mna-white/40">or press Esc</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Work overlay (Option A — in-museum modal) ──────────────────────────── */

function WorkOverlay({
  work,
  onClose,
}: {
  work: PlacedWork;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const statusLabel = work.canon_date ? "Canonized" : "In Record";
  const dateLine = work.canon_date
    ? new Date(work.canon_date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div
      className="fixed inset-0 z-30 bg-black/72 backdrop-blur-[1px] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`${work.title || work.id} — observation`}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-5 right-6 z-10 text-mna-white/65 hover:text-mna-white transition-colors text-3xl leading-none"
        aria-label="Close"
      >
        ×
      </button>

      <div
        className="relative bg-ink/95 border border-mna-white/15 max-w-[860px] w-[92vw] max-h-[88vh] flex flex-col md:flex-row overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="md:w-[420px] aspect-square md:aspect-auto bg-[#0a0908] flex items-center justify-center flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/previews/${work.id}.png`}
            alt={work.title || work.id}
            className="w-full h-full object-contain"
          />
        </div>

        <div className="flex-1 p-7 md:p-9 flex flex-col">
          <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/55 mb-3">
            Observation · {statusLabel}
            {dateLine ? ` · ${dateLine}` : ""}
          </p>
          <p className="text-[10px] font-sans tracking-[0.04em] text-mna-white/60 mb-3">
            {work.id}
          </p>
          <h2 className="font-display italic text-[28px] md:text-[32px] leading-[1.1] text-mna-white mb-5">
            {work.title || "Untitled"}
          </h2>

          <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-[12px] mb-7">
            <div>
              <dt className="text-[9.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-1">
                Originator
              </dt>
              <dd className="text-mna-white/85">{originatorLabel(work)}</dd>
            </div>
            <div>
              <dt className="text-[9.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-1">
                Medium
              </dt>
              <dd className="text-mna-white/85">{work.medium || "—"}</dd>
            </div>
            <div>
              <dt className="text-[9.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-1">
                Phase
              </dt>
              <dd className="text-mna-white/85">{work.phase_at_submission || "I"}</dd>
            </div>
            <div>
              <dt className="text-[9.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-1">
                Output Type
              </dt>
              <dd className="text-mna-white/85 font-mono text-[11px]">
                {work.output_type}
              </dd>
            </div>
          </dl>

          <p className="text-[11px] leading-[1.65] text-mna-white/65 mb-7 max-w-prose">
            This is an observation. The full institutional record — council
            rationales, dissent, deliberation, full provenance — lives on
            the work&apos;s permanent page.
          </p>

          <div className="mt-auto flex flex-wrap items-center gap-5">
            <Link
              href={`/work/${work.id}/provenance?from=museum`}
              className="inline-flex items-center gap-3 bg-mna-white text-ink px-5 py-3 text-[10.5px] font-sans uppercase tracking-[0.26em] hover:bg-mna-white/90 transition-colors"
            >
              <span>View Full Record</span>
              <span aria-hidden>→</span>
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="text-[10.5px] font-sans uppercase tracking-[0.26em] text-mna-white/65 hover:text-mna-white transition-colors border-b border-mna-white/35 pb-1"
            >
              Close · keep observing
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
