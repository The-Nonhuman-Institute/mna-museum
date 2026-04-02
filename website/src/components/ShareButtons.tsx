"use client";

import { useState, useRef, useCallback } from "react";
import type { Work } from "@/lib/collection";
import { parseWorkColors, detectSvgBackground, isLightColor } from "@/lib/work-colors";
import * as THREE from "three";

/**
 * Adaptive share image background:
 * Uses the Originator's own color choices when available.
 * Falls back to contrast-based logic when no colors are specified.
 */
function getShareColors(work: Work): { bg: string; fg: string } {
  // Text/ASCII works: use Originator-defined colors if present
  if (work.output_type === "text" || work.output_type === "ascii") {
    const colors = parseWorkColors(work.output_payload, work.output_type);
    return { bg: colors.bg, fg: colors.fg };
  }

  // SVG works: detect background from the SVG itself
  if (work.output_type === "svg") {
    const svgBg = detectSvgBackground(work.output_payload);
    if (svgBg) {
      return {
        bg: svgBg,
        fg: isLightColor(svgBg) ? "#1a1a1a" : "#e8e4de",
      };
    }
  }

  // Default: dark background, light text
  return { bg: "#0a0908", fg: "#e8e4de" };
}

/** Small share icon — an arrow leaving a box */
function ShareIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

/** Download icon */
function DownloadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

/** Render a 3D scene to an offscreen canvas for share image capture */
function renderSceneSnapshot(json: string, width: number, height: number): HTMLCanvasElement | null {
  let sceneData;
  try {
    sceneData = JSON.parse(json);
  } catch {
    return null;
  }
  if (!sceneData.objects || sceneData.objects.length === 0) return null;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(sceneData.bg || "#0a0a0a");

  // Lights
  if (sceneData.lights) {
    for (const light of sceneData.lights) {
      const color = new THREE.Color(light.color || "#ffffff");
      const intensity = light.intensity ?? 0.5;
      if (light.type === "ambient") {
        scene.add(new THREE.AmbientLight(color, intensity));
      } else if (light.type === "directional") {
        const dl = new THREE.DirectionalLight(color, intensity);
        const pos = light.position || [5, 10, 5];
        dl.position.set(pos[0], pos[1], pos[2]);
        scene.add(dl);
      }
    }
  } else {
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8);
    dl.position.set(5, 10, 5);
    scene.add(dl);
  }

  // Objects
  const box = new THREE.Box3();
  for (const obj of sceneData.objects) {
    const shapes: Record<string, () => THREE.BufferGeometry> = {
      box: () => new THREE.BoxGeometry(1, 1, 1),
      sphere: () => new THREE.SphereGeometry(0.5, 32, 32),
      cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
      cone: () => new THREE.ConeGeometry(0.5, 1, 32),
      torus: () => new THREE.TorusGeometry(0.5, 0.15, 16, 48),
      plane: () => new THREE.PlaneGeometry(1, 1),
    };
    const geometry = (shapes[obj.shape] || shapes.box)();
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(obj.color || "#888888"),
      metalness: obj.metalness ?? 0.1,
      roughness: obj.roughness ?? 0.6,
    });
    const mesh = new THREE.Mesh(geometry, material);
    if (obj.position) mesh.position.set(obj.position[0], obj.position[1], obj.position[2]);
    if (obj.rotation) mesh.rotation.set(obj.rotation[0], obj.rotation[1], obj.rotation[2]);
    if (obj.scale) mesh.scale.set(obj.scale[0], obj.scale[1], obj.scale[2]);
    scene.add(mesh);
    box.expandByObject(mesh);
  }

  // Camera framing
  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = box.getSize(new THREE.Vector3()).length();
  const dist = size * 1.4;

  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
  camera.position.set(center.x + dist * 0.6, center.y + dist * 0.3, center.z + dist * 0.8);
  camera.lookAt(center);

  // Render
  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  const renderer = new THREE.WebGLRenderer({ canvas: offscreen, antialias: true });
  renderer.setSize(width, height);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.render(scene, camera);
  renderer.dispose();

  return offscreen;
}

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

  /**
   * Generate the share image as a File object ready for Web Share API.
   * 1080x1080 square — works well on Instagram, X, and Bluesky feeds.
   */
  const generateShareImage = useCallback(async (): Promise<File | null> => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    // Render at 2x for crisp text on Retina/high-DPI displays and social platforms
    const logical = 1080;
    const scale = 2;
    const size = logical * scale;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Scale all drawing operations to 2x — coordinates stay in logical 1080 space
    ctx.scale(scale, scale);

    const shareColors = getShareColors(work);
    const bg = shareColors.bg;
    const textColor = shareColors.fg;
    const mutedColor = isLightColor(bg) ? "#6a6560" : "#8a8680";

    // Fill background
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, logical, logical);

    // Layout: extra generous padding for social platform safe zones
    const pad = 160; // ~15% padding — well within safe zone on all platforms
    const workAreaW = logical - pad * 2;
    const workAreaH = logical - pad * 2 - 120; // reserve space for attribution strip

    // --- Render the work ---
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
        const svgBlob = new Blob([work.output_payload], {
          type: "image/svg+xml",
        });
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
    } else if (work.output_type === "scene-json") {
      try {
        const snapshot = renderSceneSnapshot(work.output_payload, workAreaW * scale, workAreaH * scale);
        if (snapshot) {
          const drawX = pad;
          const drawY = pad;
          // Draw at 1:1 since snapshot is already at render scale
          ctx.save();
          ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset to pixel space
          ctx.drawImage(snapshot, drawX * scale, drawY * scale, workAreaW * scale, workAreaH * scale);
          ctx.restore();
          snapshot.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext();
        }
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

    // --- Attribution strip at bottom ---
    // Sized to be legible at Instagram grid thumbnail (~300px rendered)
    const attrY = logical - pad;

    // Work ID + Phase + Medium — left aligned
    ctx.fillStyle = mutedColor;
    ctx.globalAlpha = 0.85;
    ctx.font = "600 28px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${work.id}`, pad, attrY - 36);
    ctx.font = "22px sans-serif";
    const phase = work.phase_at_submission || "I";
    ctx.fillText(`Phase ${phase}, ${work.medium}`, pad, attrY - 6);
    ctx.font = "20px sans-serif";
    ctx.globalAlpha = 0.55;
    ctx.fillText(`${work.originator_id}`, pad, attrY + 22);
    ctx.globalAlpha = 0.85;

    // MNA — right aligned
    ctx.textAlign = "right";
    ctx.font = "600 24px sans-serif";
    ctx.fillText("MUSEUM OF NONHUMAN ART", logical - pad, attrY - 28);
    ctx.font = "20px sans-serif";
    ctx.globalAlpha = 0.55;
    ctx.fillText("mnamuseum.org", logical - pad, attrY + 2);
    ctx.globalAlpha = 1;

    // Convert to File (not just Blob — Web Share API needs a File)
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        const file = new File([blob], `${work.id}.png`, { type: "image/png" });
        resolve(file);
      }, "image/png");
    });
  }, [work]);

  /**
   * Primary action: native share sheet with the generated image.
   * This is how you actually share an image to Instagram, X, Bluesky, etc.
   * The OS share sheet lets the user pick any installed app.
   */
  const handleShare = async () => {
    setGenerating(true);
    try {
      const file = await generateShareImage();
      if (!file) {
        setGenerating(false);
        return;
      }

      // Check if Web Share API supports file sharing
      const phase = work.phase_at_submission || "I";
      const shareText = `${work.id} — Phase ${phase}, ${work.medium} — Museum of Nonhuman Art`;

      if (
        navigator.share &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          title: `${work.id} — Museum of Nonhuman Art`,
          text: shareText,
          url: workUrl,
          files: [file],
        });
      } else {
        // Fallback: download the image directly
        downloadFile(file);
      }
    } catch (e: unknown) {
      // User cancelled the share sheet — that's fine, not an error
      if (e instanceof Error && e.name !== "AbortError") {
        // Actual error — fall back to download
        const file = await generateShareImage();
        if (file) downloadFile(file);
      }
    }
    setGenerating(false);
  };

  /**
   * Secondary action: download the share image directly.
   * For desktop users who want to drag the image into a compose window.
   */
  const handleDownload = async () => {
    setGenerating(true);
    try {
      const file = await generateShareImage();
      if (file) downloadFile(file);
    } catch {
      // Silent fail
    }
    setGenerating(false);
  };

  /** Trigger a file download in the browser */
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
          <span>Share</span>
        </button>
        <span className="text-muted/20">|</span>
        <button
          onClick={handleDownload}
          disabled={generating}
          className="flex items-center gap-1.5 text-[11px] text-muted/60 hover:text-foreground transition-colors duration-200 uppercase tracking-[0.12em] disabled:opacity-30"
          aria-label="Download share image"
          title="Download share image"
        >
          <DownloadIcon />
          <span>Image</span>
        </button>
      </div>

      {/* Off-screen canvas for image generation — display:none can break toBlob in some browsers */}
      <canvas ref={canvasRef} className="fixed -left-[9999px] -top-[9999px] pointer-events-none" aria-hidden="true" />
    </div>
  );
}
