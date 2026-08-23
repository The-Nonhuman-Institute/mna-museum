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
import { OUTPUT_TYPES, OUTPUT_TYPE_IDS } from "./output-types";

// ─── Constants ────────────────────────────────────────────────────────────────

// Static images: 1080x1080 square (Instagram feed, X, general sharing)
const LOGICAL = 1080;
const SCALE = 2;
const SIZE = LOGICAL * SCALE;
const PAD = 120;
const ATTR_HEIGHT = 140;
const WORK_AREA_W = LOGICAL - PAD * 2;
const WORK_AREA_H = LOGICAL - PAD * 2 - ATTR_HEIGHT;

// Video: 1080x1920 portrait (Instagram Stories/Reels native, no cropping)
const VIDEO_W = 1080;
const VIDEO_H = 1920;
const VIDEO_PAD = 80;
const VIDEO_ATTR_HEIGHT = 200; // Extra room above Stories bottom safe zone (~250px)
const VIDEO_SAFE_BOTTOM = 280; // Instagram UI covers this much from the bottom

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
  colors: { fg: string; muted: string },
  width: number = LOGICAL,
  height: number = ATTR_HEIGHT,
  padding: number = PAD,
  scale: number = SCALE
): HTMLCanvasElement {
  const strip = document.createElement("canvas");
  strip.width = width * scale;
  strip.height = height * scale;
  const ctx = strip.getContext("2d")!;
  ctx.scale(scale, scale);

  const y = 24;

  // Left: Title (if exists), Work ID, Phase, Medium, Originator
  ctx.fillStyle = colors.muted;
  ctx.textAlign = "left";
  let leftY = y;
  if (work.title) {
    ctx.globalAlpha = 0.9;
    ctx.font = "italic 20px sans-serif";
    ctx.fillText(work.title, padding, leftY);
    leftY += 24;
  }
  ctx.globalAlpha = 0.9;
  ctx.font = "600 20px sans-serif";
  ctx.fillText(work.id, padding, leftY);
  ctx.font = "16px sans-serif";
  ctx.fillText(`Phase ${work.phase_at_submission || "I"}, ${work.medium}`, padding, leftY + 22);
  ctx.font = "14px sans-serif";
  ctx.globalAlpha = 0.6;
  ctx.fillText(work.originator_id, padding, leftY + 42);

  // Right: MNA branding
  ctx.globalAlpha = 0.9;
  ctx.textAlign = "right";
  ctx.font = "600 20px sans-serif";
  ctx.fillText("MUSEUM OF NONHUMAN ART", width - padding, y + 4);
  ctx.font = "16px sans-serif";
  ctx.globalAlpha = 0.6;
  ctx.fillText("mnamuseum.org", width - padding, y + 30);
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

/**
 * How long a shared 3D rotation runs.
 *
 * Six seconds rather than three. Instagram treats anything under three seconds
 * as barely a video, and a single unhurried revolution reads as a deliberate
 * look at the work instead of a twitch.
 */
const SCENE_VIDEO_DURATION_MS = 6000;

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

  // 9:16 portrait — native Instagram Stories/Reels, no cropping
  const vW = VIDEO_W;
  const vH = VIDEO_H;
  // Attribution sits above the bottom safe zone
  const attrY = vH - VIDEO_SAFE_BOTTOM;
  const sceneH = attrY; // 3D scene fills from top to attribution

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

  const camera = new THREE.PerspectiveCamera(50, vW / sceneH, 0.1, 100);
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
  rendererCanvas.width = vW;
  rendererCanvas.height = sceneH;
  rendererCanvas.style.cssText = "position:fixed;left:-9999px;top:-9999px";
  document.body.appendChild(rendererCanvas);

  const renderer = new THREE.WebGLRenderer({
    canvas: rendererCanvas,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(vW, sceneH);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  // Composite canvas — this is what gets recorded as video
  const composite = document.createElement("canvas");
  composite.width = vW;
  composite.height = vH;
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

  // One full rotation, paced by the CLOCK rather than by frame count.
  //
  // This used to render a fixed 90 frames, one per requestAnimationFrame, and
  // call that "3 seconds at 30fps". requestAnimationFrame does not run at 30fps;
  // it runs at the display's refresh rate. MediaRecorder captures the canvas in
  // real time, so the finished video was as long as the loop took in wall clock:
  // 90/60 = 1.5s on an ordinary screen, and 0.75s on a 120Hz iPad or ProMotion
  // Mac. Shared to Instagram or X it looped in the feed and then ended almost
  // immediately when opened — the faster the device, the shorter the video.
  //
  // Driving the angle from elapsed time fixes it at any refresh rate: a fast
  // display renders more frames of the same rotation, not a shorter one.
  const durationMs = SCENE_VIDEO_DURATION_MS;

  recorder.start();

  const startedAt = performance.now();
  await new Promise<void>((resolve) => {
    function renderFrame() {
      const elapsed = performance.now() - startedAt;

      if (elapsed >= durationMs) {
        recorder.stop();
        resolve();
        return;
      }

      // Exactly one revolution over the full duration, so the last frame meets
      // the first and the loop is seamless wherever a platform restarts it.
      const angle = initialAngle + (elapsed / durationMs) * Math.PI * 2;
      camera.position.x = center.x + Math.sin(angle) * radius;
      camera.position.z = center.z + Math.cos(angle) * radius;
      camera.position.y = baseY;
      camera.lookAt(center);

      renderer.render(threeScene, camera);

      // Composite: bg + 3D scene (centered vertically in upper area) + attribution
      cCtx.fillStyle = shareColors.bg;
      cCtx.fillRect(0, 0, vW, vH);
      // Center the 3D render in the upper portion
      const sceneOffsetY = Math.max(0, (sceneH - rendererCanvas.height) / 2);
      cCtx.drawImage(rendererCanvas, 0, sceneOffsetY, vW, rendererCanvas.height);
      // Draw attribution strip above the safe zone
      cCtx.drawImage(attrStrip, 0, 0, attrStrip.width, attrStrip.height,
        0, attrY, vW, VIDEO_ATTR_HEIGHT);

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
  ctx.font = "600 40px Inter, system-ui, sans-serif";
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

/**
 * Media whose renderers paint into a canvas we can composite from.
 *
 * Derived from the registry's `animated` flag, minus the two that cannot use
 * this path: scene-json has its own orbit recording, and html-css renders in a
 * sandboxed iframe that cannot be drawn to a canvas.
 */
const RECORDABLE_MEDIA = new Set(
  OUTPUT_TYPE_IDS.filter(
    (id) => OUTPUT_TYPES[id].animated && id !== "scene-json" && id !== "html-css",
  ) as string[],
);

// ─── Rendered-media video ─────────────────────────────────────────────────────

/**
 * Video for any medium that animates in a canvas.
 *
 * Shaders, rule systems, toolpaths and composites all move, and every one of
 * them shared as a still — which is the same misrepresentation the static
 * html-css share makes, now across more of the collection.
 *
 * Rather than reimplement each renderer's drawing loop here (which would be a
 * second copy to keep in step, and would drift), this MOUNTS THE REAL RENDERER
 * offscreen and records what it actually paints. The shared video is the work as
 * the site draws it, not an approximation of it.
 *
 * Composites are handled by the same code: every canvas and SVG inside the
 * container is composited in document order at its own position, so a grid stays
 * a grid and a stack stays a stack.
 */

interface Layer {
  el: HTMLElement;
  /** Live canvases redraw every frame; rasterised SVG is drawn from cache. */
  image?: HTMLImageElement;
}

/** CSS blend modes that have a canvas equivalent. Others fall back to normal. */
const BLEND_MAP: Record<string, GlobalCompositeOperation> = {
  screen: "screen",
  multiply: "multiply",
  overlay: "overlay",
  lighten: "lighten",
  darken: "darken",
  "color-dodge": "color-dodge",
  "color-burn": "color-burn",
  difference: "difference",
  exclusion: "exclusion",
};

/** Rasterise an inline SVG once; SVG layers in a composite do not animate. */
function rasterizeSvg(svg: SVGElement): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    try {
      const clone = svg.cloneNode(true) as SVGElement;
      const rect = svg.getBoundingClientRect();
      clone.setAttribute("width", String(Math.max(1, Math.round(rect.width))));
      clone.setAttribute("height", String(Math.max(1, Math.round(rect.height))));
      const src = new XMLSerializer().serializeToString(clone);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src);
    } catch {
      resolve(null);
    }
  });
}

async function generateRenderedVideo(
  work: Work,
  colors: ReturnType<typeof getContrastColors>,
  attrStrip: HTMLCanvasElement,
): Promise<File | null> {
  const { createRoot } = await import("react-dom/client");
  const React = await import("react");

  const vW = VIDEO_W;
  const vH = VIDEO_H;
  const sceneH = vH - VIDEO_SAFE_BOTTOM;

  // Offscreen, but laid out and painting. display:none would stop rAF.
  const host = document.createElement("div");
  host.style.cssText =
    `position:fixed;left:-99999px;top:0;width:${vW}px;height:${sceneH}px;` +
    `overflow:hidden;pointer-events:none;`;
  document.body.appendChild(host);

  const root = createRoot(host);

  try {
    const payload = work.safe_render_payload?.length
      ? work.safe_render_payload
      : work.output_payload;

    const mod = await import("@/components/renderers/CompositeRenderer");
    const Composite = mod.default;

    // Every medium is expressed as a one-part composite, so this function needs
    // exactly one component and the part dispatch stays in one place.
    const spec = JSON.stringify({
      layout: "stack",
      background: colors.bg,
      parts: [{ type: work.output_type, payload }],
    });

    root.render(React.createElement(Composite, { json: spec }));

    // Wait for something to paint. Renderers mount asynchronously (dynamic
    // imports, WebGL context creation), so poll rather than guess a delay.
    const deadline = performance.now() + 8000;
    let layers: Layer[] = [];
    while (performance.now() < deadline) {
      await new Promise((r) => setTimeout(r, 120));
      const canvases = Array.from(host.querySelectorAll("canvas")) as HTMLCanvasElement[];
      const svgs = Array.from(host.querySelectorAll("svg")) as unknown as SVGElement[];
      if (canvases.some((c) => c.width > 1 && c.height > 1) || svgs.length > 0) {
        const ordered = Array.from(host.querySelectorAll("canvas, svg")) as HTMLElement[];
        layers = [];
        for (const el of ordered) {
          if (el.tagName.toLowerCase() === "svg") {
            const img = await rasterizeSvg(el as unknown as SVGElement);
            if (img) layers.push({ el, image: img });
          } else {
            layers.push({ el });
          }
        }
        break;
      }
    }
    if (layers.length === 0) return null;

    // Give an unfolding work a moment of head start so the recording does not
    // open on an empty frame.
    await new Promise((r) => setTimeout(r, 400));

    const composite = document.createElement("canvas");
    composite.width = vW;
    composite.height = vH;
    composite.style.cssText = "position:fixed;left:-99999px;top:0";
    document.body.appendChild(composite);
    const cCtx = composite.getContext("2d");
    if (!cCtx) return null;

    const stream = composite.captureStream(30);
    const mimeType = MediaRecorder.isTypeSupported("video/mp4")
      ? "video/mp4"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    const hostRect = host.getBoundingClientRect();
    const attrY = sceneH;

    recorder.start();
    const startedAt = performance.now();

    await new Promise<void>((resolve) => {
      const frame = () => {
        // Clock-paced, like every other timed thing here. A frame-counted
        // recording is a different length on every display.
        if (performance.now() - startedAt >= SCENE_VIDEO_DURATION_MS) {
          recorder.stop();
          resolve();
          return;
        }

        cCtx.globalCompositeOperation = "source-over";
        cCtx.globalAlpha = 1;
        cCtx.fillStyle = colors.bg;
        cCtx.fillRect(0, 0, vW, vH);

        for (const layer of layers) {
          const r = layer.el.getBoundingClientRect();
          const x = r.left - hostRect.left;
          const y = r.top - hostRect.top;
          if (r.width < 1 || r.height < 1) continue;

          const cs = getComputedStyle(layer.el);
          cCtx.globalAlpha = Number(cs.opacity || "1");
          const parentBlend = getComputedStyle(layer.el.parentElement ?? layer.el).mixBlendMode;
          cCtx.globalCompositeOperation = BLEND_MAP[parentBlend] ?? "source-over";

          try {
            const src = layer.image ?? (layer.el as HTMLCanvasElement);
            cCtx.drawImage(src as CanvasImageSource, x, y, r.width, r.height);
          } catch {
            /* a tainted or zero-size source is skipped, not fatal */
          }
        }

        cCtx.globalAlpha = 1;
        cCtx.globalCompositeOperation = "source-over";
        cCtx.drawImage(attrStrip, 0, 0, attrStrip.width, attrStrip.height,
          0, attrY, vW, VIDEO_ATTR_HEIGHT);

        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    });

    document.body.removeChild(composite);
    const ext = mimeType.includes("mp4") ? "mp4" : "webm";
    return new File([blob], `${work.id}.${ext}`, { type: mimeType });
  } catch {
    return null;
  } finally {
    try { root.unmount(); } catch { /* already gone */ }
    if (host.parentNode) document.body.removeChild(host);
  }
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

  // ── 3D works → video (MP4/WebM) at 9:16 portrait ──
  // scene-json keeps its own path: the shared video is a camera orbit, which is
  // a reading of the sculpture rather than a recording of the page.
  if (work.output_type === "scene-json") {
    const videoAttrStrip = renderAttributionStrip(work, colors, VIDEO_W, VIDEO_ATTR_HEIGHT, VIDEO_PAD, 1);
    const video = await generateSceneVideo(work, colors, videoAttrStrip);
    if (video) return { type: "video", file: video };
    return null;
  }

  // ── Other animated media → video, by recording the real renderer ──
  //
  // html-css is deliberately absent. It renders inside a sandboxed iframe, and
  // an iframe cannot be drawn to a canvas, so there is nothing here to record.
  // That gap is real and is not closed by this path.
  if (RECORDABLE_MEDIA.has(work.output_type)) {
    const videoAttrStrip = renderAttributionStrip(work, colors, VIDEO_W, VIDEO_ATTR_HEIGHT, VIDEO_PAD, 1);
    const video = await generateRenderedVideo(work, colors, videoAttrStrip);
    if (video) return { type: "video", file: video };
    // Fall through to the still. A work that would not record is still shareable
    // — archive permanence applies to sharing too.
  }

  // ── HTML-CSS works → static snapshot PNG ──
  // (Video capture is unreliable on mobile Safari — share a captured moment instead)

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
      case "html-css": {
        // Use pre-rendered preview screenshot (generated by export.ts via Puppeteer)
        try {
          const previewUrl = `/previews/${work.id}.png`;
          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = reject;
            img.src = previewUrl;
          });

          const imgScale = Math.min(WORK_AREA_W / img.width, WORK_AREA_H / img.height);
          const drawW = img.width * imgScale;
          const drawH = img.height * imgScale;
          const drawX = PAD + (WORK_AREA_W - drawW) / 2;
          const drawY = PAD + (WORK_AREA_H - drawH) / 2;
          ctx.drawImage(img, drawX, drawY, drawW, drawH);
        } catch {
          // No preview available — show branded fallback
          const centerY = PAD + WORK_AREA_H / 2;
          ctx.fillStyle = colors.fg;
          ctx.globalAlpha = 0.7;
          ctx.font = "600 42px Inter, system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(work.id, LOGICAL / 2, centerY - 20);
          ctx.globalAlpha = 0.3;
          ctx.font = "22px sans-serif";
          ctx.fillText("CSS Animation — mnamuseum.org", LOGICAL / 2, centerY + 20);
          ctx.globalAlpha = 1;
        }
        break;
      }
      default: {
        // Fallback for any medium — always show the work ID and medium
        const centerY = PAD + WORK_AREA_H / 2;
        ctx.fillStyle = colors.fg;
        ctx.globalAlpha = 0.7;
        ctx.font = "600 42px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(work.id, LOGICAL / 2, centerY - 15);
        ctx.globalAlpha = 0.3;
        ctx.font = "22px sans-serif";
        ctx.fillText(`${work.medium} — mnamuseum.org`, LOGICAL / 2, centerY + 25);
        ctx.globalAlpha = 1;
      }
    }
  } catch {
    // Fallback
    ctx.fillStyle = colors.fg;
    ctx.font = "32px Inter, system-ui, sans-serif";
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
