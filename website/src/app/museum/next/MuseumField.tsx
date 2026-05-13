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

import { Canvas, useFrame, useThree, useLoader } from "@react-three/fiber";
import {
  PointerLockControls,
  Grid,
  Billboard,
  Stars,
} from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  Vignette,
} from "@react-three/postprocessing";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { TextureLoader } from "three";
import Link from "next/link";

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

  function handleBegin() {
    setStarted(true);
    // We're inside the click gesture — safe to request pointer-lock.
    // If it fails for any reason, started is already true, so the
    // visitor at least sees the canvas and can click again.
    try {
      controlsRef.current?.lock();
    } catch {
      // ignored
    }
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
  // click in the same event don't cause a double-action.
  function handleCanvasMaybeRelock() {
    if (!started) return;
    if (lockedRef.current) return;
    if (selectedRef.current) return;
    try {
      controlsRef.current?.lock();
    } catch {
      // ignored
    }
  }

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
          </Scene>
          <PointerLockControls
            ref={(r) => {
              controlsRef.current = r as PLCHandle;
            }}
            onLock={() => setLocked(true)}
            onUnlock={() => setLocked(false)}
          />
          <Movement enabled={locked} />

          {/* Atmosphere: bloom around emissive things (horizon beams,
              sculpture haloes), corner vignette for cinematic falloff.
              Intensity tuned low — we want suggestion, not haze. */}
          <EffectComposer>
            <Bloom
              luminanceThreshold={0.55}
              luminanceSmoothing={0.9}
              intensity={0.45}
              mipmapBlur
            />
            <Vignette eskil={false} offset={0.12} darkness={0.55} />
          </EffectComposer>
        </Canvas>
      </div>

      {/* Entry overlay — only visible until first Begin. */}
      {!started ? <EntryOverlay onEnter={handleBegin} /> : null}

      {/* Hover readout — only while walking, never over a modal. */}
      {locked && hovered && !selectedWork ? <HoverReadout work={hovered} /> : null}

      {/* Crosshair — visible only while pointer is locked. */}
      {locked && !selectedWork ? <Reticle /> : null}

      {/* Resume hint — started but not locked and no modal showing. */}
      {started && !locked && !selectedWork ? <ResumeHint /> : null}

      <FooterLine />

      {/* In-museum work overlay (Option A). */}
      {selectedWork ? (
        <WorkOverlay
          work={selectedWork}
          onClose={() => setSelectedWork(null)}
        />
      ) : null}
    </div>
  );
}

/* ─── Scene ──────────────────────────────────────────────────────────────── */

function Scene({ children }: { children: React.ReactNode }) {
  return (
    <>
      <color attach="background" args={["#0a0908"]} />
      <fog attach="fog" args={["#0a0908", 22, 150]} />

      {/* Ambient stays low — most of the light should come from the
          point lights above sculptures and the bloom on horizon beams,
          not from filler ambient. */}
      <ambientLight intensity={0.14} color="#bcc6d0" />
      <directionalLight
        position={[40, 30, 10]}
        intensity={0.32}
        color="#d8c4a0"
      />
      {/* Subtle cool counter-light from the opposite direction so the
          sculptures aren't lit only from one side. */}
      <directionalLight
        position={[-30, 20, -25]}
        intensity={0.14}
        color="#8aa0bc"
      />

      {/* Starfield filling the void. Subtle, sparse, slow drift. */}
      <Stars
        radius={120}
        depth={70}
        count={3000}
        factor={3.2}
        saturation={0}
        fade
        speed={0.25}
      />

      <Grid
        position={[0, 0, 0]}
        args={[400, 400]}
        cellSize={2}
        cellThickness={0.5}
        cellColor="#2a2622"
        sectionSize={20}
        sectionThickness={1.2}
        sectionColor="#48413a"
        fadeDistance={120}
        fadeStrength={1.5}
        infiniteGrid
      />

      {/* Decorative concentric circles around the spawn point — gives
          the empty floor a ceremonial centre and an immediate sense of
          architecture without needing a real environment model. */}
      <FloorRings />

      <HorizonBeam position={[0, 0, -80]} />
      <HorizonBeam position={[80, 0, -30]} dim />
      <HorizonBeam position={[-90, 0, 20]} dim />

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

function HorizonBeam({
  position,
  dim = false,
}: {
  position: [number, number, number];
  dim?: boolean;
}) {
  // Bumped intensity (color values >1 with toneMapped:false) so the
  // bloom pass picks them up and they read as light, not paint.
  const color = dim ? "#5a4a3a" : "#fff0d8";
  const intensity = dim ? 1.6 : 4.2;
  const colorVec = new THREE.Color(color).multiplyScalar(intensity);
  return (
    <mesh position={[position[0], position[1] + 30, position[2]]}>
      <cylinderGeometry args={[0.06, 0.06, 60, 12, 1, true]} />
      <meshBasicMaterial color={colorVec} toneMapped={false} />
    </mesh>
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
          <Suspense key={w.id} fallback={<PlaceholderPlane placed={w} />}>
            <WorkPlane placed={w} onHover={onHover} onSelect={onSelect} />
          </Suspense>
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

function WorkPlane({
  placed,
  onHover,
  onSelect,
}: {
  placed: PlacedWork;
  onHover: (id: string | null) => void;
  onSelect: (placed: PlacedWork) => void;
}) {
  const texture = useLoader(TextureLoader, `/previews/${placed.id}.png`);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }, [texture]);

  const size = placed.size;
  const halo = size * 1.06;

  return (
    <Billboard position={placed.position} follow lockX={false} lockY={false} lockZ={false}>
      {hovered ? (
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[halo, halo]} />
          <meshBasicMaterial
            color={HOVER_TINT}
            transparent
            opacity={0.32}
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

      {/* Sculpture spotlight — warm gallery-style key light directly
          above the piece. Tight falloff so the surrounding void stays
          dark; only the sculpture and the plinth top are lit. */}
      <pointLight
        position={[0, 3.4, 0]}
        intensity={1.6}
        color="#f0d9a8"
        distance={5.2}
        decay={1.6}
      />

      {/* Soft ground glow — always-on warm ring under the plinth so
          sculptures don't sit in a void at a distance. Hover deepens
          it. */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.95, 2.1, 48]} />
        <meshBasicMaterial
          color={hovered ? HOVER_TINT : "#a78458"}
          transparent
          opacity={hovered ? 0.42 : 0.18}
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

function HoverReadout({ work }: { work: PlacedWork }) {
  return (
    <div className="pointer-events-none absolute left-6 bottom-12 z-20 max-w-[360px]">
      <div className="bg-black/55 backdrop-blur-[2px] border border-mna-white/15 px-5 py-4">
        <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55 mb-1.5">
          {work.id}
        </p>
        {work.title ? (
          <p className="font-display italic text-[18px] leading-tight text-mna-white mb-1.5">
            {work.title}
          </p>
        ) : null}
        <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/65">
          {originatorLabel(work)} · {work.medium || work.output_type}
        </p>
        <p className="mt-3 text-[9.5px] font-sans uppercase tracking-[0.24em] text-mna-white/45">
          Click to open
        </p>
      </div>
    </div>
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
