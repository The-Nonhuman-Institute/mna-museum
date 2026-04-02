/**
 * MNA Share Engine
 *
 * Unified share file generation for all work types.
 * Every share output is 1080x1080 at 2x resolution.
 * Attribution strip is pre-rendered once and composited.
 *
 * Medium → Format:
 *   text, ascii, svg, canvas-json  → PNG (static)
 *   html-css                       → PNG (static capture)
 *   scene-json                     → GIF (animated rotation)
 *   audio-json                     → audio .wav + waveform PNG
 */

import type { Work } from "./collection";
import { parseWorkColors, detectSvgBackground } from "./work-colors";
import * as THREE from "three";

// ─── Constants ────────────────────────────────────────────────────────────────

const LOGICAL = 1080;
const SCALE = 2;
const SIZE = LOGICAL * SCALE;
const PAD = 120;
const ATTR_HEIGHT = 160; // Tall enough to sit above Instagram/Stories safe zone
const WORK_AREA_W = LOGICAL - PAD * 2;
const WORK_AREA_H = LOGICAL - PAD * 2 - ATTR_HEIGHT;

// ─── Contrast-aware background ────────────────────────────────────────────────

const MNA_CREAM = "#f5f2ed";
const MNA_DARK = "#0a0908";

function hexLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  let r: number, g: number, b: number;
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16);
    g = parseInt(clean[1] + clean[1], 16);
    b = parseInt(clean[2] + clean[2], 16);
  } else {
    r = parseInt(clean.substring(0, 2), 16);
    g = parseInt(clean.substring(2, 4), 16);
    b = parseInt(clean.substring(4, 6), 16);
  }
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Determine the share image background/foreground based on the work's colors.
 * Dark works get light backgrounds and vice versa — ensures visibility.
 */
export function getContrastColors(work: Work): { bg: string; fg: string; muted: string } {
  let workBg = MNA_DARK;

  if (work.output_type === "text" || work.output_type === "ascii") {
    const colors = parseWorkColors(work.output_payload, work.output_type);
    workBg = colors.bg;
  } else if (work.output_type === "svg") {
    workBg = detectSvgBackground(work.output_payload) || MNA_DARK;
  } else if (work.output_type === "canvas-json") {
    try {
      const ops = JSON.parse(work.output_payload);
      if (Array.isArray(ops)) {
        const bgOp = ops.find((o: { op: string }) => o.op === "bg");
        if (bgOp) workBg = bgOp.color || MNA_DARK;
      }
    } catch {}
  } else if (work.output_type === "scene-json") {
    try {
      const scene = JSON.parse(work.output_payload);
      // For 3D, analyze object colors instead of bg
      if (scene.objects && scene.objects.length > 0) {
        const avgLum = scene.objects.reduce((sum: number, o: { color?: string }) => {
          return sum + hexLuminance(o.color || "#888888");
        }, 0) / scene.objects.length;
        // If objects are dark, use light bg
        if (avgLum < 0.3) return { bg: MNA_CREAM, fg: "#1a1a1a", muted: "#6a6560" };
        return { bg: MNA_DARK, fg: "#e8e4de", muted: "#8a8680" };
      }
    } catch {}
  }

  const lum = hexLuminance(workBg);
  if (lum < 0.15) {
    // Very dark work → light share bg
    return { bg: MNA_CREAM, fg: "#1a1a1a", muted: "#6a6560" };
  }
  if (lum > 0.85) {
    // Very light work → dark share bg
    return { bg: MNA_DARK, fg: "#e8e4de", muted: "#8a8680" };
  }
  // Mid-range → dark default
  return { bg: MNA_DARK, fg: "#e8e4de", muted: "#8a8680" };
}

// ─── Attribution strip (pre-rendered once) ────────────────────────────────────

function renderAttributionStrip(
  work: Work,
  colors: { fg: string; muted: string }
): HTMLCanvasElement {
  const strip = document.createElement("canvas");
  strip.width = SIZE;
  strip.height = ATTR_HEIGHT * SCALE;
  const ctx = strip.getContext("2d")!;
  ctx.scale(SCALE, SCALE);

  // Text starts 20px from top of strip — strip itself is positioned
  // high enough to clear Instagram/Stories bottom safe zone
  const y = 24;

  // Left: Work ID, Phase, Medium, Originator
  ctx.fillStyle = colors.muted;
  ctx.globalAlpha = 0.9;
  ctx.font = "600 24px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(work.id, PAD, y);
  ctx.font = "18px sans-serif";
  ctx.fillText(`Phase ${work.phase_at_submission || "I"}, ${work.medium}`, PAD, y + 28);
  ctx.font = "16px sans-serif";
  ctx.globalAlpha = 0.6;
  ctx.fillText(work.originator_id, PAD, y + 52);

  // Right: MNA branding
  ctx.globalAlpha = 0.9;
  ctx.textAlign = "right";
  ctx.font = "600 20px sans-serif";
  ctx.fillText("MUSEUM OF NONHUMAN ART", LOGICAL - PAD, y + 4);
  ctx.font = "16px sans-serif";
  ctx.globalAlpha = 0.6;
  ctx.fillText("mnamuseum.org", LOGICAL - PAD, y + 30);
  ctx.globalAlpha = 1;

  return strip;
}

// ─── Per-medium renderers ─────────────────────────────────────────────────────

function renderTextWork(
  ctx: CanvasRenderingContext2D,
  work: Work,
  shareColors: { bg: string }
) {
  const colors = parseWorkColors(work.output_payload, work.output_type);
  // Use Originator's text color, but on the contrast-aware share bg
  const textColor = shareColors.bg === MNA_CREAM ? "#1a1a1a" : colors.fg;

  ctx.fillStyle = textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lines = colors.payload.trim().split("\n");
  const maxLineLen = Math.max(...lines.map((l) => l.length));
  const fontSize = Math.min(
    Math.round(WORK_AREA_W / (maxLineLen * 0.62)),
    Math.round(WORK_AREA_H / (lines.length * 1.6)),
    64
  );
  ctx.font = `${fontSize}px monospace`;

  const lineHeight = fontSize * 1.5;
  const totalHeight = lines.length * lineHeight;
  const startY = PAD + (WORK_AREA_H - totalHeight) / 2 + lineHeight / 2;

  lines.forEach((line, i) => {
    ctx.fillText(line, LOGICAL / 2, startY + i * lineHeight);
  });
}

async function renderSvgWork(
  ctx: CanvasRenderingContext2D,
  work: Work
) {
  const svgBlob = new Blob([work.output_payload], { type: "image/svg+xml" });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });

  const imgScale = Math.min(WORK_AREA_W / img.width, WORK_AREA_H / img.height);
  const drawW = img.width * imgScale;
  const drawH = img.height * imgScale;
  const drawX = PAD + (WORK_AREA_W - drawW) / 2;
  const drawY = PAD + (WORK_AREA_H - drawH) / 2;

  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  URL.revokeObjectURL(url);
}

function renderCanvasWork(
  ctx: CanvasRenderingContext2D,
  work: Work,
  shareColors: { bg: string }
) {
  let ops: Array<Record<string, unknown>>;
  try {
    ops = JSON.parse(work.output_payload);
    if (!Array.isArray(ops)) return;
  } catch {
    // Try salvage
    try {
      const text = work.output_payload;
      const last = text.lastIndexOf("}");
      if (last <= 0) return;
      let attempt = text.substring(0, last + 1);
      const ob = (attempt.match(/\[/g) || []).length - (attempt.match(/\]/g) || []).length;
      attempt += "]".repeat(Math.max(0, ob));
      ops = JSON.parse(attempt);
      if (!Array.isArray(ops)) return;
    } catch { return; }
  }

  // Render canvas ops into the work area
  const workCanvas = document.createElement("canvas");
  workCanvas.width = 800;
  workCanvas.height = 800;
  const wCtx = workCanvas.getContext("2d")!;

  // Default bg
  wCtx.fillStyle = shareColors.bg === MNA_CREAM ? "#f0ede8" : "#0e0c0a";
  wCtx.fillRect(0, 0, 800, 800);

  for (const op of ops) {
    switch (op.op) {
      case "bg":
        wCtx.fillStyle = (op.color as string) || "#0e0c0a";
        wCtx.fillRect(0, 0, 800, 800);
        break;
      case "fill":
        wCtx.fillStyle = (op.color as string) || "#fff";
        break;
      case "stroke":
        wCtx.strokeStyle = (op.color as string) || "#fff";
        break;
      case "rect":
        wCtx.fillRect(
          (op.x as number) || 0, (op.y as number) || 0,
          (op.w as number) || 100, (op.h as number) || 100
        );
        break;
      case "circle":
        wCtx.beginPath();
        wCtx.arc((op.x as number) || 0, (op.y as number) || 0, (op.r as number) || 50, 0, Math.PI * 2);
        wCtx.fill();
        break;
      case "line":
        wCtx.beginPath();
        wCtx.lineWidth = (op.width as number) || 1;
        if (op.color) wCtx.strokeStyle = op.color as string;
        wCtx.moveTo((op.x1 as number) || 0, (op.y1 as number) || 0);
        wCtx.lineTo((op.x2 as number) || 0, (op.y2 as number) || 0);
        wCtx.stroke();
        break;
    }
  }

  // Draw onto share canvas, fitted to work area
  const scale = Math.min(WORK_AREA_W / 800, WORK_AREA_H / 800);
  const drawW = 800 * scale;
  const drawH = 800 * scale;
  const drawX = PAD + (WORK_AREA_W - drawW) / 2;
  const drawY = PAD + (WORK_AREA_H - drawH) / 2;
  ctx.drawImage(workCanvas, drawX, drawY, drawW, drawH);
}

// ─── 3D Scene GIF ─────────────────────────────────────────────────────────────

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
    } catch { return null; }
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

export async function generateSceneVideo(
  work: Work,
  shareColors: { bg: string; muted: string },
  attrStrip: HTMLCanvasElement
): Promise<File | null> {
  const sceneData = parseSceneJson(work.output_payload);
  if (!sceneData) return null;
  const objects = sceneData.objects as Array<Record<string, unknown>> | undefined;
  if (!objects || objects.length === 0) return null;

  const videoSize = LOGICAL;
  const sceneH = videoSize - ATTR_HEIGHT;

  const threeScene = new THREE.Scene();
  threeScene.background = new THREE.Color(shareColors.bg);

  // Lighting — always visible
  threeScene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dl = new THREE.DirectionalLight(0xffffff, 0.8);
  dl.position.set(5, 10, 5);
  threeScene.add(dl);
  const fill = new THREE.DirectionalLight(0xffffff, 0.3);
  fill.position.set(-3, 5, -3);
  threeScene.add(fill);

  const lights = sceneData.lights as Array<Record<string, unknown>> | undefined;
  if (lights) {
    for (const light of lights) {
      const color = new THREE.Color((light.color as string) || "#ffffff");
      const intensity = Math.max((light.intensity as number) ?? 0.5, 0.3);
      if (light.type === "directional") {
        const extra = new THREE.DirectionalLight(color, intensity);
        const pos = (light.position as number[]) || [0, 5, 0];
        extra.position.set(pos[0], pos[1], pos[2]);
        threeScene.add(extra);
      }
    }
  }

  const box = new THREE.Box3();
  for (const obj of objects) {
    const geometry = createGeometry((obj.shape as string) || "box");
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
    threeScene.add(mesh);
    box.expandByObject(mesh);
  }

  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = box.getSize(new THREE.Vector3()).length();
  const dist = size * 1.6;

  const camera = new THREE.PerspectiveCamera(50, videoSize / sceneH, 0.1, 100);
  camera.position.set(center.x + dist * 0.6, center.y + dist * 0.3, center.z + dist * 0.8);
  camera.lookAt(center);

  const radius = Math.sqrt(
    (camera.position.x - center.x) ** 2 + (camera.position.z - center.z) ** 2
  );
  const initialAngle = Math.atan2(
    camera.position.z - center.z,
    camera.position.x - center.x
  );
  const baseY = camera.position.y;

  // 3D renderer — DOM-attached for mobile compatibility
  const rendererCanvas = document.createElement("canvas");
  rendererCanvas.width = videoSize;
  rendererCanvas.height = sceneH;
  rendererCanvas.style.cssText = "position:fixed;left:-9999px;top:-9999px";
  document.body.appendChild(rendererCanvas);

  const renderer = new THREE.WebGLRenderer({
    canvas: rendererCanvas,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(videoSize, sceneH);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  // Composite canvas — this is what gets recorded as video
  const composite = document.createElement("canvas");
  composite.width = videoSize;
  composite.height = videoSize;
  composite.style.cssText = "position:fixed;left:-9999px;top:-9999px";
  document.body.appendChild(composite);
  const cCtx = composite.getContext("2d")!;

  // Set up MediaRecorder to capture the composite canvas
  const stream = composite.captureStream(30);
  const mimeType = MediaRecorder.isTypeSupported("video/mp4")
    ? "video/mp4"
    : MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 4_000_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  // Record one full rotation (3 seconds at 30fps = 90 frames)
  const durationMs = 3000;
  const fps = 30;
  const totalFrames = Math.round(durationMs / 1000 * fps);
  const angleStep = (Math.PI * 2) / totalFrames;

  recorder.start();

  // Render frames using requestAnimationFrame for proper timing
  let frame = 0;
  await new Promise<void>((resolve) => {
    function renderFrame() {
      if (frame >= totalFrames) {
        recorder.stop();
        resolve();
        return;
      }

      const angle = initialAngle + frame * angleStep;
      camera.position.x = center.x + Math.sin(angle) * radius;
      camera.position.z = center.z + Math.cos(angle) * radius;
      camera.position.y = baseY;
      camera.lookAt(center);

      renderer.render(threeScene, camera);

      // Composite: bg + 3D + attribution
      cCtx.fillStyle = shareColors.bg;
      cCtx.fillRect(0, 0, videoSize, videoSize);
      cCtx.drawImage(rendererCanvas, 0, 0, videoSize, sceneH);
      // Draw attribution strip (rendered at 2x) scaled down to 1x
      cCtx.drawImage(attrStrip, 0, 0, attrStrip.width, attrStrip.height,
        0, videoSize - ATTR_HEIGHT, videoSize, ATTR_HEIGHT);

      frame++;
      requestAnimationFrame(renderFrame);
    }
    requestAnimationFrame(renderFrame);
  });

  // Wait for recorder to finalize
  const blob = await new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType }));
    };
  });

  // Cleanup
  renderer.dispose();
  document.body.removeChild(rendererCanvas);
  document.body.removeChild(composite);

  const ext = mimeType.includes("mp4") ? "mp4" : "webm";
  return new File([blob], `${work.id}.${ext}`, { type: mimeType });
}

// ─── Audio rendering ──────────────────────────────────────────────────────────

export async function generateAudioFile(work: Work): Promise<File | null> {
  let data;
  try {
    data = JSON.parse(work.output_payload);
  } catch {
    // Salvage truncated
    try {
      const text = work.output_payload;
      for (let i = text.length; i > 0; i--) {
        const candidate = text.substring(0, i);
        if (!candidate.endsWith("}")) continue;
        const ob = (candidate.match(/\[/g) || []).length - (candidate.match(/\]/g) || []).length;
        const oc = (candidate.match(/\{/g) || []).length - (candidate.match(/\}/g) || []).length;
        const closed = candidate + "]".repeat(Math.max(0, ob)) + "}".repeat(Math.max(0, oc));
        try {
          const parsed = JSON.parse(closed);
          if (parsed.voices && parsed.duration) { data = parsed; break; }
        } catch { continue; }
      }
    } catch {}
  }
  if (!data || !data.voices || !data.duration) return null;

  // Render audio offline
  const sampleRate = 44100;
  const length = Math.ceil(data.duration * sampleRate);
  const offlineCtx = new OfflineAudioContext(1, length, sampleRate);

  for (const voice of data.voices) {
    for (const note of voice.notes) {
      const osc = offlineCtx.createOscillator();
      const gain = offlineCtx.createGain();
      osc.type = voice.type;
      osc.frequency.value = note.freq;
      gain.gain.value = note.gain;
      osc.connect(gain);
      gain.connect(offlineCtx.destination);
      osc.start(note.start);
      osc.stop(note.start + note.duration);
    }
  }

  const buffer = await offlineCtx.startRendering();

  // Encode as WAV
  const numChannels = buffer.numberOfChannels;
  const samples = buffer.length;
  const wavBuffer = new ArrayBuffer(44 + samples * numChannels * 2);
  const view = new DataView(wavBuffer);

  // WAV header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples * numChannels * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples * numChannels * 2, true);

  // Write samples
  const channelData = buffer.getChannelData(0);
  let offset = 44;
  for (let i = 0; i < samples; i++) {
    const s = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new File([wavBuffer], `${work.id}.wav`, { type: "audio/wav" });
}

/** Generate waveform visualization PNG for audio works */
export async function generateAudioWaveformImage(
  work: Work,
  shareColors: { bg: string; fg: string; muted: string },
  attrStrip: HTMLCanvasElement
): Promise<File | null> {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = shareColors.bg;
  ctx.fillRect(0, 0, LOGICAL, LOGICAL);

  // Draw waveform bars
  const barCount = 64;
  const barWidth = WORK_AREA_W / barCount * 0.7;
  const barGap = WORK_AREA_W / barCount * 0.3;
  const maxBarH = WORK_AREA_H * 0.6;
  const centerY = PAD + WORK_AREA_H / 2;

  ctx.fillStyle = shareColors.fg;
  ctx.globalAlpha = 0.4;

  // Generate deterministic waveform from work ID
  let seed = 0;
  for (let i = 0; i < work.id.length; i++) seed = ((seed << 5) - seed + work.id.charCodeAt(i)) | 0;

  for (let i = 0; i < barCount; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const h = (seed % 100) / 100 * maxBarH + maxBarH * 0.1;
    const x = PAD + i * (barWidth + barGap);
    ctx.fillRect(x, centerY - h / 2, barWidth, h);
  }

  ctx.globalAlpha = 1;

  // Work ID centered
  ctx.fillStyle = shareColors.fg;
  ctx.globalAlpha = 0.3;
  ctx.font = "600 40px monospace";
  ctx.textAlign = "center";
  ctx.fillText(work.id, LOGICAL / 2, centerY + WORK_AREA_H * 0.4);
  ctx.globalAlpha = 1;

  // Attribution strip
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(attrStrip, 0, SIZE - ATTR_HEIGHT * SCALE, SIZE, ATTR_HEIGHT * SCALE);
  ctx.restore();

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) { resolve(null); return; }
      resolve(new File([blob], `${work.id}-waveform.png`, { type: "image/png" }));
    }, "image/png");
  });
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export type ShareOutput =
  | { type: "image"; file: File }
  | { type: "video"; file: File }
  | { type: "audio"; audioFile: File; imageFile: File };

export async function generateShareFiles(work: Work): Promise<ShareOutput | null> {
  const colors = getContrastColors(work);
  const attrStrip = renderAttributionStrip(work, colors);

  // ── Audio works → audio file + waveform image ──
  if (work.output_type === "audio-json") {
    const audioFile = await generateAudioFile(work);
    const imageFile = await generateAudioWaveformImage(work, colors, attrStrip);
    if (audioFile && imageFile) {
      return { type: "audio", audioFile, imageFile };
    }
    // Fallback to just the waveform image
    if (imageFile) return { type: "image", file: imageFile };
    return null;
  }

  // ── 3D works → video (MP4/WebM) ──
  if (work.output_type === "scene-json") {
    const video = await generateSceneVideo(work, colors, attrStrip);
    if (video) return { type: "video", file: video };
    return null;
  }

  // ── Static works → PNG ──
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.style.cssText = "position:fixed;left:-9999px;top:-9999px";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) { document.body.removeChild(canvas); return null; }

  ctx.scale(SCALE, SCALE);

  // Background
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, LOGICAL, LOGICAL);

  try {
    switch (work.output_type) {
      case "text":
      case "ascii":
        renderTextWork(ctx, work, colors);
        break;
      case "svg":
        await renderSvgWork(ctx, work);
        break;
      case "canvas-json":
        renderCanvasWork(ctx, work, colors);
        break;
      case "html-css":
        // HTML works: show work ID with medium label (can't capture iframe reliably)
        ctx.fillStyle = colors.fg;
        ctx.globalAlpha = 0.3;
        ctx.font = "600 48px monospace";
        ctx.textAlign = "center";
        ctx.fillText(work.id, LOGICAL / 2, LOGICAL / 2 - 20);
        ctx.font = "24px sans-serif";
        ctx.globalAlpha = 0.2;
        ctx.fillText("HTML/CSS Animation — view at mnamuseum.org", LOGICAL / 2, LOGICAL / 2 + 30);
        ctx.globalAlpha = 1;
        break;
      default:
        ctx.fillStyle = colors.fg;
        ctx.font = "32px monospace";
        ctx.textAlign = "center";
        ctx.fillText(work.id, LOGICAL / 2, LOGICAL / 2);
    }
  } catch {
    // Fallback
    ctx.fillStyle = colors.fg;
    ctx.font = "32px monospace";
    ctx.textAlign = "center";
    ctx.fillText(work.id, LOGICAL / 2, LOGICAL / 2);
  }

  // Composite attribution strip
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(attrStrip, 0, SIZE - ATTR_HEIGHT * SCALE, SIZE, ATTR_HEIGHT * SCALE);
  ctx.restore();

  const file = await new Promise<File | null>((resolve) => {
    canvas.toBlob((blob) => {
      document.body.removeChild(canvas);
      if (!blob) { resolve(null); return; }
      resolve(new File([blob], `${work.id}.png`, { type: "image/png" }));
    }, "image/png");
  });

  return file ? { type: "image", file } : null;
}
