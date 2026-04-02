"use client";

import { useState, useRef, useCallback } from "react";
import type { Work } from "@/lib/collection";
import { parseWorkColors, detectSvgBackground, isLightColor } from "@/lib/work-colors";
import * as THREE from "three";

// ─── Share color detection ────────────────────────────────────────────────────

function getShareColors(work: Work): { bg: string; fg: string } {
  if (work.output_type === "text" || work.output_type === "ascii") {
    const colors = parseWorkColors(work.output_payload, work.output_type);
    return { bg: colors.bg, fg: colors.fg };
  }
  if (work.output_type === "svg") {
    const svgBg = detectSvgBackground(work.output_payload);
    if (svgBg) {
      return { bg: svgBg, fg: isLightColor(svgBg) ? "#1a1a1a" : "#e8e4de" };
    }
  }
  return { bg: "#0a0908", fg: "#e8e4de" };
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

// ─── 3D Scene setup (shared between snapshot and GIF) ─────────────────────────

interface SceneSetup {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  center: THREE.Vector3;
  radius: number;
  baseY: number;
  initialAngle: number;
}

function parseSceneJson(json: string): Record<string, unknown> | null {
  try {
    return JSON.parse(json);
  } catch {
    try {
      const text = json.trim();
      const last = text.lastIndexOf("}");
      if (last <= 0) return null;
      let attempt = text.substring(0, last + 1);
      const ob = (attempt.match(/\[/g) || []).length - (attempt.match(/\]/g) || []).length;
      const oc = (attempt.match(/\{/g) || []).length - (attempt.match(/\}/g) || []).length;
      attempt += "]".repeat(Math.max(0, ob)) + "}".repeat(Math.max(0, oc));
      return JSON.parse(attempt);
    } catch {
      return null;
    }
  }
}

function createGeometry(shape: string): THREE.BufferGeometry {
  switch (shape) {
    case "sphere": return new THREE.SphereGeometry(0.5, 32, 32);
    case "cylinder": return new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
    case "cone": return new THREE.ConeGeometry(0.5, 1, 32);
    case "torus": return new THREE.TorusGeometry(0.5, 0.15, 16, 48);
    case "plane": return new THREE.PlaneGeometry(1, 1);
    default: return new THREE.BoxGeometry(1, 1, 1);
  }
}

function buildScene(sceneData: Record<string, unknown>, width: number, height: number): SceneSetup | null {
  const objects = sceneData.objects as Array<Record<string, unknown>> | undefined;
  if (!objects || objects.length === 0) return null;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color((sceneData.bg as string) || "#0a0a0a");

  // Ensure decent lighting for share images — boost if Originator's lighting is too dim
  const lights = sceneData.lights as Array<Record<string, unknown>> | undefined;
  if (lights && lights.length > 0) {
    for (const light of lights) {
      const color = new THREE.Color((light.color as string) || "#ffffff");
      const intensity = Math.max((light.intensity as number) ?? 0.5, 0.4);
      if (light.type === "ambient") {
        scene.add(new THREE.AmbientLight(color, intensity));
      } else if (light.type === "directional") {
        const dl = new THREE.DirectionalLight(color, intensity);
        const pos = (light.position as number[]) || [5, 10, 5];
        dl.position.set(pos[0], pos[1], pos[2]);
        scene.add(dl);
      }
    }
  } else {
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8);
    dl.position.set(5, 10, 5);
    scene.add(dl);
  }
  // Always add a fill light so nothing is invisible
  const fill = new THREE.DirectionalLight(0xffffff, 0.3);
  fill.position.set(-3, 5, -3);
  scene.add(fill);

  // Objects
  const box = new THREE.Box3();
  for (const obj of objects) {
    const geometry = createGeometry(obj.shape as string || "box");
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color((obj.color as string) || "#888888"),
      metalness: (obj.metalness as number) ?? 0.1,
      roughness: (obj.roughness as number) ?? 0.6,
    });
    const mesh = new THREE.Mesh(geometry, material);
    const pos = obj.position as number[] | undefined;
    const rot = obj.rotation as number[] | undefined;
    const scl = obj.scale as number[] | undefined;
    if (pos) mesh.position.set(pos[0], pos[1], pos[2]);
    if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
    if (scl) mesh.scale.set(scl[0], scl[1], scl[2]);
    scene.add(mesh);
    box.expandByObject(mesh);
  }

  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = box.getSize(new THREE.Vector3()).length();
  const dist = size * 1.6;

  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
  camera.position.set(center.x + dist * 0.6, center.y + dist * 0.3, center.z + dist * 0.8);
  camera.lookAt(center);

  const radius = Math.sqrt(
    (camera.position.x - center.x) ** 2 + (camera.position.z - center.z) ** 2
  );
  const initialAngle = Math.atan2(
    camera.position.z - center.z,
    camera.position.x - center.x
  );

  return { scene, camera, center, radius, baseY: camera.position.y, initialAngle };
}

// ─── Attribution drawing (shared) ─────────────────────────────────────────────

function drawAttribution(
  ctx: CanvasRenderingContext2D,
  work: Work,
  logical: number,
  pad: number,
  mutedColor: string
) {
  const attrY = logical - pad;
  ctx.fillStyle = mutedColor;
  ctx.globalAlpha = 0.85;
  ctx.font = "600 28px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(work.id, pad, attrY - 36);
  ctx.font = "22px sans-serif";
  ctx.fillText(`Phase ${work.phase_at_submission || "I"}, ${work.medium}`, pad, attrY - 6);
  ctx.font = "20px sans-serif";
  ctx.globalAlpha = 0.55;
  ctx.fillText(work.originator_id, pad, attrY + 22);
  ctx.globalAlpha = 0.85;
  ctx.textAlign = "right";
  ctx.font = "600 24px sans-serif";
  ctx.fillText("MUSEUM OF NONHUMAN ART", logical - pad, attrY - 28);
  ctx.font = "20px sans-serif";
  ctx.globalAlpha = 0.55;
  ctx.fillText("mnamuseum.org", logical - pad, attrY + 2);
  ctx.globalAlpha = 1;
}

// ─── Animated GIF generation for 3D works ─────────────────────────────────────

async function generateSceneGif(work: Work): Promise<File | null> {
  const sceneData = parseSceneJson(work.output_payload);
  if (!sceneData) return null;

  const gifSize = 540; // GIF resolution
  const setup = buildScene(sceneData, gifSize, gifSize);
  if (!setup) return null;

  // Create a visible but off-screen renderer (WebGL needs this on some browsers)
  const rendererCanvas = document.createElement("canvas");
  rendererCanvas.width = gifSize;
  rendererCanvas.height = gifSize;
  rendererCanvas.style.position = "fixed";
  rendererCanvas.style.left = "-9999px";
  rendererCanvas.style.top = "-9999px";
  document.body.appendChild(rendererCanvas);

  const renderer = new THREE.WebGLRenderer({
    canvas: rendererCanvas,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(gifSize, gifSize);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  // Composite canvas for adding attribution
  const compositeCanvas = document.createElement("canvas");
  compositeCanvas.width = gifSize;
  compositeCanvas.height = gifSize;
  const compositeCtx = compositeCanvas.getContext("2d");
  if (!compositeCtx) {
    renderer.dispose();
    document.body.removeChild(rendererCanvas);
    return null;
  }

  // Load gif.js dynamically
  const GIF = (await import("gif.js")).default;
  const gif = new GIF({
    workers: 2,
    quality: 10,
    width: gifSize,
    height: gifSize,
    workerScript: "/gif.worker.js",
  });

  // Capture frames — full rotation in 3 seconds at 15fps = 45 frames
  const totalFrames = 45;
  const angleStep = (Math.PI * 2) / totalFrames;
  const pad = 40;
  const shareColors = getShareColors(work);
  const mutedColor = isLightColor(shareColors.bg) ? "#6a6560" : "#8a8680";

  for (let i = 0; i < totalFrames; i++) {
    const angle = setup.initialAngle + i * angleStep;
    setup.camera.position.x = setup.center.x + Math.sin(angle) * setup.radius;
    setup.camera.position.z = setup.center.z + Math.cos(angle) * setup.radius;
    setup.camera.position.y = setup.baseY;
    setup.camera.lookAt(setup.center);

    renderer.render(setup.scene, setup.camera);

    // Composite: 3D render + attribution
    compositeCtx.drawImage(rendererCanvas, 0, 0);
    drawAttribution(compositeCtx, work, gifSize, pad, mutedColor);

    gif.addFrame(compositeCtx, { copy: true, delay: 67 }); // ~15fps
  }

  // Encode
  const blob = await new Promise<Blob>((resolve, reject) => {
    gif.on("finished", (blob: Blob) => resolve(blob));
    gif.on("error", (err: Error) => reject(err));
    gif.render();
  });

  // Cleanup
  renderer.dispose();
  document.body.removeChild(rendererCanvas);

  return new File([blob], `${work.id}.gif`, { type: "image/gif" });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ShareButtonsProps {
  work: Work;
}

export default function ShareButtons({ work }: ShareButtonsProps) {
  const [generating, setGenerating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const workUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/work/${work.id}`
      : `https://mnamuseum.org/work/${work.id}`;

  const is3D = work.output_type === "scene-json";

  /** Generate static share image (PNG) for non-3D works */
  const generateShareImage = useCallback(async (): Promise<File | null> => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const logical = 1080;
    const scale = 2;
    const size = logical * scale;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.scale(scale, scale);

    const shareColors = getShareColors(work);
    const bg = shareColors.bg;
    const textColor = shareColors.fg;
    const mutedColor = isLightColor(bg) ? "#6a6560" : "#8a8680";

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, logical, logical);

    const pad = 160;
    const workAreaW = logical - pad * 2;
    const workAreaH = logical - pad * 2 - 120;

    if (work.output_type === "text" || work.output_type === "ascii") {
      const colors = parseWorkColors(work.output_payload, work.output_type);
      ctx.fillStyle = colors.fg;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const lines = colors.payload.trim().split("\n");
      const maxLineLen = Math.max(...lines.map((l) => l.length));
      const fontSize = Math.min(
        Math.round(workAreaW / (maxLineLen * 0.62)),
        Math.round(workAreaH / (lines.length * 1.6)),
        64
      );
      ctx.font = `${fontSize}px monospace`;

      const lineHeight = fontSize * 1.5;
      const totalHeight = lines.length * lineHeight;
      const startY = pad + (workAreaH - totalHeight) / 2 + lineHeight / 2;

      lines.forEach((line, i) => {
        ctx.fillText(line, logical / 2, startY + i * lineHeight);
      });
    } else if (work.output_type === "svg") {
      try {
        const svgBlob = new Blob([work.output_payload], { type: "image/svg+xml" });
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = url;
        });

        const imgScale = Math.min(workAreaW / img.width, workAreaH / img.height);
        const drawW = img.width * imgScale;
        const drawH = img.height * imgScale;
        const drawX = pad + (workAreaW - drawW) / 2;
        const drawY = pad + (workAreaH - drawH) / 2;

        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        URL.revokeObjectURL(url);
      } catch {
        ctx.fillStyle = textColor;
        ctx.font = "32px monospace";
        ctx.textAlign = "center";
        ctx.fillText(work.id, logical / 2, logical / 2);
      }
    } else {
      ctx.fillStyle = textColor;
      ctx.font = "32px monospace";
      ctx.textAlign = "center";
      ctx.fillText(work.id, logical / 2, logical / 2);
    }

    drawAttribution(ctx, work, logical, pad, mutedColor);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) { resolve(null); return; }
        resolve(new File([blob], `${work.id}.png`, { type: "image/png" }));
      }, "image/png");
    });
  }, [work]);

  /** Generate the appropriate share file — GIF for 3D, PNG for everything else */
  const generateShareFile = useCallback(async (): Promise<File | null> => {
    if (is3D) {
      return generateSceneGif(work);
    }
    return generateShareImage();
  }, [is3D, work, generateShareImage]);

  const handleShare = async () => {
    setGenerating(true);
    try {
      const file = await generateShareFile();
      if (!file) { setGenerating(false); return; }

      const phase = work.phase_at_submission || "I";
      const shareText = `${work.id} — Phase ${phase}, ${work.medium} — Museum of Nonhuman Art`;

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `${work.id} — Museum of Nonhuman Art`,
          text: shareText,
          url: workUrl,
          files: [file],
        });
      } else {
        downloadFile(file);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") {
        const file = await generateShareFile();
        if (file) downloadFile(file);
      }
    }
    setGenerating(false);
  };

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const file = await generateShareFile();
      if (file) downloadFile(file);
    } catch {
      // Silent fail
    }
    setGenerating(false);
  };

  function downloadFile(file: File) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="relative">
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={handleShare}
          disabled={generating}
          className="flex items-center gap-1.5 text-[11px] text-muted/60 hover:text-foreground transition-colors duration-200 uppercase tracking-[0.12em] disabled:opacity-30"
          aria-label="Share this work"
          title="Share this work"
        >
          <ShareIcon />
          <span>{generating ? "Generating..." : "Share"}</span>
        </button>
        <span className="text-muted/20">|</span>
        <button
          onClick={handleDownload}
          disabled={generating}
          className="flex items-center gap-1.5 text-[11px] text-muted/60 hover:text-foreground transition-colors duration-200 uppercase tracking-[0.12em] disabled:opacity-30"
          aria-label={`Download share ${is3D ? "animation" : "image"}`}
          title={`Download share ${is3D ? "animation" : "image"}`}
        >
          <DownloadIcon />
          <span>{is3D ? "GIF" : "Image"}</span>
        </button>
      </div>

      {/* Off-screen canvas for static image generation */}
      <canvas ref={canvasRef} className="fixed -left-[9999px] -top-[9999px] pointer-events-none" aria-hidden="true" />
    </div>
  );
}
