"use client";

/**
 * MuseumField — week 1 skeleton.
 *
 * A walkable empty void. No works in it yet. The point of this build is
 * to land the foundation: R3F canvas, dark space + ground grid + fog, a
 * camera at human height, WASD movement gated on pointer-lock for mouse
 * look. Once this feels right, week 2 populates the field with works.
 *
 * Decisions worth flagging:
 *   - Pointer-lock controls require an explicit "click to enter" gesture
 *     because browsers won't lock the cursor without user activation.
 *   - Movement is computed in the camera's local frame: WS = forward/back
 *     along the look direction (projected to horizontal); AD = strafe.
 *     The visitor never goes underground or rises — y stays at eye height.
 *   - Fog density is tuned so the horizon dissolves rather than ending in
 *     a hard skybox edge. We don't ship a skybox; the void is the sky.
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls, Grid } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import Link from "next/link";

const EYE_HEIGHT = 1.7; // meters above the ground plane
const WALK_SPEED = 4.5; // m/s — measured; comfortable institutional pace
const SPRINT_SPEED = 8.5; // Shift held

export default function MuseumField() {
  const [entered, setEntered] = useState(false);

  return (
    <div className="fixed inset-0 bg-black">
      <Canvas
        camera={{ fov: 70, near: 0.1, far: 220, position: [0, EYE_HEIGHT, 8] }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <Scene />
        {entered ? <Controls onExit={() => setEntered(false)} /> : null}
      </Canvas>

      {/* Pre-entry overlay. PointerLock can only be requested from a
          direct user gesture, so we capture the click here. */}
      {!entered ? <EntryOverlay onEnter={() => setEntered(true)} /> : null}

      {/* Persistent institutional footer — visible in both states. */}
      <FooterLine />
    </div>
  );
}

/* ─── Scene ──────────────────────────────────────────────────────────────── */

function Scene() {
  return (
    <>
      {/* The void itself */}
      <color attach="background" args={["#0a0908"]} />
      <fog attach="fog" args={["#0a0908", 18, 140]} />

      {/* Ambient + key light. Low ambient keeps the void dark; the
          ground grid catches a soft directional warm-cool to imply depth
          without giving the scene an obvious time of day. */}
      <ambientLight intensity={0.18} color="#cdd7e0" />
      <directionalLight position={[40, 30, 10]} intensity={0.35} color="#d8c4a0" />

      {/* Ground grid — institutional, not decorative. Cells are 2m so a
          walking visitor crosses one every ~0.5s at WALK_SPEED. Fades
          into fog. */}
      <Grid
        position={[0, 0, 0]}
        args={[400, 400]}
        cellSize={2}
        cellThickness={0.5}
        cellColor="#2a2622"
        sectionSize={20}
        sectionThickness={1.2}
        sectionColor="#48413a"
        fadeDistance={100}
        fadeStrength={1.5}
        infiniteGrid
      />

      {/* Distant horizon beam — gives the visitor a fixed referent to
          orient toward. It's a tall thin emissive cylinder; the fog
          takes care of the soft falloff. */}
      <HorizonBeam position={[0, 0, -80]} />
      <HorizonBeam position={[80, 0, -30]} dim />
      <HorizonBeam position={[-90, 0, 20]} dim />
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
      <meshBasicMaterial
        color={dim ? "#3a3530" : "#d4c8b4"}
        toneMapped={false}
      />
    </mesh>
  );
}

/* ─── Controls ───────────────────────────────────────────────────────────── */

function Controls({ onExit }: { onExit: () => void }) {
  const keys = useRef<Record<string, boolean>>({});
  const { camera } = useThree();

  // Track key state on window so we can poll inside useFrame.
  useEffect(() => {
    function down(e: KeyboardEvent) {
      keys.current[e.code] = true;
      // Esc exits pointer-lock automatically; we also notify the host
      // so we can show the overlay again.
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

  // Per-frame integration. We resolve the visitor's intent in the
  // camera's local frame, project to horizontal so they don't fly, and
  // clamp y to EYE_HEIGHT (no jumping, no falling).
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

/* ─── Entry overlay (pre-pointer-lock) ───────────────────────────────────── */

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

/* ─── Footer ─────────────────────────────────────────────────────────────── */

function FooterLine() {
  return (
    <div className="pointer-events-none absolute bottom-4 left-0 right-0 flex justify-between items-center px-6 text-[9.5px] font-sans uppercase tracking-[0.26em] text-mna-white/40">
      <span>The Observer is Human. We Observe. We Do Not Interfere.</span>
      <span>Museum of Nonhuman Art</span>
    </div>
  );
}
