import * as THREE from "three";
import { Work } from "@/lib/collection";
import { parseWorkColors, detectSvgBackground } from "@/lib/work-colors";
import { createAnimatedTexture } from "./animated-textures";

// Render works to CanvasTexture for 3D museum display
// Each output type gets properly rendered to match how it looks on the site

const BASE_SIZE = 512;

function createCanvas(aspect: number): [HTMLCanvasElement, CanvasRenderingContext2D, number, number] {
  const canvas = document.createElement("canvas");
  let w: number, h: number;
  if (aspect >= 1) {
    w = BASE_SIZE;
    h = Math.round(BASE_SIZE / aspect);
  } else {
    h = BASE_SIZE;
    w = Math.round(BASE_SIZE * aspect);
  }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  return [canvas, ctx, w, h];
}

// Ensure minimum contrast for readability in the 3D museum
function ensureReadable(bg: string, fg: string): string {
  const parse = (hex: string) => {
    const c = hex.replace("#", "");
    const r = parseInt(c.substring(0, 2), 16) || 0;
    const g = parseInt(c.substring(2, 4), 16) || 0;
    const b = parseInt(c.substring(4, 6), 16) || 0;
    return [r, g, b];
  };
  const [br, bg2, bb] = parse(bg);
  const [fr, fg2, fb] = parse(fg);
  const bgLum = (0.299 * br + 0.587 * bg2 + 0.114 * bb);
  const fgLum = (0.299 * fr + 0.587 * fg2 + 0.114 * fb);
  const contrast = Math.abs(fgLum - bgLum);

  // If contrast is too low, brighten/darken the fg to minimum readable level
  if (contrast < 80) {
    if (bgLum < 128) {
      // Dark bg — brighten fg
      const target = Math.min(255, Math.round(bgLum + 100));
      return `rgb(${target}, ${target - 5}, ${target - 10})`;
    } else {
      // Light bg — darken fg
      const target = Math.max(0, Math.round(bgLum - 100));
      return `rgb(${target}, ${target}, ${target})`;
    }
  }
  return fg;
}

// --- TEXT ---
function renderText(payload: string, bg: string, fg: string, aspect: number): HTMLCanvasElement {
  const [canvas, ctx, w, h] = createCanvas(aspect);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  fg = ensureReadable(bg, fg);
  ctx.fillStyle = fg;
  ctx.textBaseline = "top";

  const lines = payload.split("\n");
  const margin = w * 0.08;
  const availW = w - margin * 2;
  const availH = h - margin * 2;

  // Find the largest font size that fits ALL lines without any compression
  // Minimum 12px — text must be readable
  let fontSize = 30;
  let lineHeight = 0;
  let totalH = 0;
  let maxLineW = 0;

  while (fontSize > 12) {
    ctx.font = `${fontSize}px monospace`;
    lineHeight = fontSize * 1.5;
    totalH = lines.length * lineHeight;
    maxLineW = Math.max(...lines.map((l) => ctx.measureText(l).width));

    if (totalH <= availH && maxLineW <= availW) break;
    fontSize--;
  }

  ctx.font = `${fontSize}px monospace`;
  const startY = Math.max(margin, (h - totalH) / 2);

  // Determine alignment based on content shape
  const centered = maxLineW < availW * 0.7;
  ctx.textAlign = centered ? "center" : "left";
  const textX = centered ? w / 2 : margin;

  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * lineHeight;
    if (y + fontSize > h) break; // don't draw if it would clip
    ctx.fillText(lines[i], textX, y); // NO maxWidth — no compression/warping
  }
  return canvas;
}

// --- ASCII ---
function renderAscii(payload: string, bg: string, fg: string, aspect: number): HTMLCanvasElement {
  const [canvas, ctx, w, h] = createCanvas(aspect);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  fg = ensureReadable(bg, fg);

  const lines = payload.split("\n");
  const maxLen = Math.max(...lines.map((l) => l.length), 1);
  const fontW = Math.floor((w * 0.9) / (maxLen * 0.6));
  const fontH = Math.floor((h * 0.9) / (lines.length * 1.2));
  const fontSize = Math.min(fontW, fontH, 20);

  ctx.font = `${fontSize}px monospace`;
  ctx.fillStyle = fg;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  const lineHeight = fontSize * 1.2;
  const charW = ctx.measureText("M").width;
  const startX = (w - maxLen * charW) / 2;
  const startY = (h - lines.length * lineHeight) / 2;

  lines.forEach((line, i) => {
    ctx.fillText(line, Math.max(4, startX), startY + i * lineHeight);
  });
  return canvas;
}

// --- SVG ---
function renderSvg(payload: string, aspect: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve) => {
    const [canvas, ctx, w, h] = createCanvas(aspect);
    const bg = detectSvgBackground(payload) || "#0e0c0a";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Add explicit dimensions to SVG if missing width/height attributes
    let svgStr = payload;
    if (!/<svg[^>]*width=/.test(svgStr)) {
      svgStr = svgStr.replace("<svg", `<svg width="${w}" height="${h}"`);
    }
    // Add xmlns if missing (required for Blob rendering)
    if (!svgStr.includes("xmlns=")) {
      svgStr = svgStr.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    // Blob URL preserves internal url(#id) references for gradients/filters
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const img = new Image();

    const timeout = setTimeout(() => {
      URL.revokeObjectURL(url);
      resolve(canvas);
    }, 3000);

    img.onload = () => {
      clearTimeout(timeout);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.src = url;
  });
}

// --- CANVAS-JSON ---
function renderCanvasJson(payload: string, aspect: number): HTMLCanvasElement {
  const [canvas, ctx, w, h] = createCanvas(aspect);
  ctx.fillStyle = "#0e0c0a";
  ctx.fillRect(0, 0, w, h);

  try {
    let jsonStr = payload;
    try { JSON.parse(jsonStr); } catch {
      // Auto-close truncated JSON
      jsonStr = jsonStr.replace(/,\s*{\s*"[^"]*"\s*:\s*[^}]*$/, "");
      jsonStr = jsonStr.replace(/,\s*"[^"]*"?\s*$/, "");
      jsonStr = jsonStr.replace(/,\s*$/, "");
      let braces = 0, brackets = 0;
      for (const ch of jsonStr) { if (ch === "{") braces++; else if (ch === "}") braces--; else if (ch === "[") brackets++; else if (ch === "]") brackets--; }
      while (brackets > 0) { jsonStr += "]"; brackets--; }
      while (braces > 0) { jsonStr += "}"; braces--; }
    }
    const parsed = JSON.parse(jsonStr);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ops: any[] = Array.isArray(parsed) ? parsed : ((parsed as Record<string, unknown>).ops || (parsed as Record<string, unknown>).operations || []) as any[];

    ctx.save();
    ctx.scale(w / 800, h / 800);

    for (const op of ops) {
      switch (op.op) {
        case "bg":
          if (op.color) { ctx.fillStyle = op.color; ctx.fillRect(0, 0, 800, 800); }
          break;
        case "fill":
          if (op.color) ctx.fillStyle = op.color;
          break;
        case "stroke":
          if (op.color) ctx.strokeStyle = op.color;
          if (op.width) ctx.lineWidth = op.width;
          break;
        case "rect":
          if (op.fill === false) ctx.strokeRect(op.x ?? 0, op.y ?? 0, op.w ?? 0, op.h ?? 0);
          else ctx.fillRect(op.x ?? 0, op.y ?? 0, op.w ?? 0, op.h ?? 0);
          break;
        case "circle":
          ctx.beginPath();
          ctx.arc(op.x ?? 0, op.y ?? 0, op.r ?? 0, 0, Math.PI * 2);
          if (op.fill === false) ctx.stroke(); else ctx.fill();
          break;
        case "line":
          ctx.beginPath();
          ctx.moveTo(op.x1 ?? 0, op.y1 ?? 0);
          ctx.lineTo(op.x2 ?? 0, op.y2 ?? 0);
          ctx.stroke();
          break;
        case "arc":
          ctx.beginPath();
          ctx.arc(op.x ?? 0, op.y ?? 0, op.r ?? 0, op.start ?? 0, op.end ?? Math.PI * 2);
          ctx.stroke();
          break;
        case "text":
          if (op.font) ctx.font = op.font;
          if (op.text) ctx.fillText(op.text, op.x ?? 0, op.y ?? 0);
          break;
      }
    }
    ctx.restore();
  } catch {
    // fallback — dark canvas
  }
  return canvas;
}

// --- AUDIO placeholder ---
function renderAudioPlaceholder(aspect: number): HTMLCanvasElement {
  const [canvas, ctx, w, h] = createCanvas(aspect);
  ctx.fillStyle = "#0a0a0c";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "#4a9060";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = w * 0.08; x < w * 0.92; x++) {
    const t = (x - w * 0.08) / (w * 0.84);
    const amp = Math.sin(t * Math.PI) * h * 0.25;
    const y = h / 2 + Math.sin(t * 25) * amp;
    if (x === Math.floor(w * 0.08)) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.fillStyle = "#4a9060";
  ctx.font = `${Math.max(12, w * 0.03)}px monospace`;
  ctx.textAlign = "center";
  ctx.fillText("AUDIO SYNTHESIS", w / 2, h * 0.88);
  return canvas;
}

// --- SCENE-JSON: render snapshot using offscreen WebGL ---
function renderSceneJson(payload: string, aspect: number): HTMLCanvasElement {
  const [canvas, , w, h] = createCanvas(aspect);

  try {
    const data = JSON.parse(payload);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(data.bg || "#0c0c0c");

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 5);
    scene.add(dir);

    const objects = data.objects || [];
    for (const obj of objects.slice(0, 100)) {
      let geo: THREE.BufferGeometry;
      switch (obj.shape) {
        case "sphere": geo = new THREE.SphereGeometry(0.5, 16, 16); break;
        case "cylinder": geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 16); break;
        case "cone": geo = new THREE.ConeGeometry(0.5, 1, 16); break;
        case "torus": geo = new THREE.TorusGeometry(0.5, 0.15, 8, 24); break;
        case "plane": geo = new THREE.PlaneGeometry(1, 1); break;
        default: geo = new THREE.BoxGeometry(1, 1, 1);
      }
      const mat = new THREE.MeshStandardMaterial({
        color: obj.color || "#808080",
        metalness: obj.metalness ?? 0.3,
        roughness: obj.roughness ?? 0.5,
        opacity: obj.opacity ?? 1,
        transparent: (obj.opacity ?? 1) < 1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      if (obj.position) mesh.position.set(obj.position[0], obj.position[1], obj.position[2]);
      if (obj.scale) mesh.scale.set(obj.scale[0], obj.scale[1], obj.scale[2]);
      if (obj.rotation) mesh.rotation.set(obj.rotation[0], obj.rotation[1], obj.rotation[2]);
      scene.add(mesh);
    }

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    const cam = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    const c = data.camera || {};
    cam.position.set(c.x ?? 3, c.y ?? 2, c.z ?? 4);
    const lookAt = c.lookAt || [0, 0, 0];
    cam.lookAt(new THREE.Vector3(lookAt[0], lookAt[1], lookAt[2]));

    renderer.render(scene, cam);
    renderer.dispose();

    // Clean up
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
      if ((obj as THREE.Mesh).material) {
        const m = (obj as THREE.Mesh).material;
        if (Array.isArray(m)) m.forEach(x => x.dispose()); else m.dispose();
      }
    });
  } catch {
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#0c0c0c";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#6a6560";
      ctx.font = "14px monospace";
      ctx.textAlign = "center";
      ctx.fillText("3D SCULPTURE", w / 2, h / 2);
    }
  }

  return canvas;
}

export async function renderWorkToTexture(work: Work): Promise<THREE.CanvasTexture | null> {
  const aspect = work.display_aspect || 1;
  let canvas: HTMLCanvasElement | null = null;

  try {
    switch (work.output_type) {
      case "text": {
        const colors = parseWorkColors(work.output_payload, "text");
        canvas = renderText(colors.payload, colors.bg, colors.fg, aspect);
        break;
      }
      case "ascii": {
        const colors = parseWorkColors(work.output_payload, "ascii");
        canvas = renderAscii(colors.payload, colors.bg, colors.fg, aspect);
        break;
      }
      case "svg":
        canvas = await renderSvg(work.output_payload, aspect);
        break;
      case "canvas-json":
        canvas = renderCanvasJson(work.output_payload, aspect);
        break;
      case "html-css":
        // Return animated texture directly — it updates itself via iframe capture
        return createAnimatedTexture(work.output_payload);
      case "audio-json":
        canvas = renderAudioPlaceholder(aspect);
        break;
      case "scene-json":
        canvas = renderSceneJson(work.output_payload, aspect);
        break;
      default:
        return null;
    }
  } catch {
    return null;
  }

  if (!canvas) return null;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
