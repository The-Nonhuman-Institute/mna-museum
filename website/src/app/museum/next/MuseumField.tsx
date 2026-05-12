"use client";

/**
 * MuseumField — week 2.
 *
 * The void is now populated. Canonized works are placed across the
 * field in seeded clusters around each originator's centroid, rendered
 * as billboarded textured planes using their preview PNGs. Hovering a
 * work surfaces a small contextual readout at the bottom-left of the
 * HUD; clicks navigate to the public work page.
 *
 * Key design decisions:
 *
 *   - Positions are seeded from `work.id`, so the field is identical
 *     across page loads. A visitor's mental map of "where the
 *     Kuramoto piece is" survives a reload.
 *
 *   - Works are clustered by originator: each originator gets a
 *     centroid on a ring around the spawn point. The visitor walks
 *     between distinct neighborhoods, each implicitly authored.
 *
 *   - Heights vary 1.2-3.4m. Pictures hang at human eye-level mostly,
 *     with some sitting higher to break the rhythm.
 *
 *   - Billboarding: works face the camera at all times so the visitor
 *     reads the image flat. Without billboarding the previews
 *     foreshorten and look like paintings, not artifacts in space —
 *     wrong metaphor for an Originator's output.
 *
 *   - Textures are loaded via React Three Fiber's `useLoader`. The
 *     browser handles caching. Each work suspends on its own; the
 *     whole field doesn't block on any single texture.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls, Grid, Billboard } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { TextureLoader } from "three";
import { useLoader } from "@react-three/fiber";
import Link from "next/link";
import { useRouter } from "next/navigation";

const EYE_HEIGHT = 1.7;
const WALK_SPEED = 4.5;
const SPRINT_SPEED = 8.5;
const RING_RADIUS = 24; // distance of originator centroids from spawn
const CLUSTER_RADIUS = 7; // works scatter this far from their centroid
const HEIGHT_MIN = 1.2;
const HEIGHT_MAX = 3.4;
const WORK_BASE_SIZE = 2.2; // metres edge of a square work in 3D
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
}

interface PlacedWork extends FieldWork {
  position: [number, number, number];
  size: number; // edge length, slight variation per work
}

interface MuseumFieldProps {
  works: FieldWork[];
}

export default function MuseumField({ works }: MuseumFieldProps) {
  const [entered, setEntered] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // One-time placement, deterministic from work id.
  const placed = useMemo(() => placeWorks(works), [works]);
  const hovered = hoveredId ? placed.find((w) => w.id === hoveredId) : null;

  return (
    <div className="fixed inset-0 bg-black">
      <Canvas
        camera={{ fov: 70, near: 0.1, far: 240, position: [0, EYE_HEIGHT, 8] }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <Scene>
          <WorksField placed={placed} onHover={setHoveredId} />
        </Scene>
        {entered ? <Controls onExit={() => setEntered(false)} /> : null}
      </Canvas>

      {!entered ? <EntryOverlay onEnter={() => setEntered(true)} /> : null}

      {/* Hovered-work readout — bottom-left, only while pointer-locked. */}
      {entered && hovered ? <HoverReadout work={hovered} /> : null}

      <FooterLine />

      {/* Reticle — small fixed dot at screen center so the visitor
          knows where they're aiming when pointer is locked. */}
      {entered ? <Reticle /> : null}
    </div>
  );
}

/* ─── Scene ──────────────────────────────────────────────────────────────── */

function Scene({ children }: { children: React.ReactNode }) {
  return (
    <>
      <color attach="background" args={["#0a0908"]} />
      <fog attach="fog" args={["#0a0908", 18, 140]} />

      <ambientLight intensity={0.18} color="#cdd7e0" />
      <directionalLight position={[40, 30, 10]} intensity={0.35} color="#d8c4a0" />

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

      <HorizonBeam position={[0, 0, -80]} />
      <HorizonBeam position={[80, 0, -30]} dim />
      <HorizonBeam position={[-90, 0, 20]} dim />

      {children}
    </>
  );
}

function HorizonBeam({
  position,
  dim = false,
}: {
  position: [number, number, number];
  dim?: boolean;
}) {
  return (
    <mesh position={[position[0], position[1] + 30, position[2]]}>
      <cylinderGeometry args={[0.05, 0.05, 60, 8, 1, true]} />
      <meshBasicMaterial color={dim ? "#3a3530" : "#d4c8b4"} toneMapped={false} />
    </mesh>
  );
}

/* ─── Works field ────────────────────────────────────────────────────────── */

function WorksField({
  placed,
  onHover,
}: {
  placed: PlacedWork[];
  onHover: (id: string | null) => void;
}) {
  return (
    <>
      {placed.map((w) => (
        <Suspense key={w.id} fallback={<PlaceholderPlane placed={w} />}>
          <WorkPlane placed={w} onHover={onHover} />
        </Suspense>
      ))}
    </>
  );
}

/** Light grey square shown until the texture loads. Keeps the field
 *  from popping in violently. */
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
}: {
  placed: PlacedWork;
  onHover: (id: string | null) => void;
}) {
  const texture = useLoader(TextureLoader, `/previews/${placed.id}.png`);
  const [hovered, setHovered] = useState(false);
  const router = useRouter();

  // Crisp pixel-perfect texture without color shift.
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }, [texture]);

  const size = placed.size;
  const halo = size * 1.06;

  return (
    <Billboard position={placed.position} follow lockX={false} lockY={false} lockZ={false}>
      {/* Hover halo — faint warm ring behind the work. */}
      {hovered ? (
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[halo, halo]} />
          <meshBasicMaterial color={HOVER_TINT} transparent opacity={0.32} toneMapped={false} />
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
          router.push(`/work/${placed.id}?from=museum`);
        }}
      >
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </Billboard>
  );
}

/* ─── Placement ──────────────────────────────────────────────────────────── */

function placeWorks(works: FieldWork[]): PlacedWork[] {
  // Group by originator, then assign each originator a fixed angular
  // slot on a ring around the spawn point.
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
    const r = rng() * CLUSTER_RADIUS;
    const a = rng() * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    const y = HEIGHT_MIN + rng() * (HEIGHT_MAX - HEIGHT_MIN);
    const size = WORK_BASE_SIZE * (0.85 + rng() * 0.45); // 0.85x-1.30x
    placed.push({ ...w, position: [x, y, z], size });
  }
  return placed;
}

/** Mulberry32 — small, fast deterministic PRNG. Seed comes from a
 *  string hash of the work id so positions are stable per work. */
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

/* ─── Controls ───────────────────────────────────────────────────────────── */

function Controls({ onExit }: { onExit: () => void }) {
  const keys = useRef<Record<string, boolean>>({});
  const { camera } = useThree();

  useEffect(() => {
    function down(e: KeyboardEvent) {
      keys.current[e.code] = true;
      if (e.code === "Escape") onExit();
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
  }, [onExit]);

  useFrame((_, dt) => {
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

  return <PointerLockControls onUnlock={onExit} />;
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

function originatorLabel(w: PlacedWork): string {
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
