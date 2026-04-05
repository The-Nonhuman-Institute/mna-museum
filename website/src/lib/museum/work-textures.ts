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

// --- TEXT ---
function renderText(payload: string, bg: string, fg: string, aspect: number): HTMLCanvasElement {
  const [canvas, ctx, w, h] = createCanvas(aspect);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.textBaseline = "top";

  const lines = payload.split("\n");
  const margin = w * 0.06;
  const maxWidth = w - margin * 2;
  let fontSize = Math.min(28, Math.max(10, Math.floor(h / (lines.length * 1.5 + 2))));
  ctx.font = `${fontSize}px monospace`;

  const lineHeight = fontSize * 1.4;
  const totalH = lines.length * lineHeight;
  let y = Math.max(margin, (h - totalH) / 2);

  const maxLineW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  ctx.textAlign = maxLineW > maxWidth * 0.8 ? "left" : "center";
  const textX = ctx.textAlign === "left" ? margin : w / 2;

  for (const line of lines) {
    if (y > h - margin) break;
    ctx.fillText(line, textX, y, maxWidth);
    y += lineHeight;
  }
  return canvas;
}

// --- ASCII ---
function renderAscii(payload: string, bg: string, fg: string, aspect: number): HTMLCanvasElement {
  const [canvas, ctx, w, h] = createCanvas(aspect);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

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

    // Base64 encode — most reliable cross-browser SVG→Image method
    const base64 = btoa(unescape(encodeURIComponent(payload)));
    const dataUri = `data:image/svg+xml;base64,${base64}`;

    const img = new Image();

    const timeout = setTimeout(() => resolve(canvas), 3000);

    img.onload = () => {
      clearTimeout(timeout);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas);
    };
    img.onerror = () => {
      clearTimeout(timeout);
      resolve(canvas);
    };
    img.src = dataUri;
  });
}

// --- CANVAS-JSON ---
function renderCanvasJson(payload: string, aspect: number): HTMLCanvasElement {
  const [canvas, ctx, w, h] = createCanvas(aspect);
  ctx.fillStyle = "#0e0c0a";
  ctx.fillRect(0, 0, w, h);

  try {
    const parsed = JSON.parse(payload);
    const ops: any[] = Array.isArray(parsed) ? parsed : (parsed.ops || parsed.operations || []);

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

// --- HTML-CSS: extract colors + structure from the HTML, render a representative visual ---
function renderHtmlCss(payload: string, aspect: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve) => {
    const [canvas, ctx, w, h] = createCanvas(aspect);

    // Extract background color from CSS
    const bgMatch = payload.match(/background:\s*([#\w]+)/);
    const bg = bgMatch ? bgMatch[1] : "#0a0a0a";
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Extract all colors mentioned in the CSS
    const colorMatches = payload.match(/#[0-9a-fA-F]{3,8}/g) || [];
    const colors = Array.from(new Set(colorMatches)).filter(c => c !== bg).slice(0, 8);

    // Extract animation/element hints
    const hasAnimation = /animation|@keyframes|transition|transform/.test(payload);
    const hasAbsolute = /position:\s*absolute/.test(payload);

    // Draw representative shapes using the work's actual colors
    if (colors.length > 0) {
      const cellSize = Math.min(w, h) * 0.08;
      const cols = Math.ceil(Math.sqrt(colors.length * 3));

      for (let i = 0; i < colors.length * 3; i++) {
        const color = colors[i % colors.length];
        ctx.fillStyle = color;
        const cx = w * 0.15 + (i % cols) * cellSize * 1.8;
        const cy = h * 0.15 + Math.floor(i / cols) * cellSize * 1.8;

        if (hasAbsolute) {
          // Scattered positioning for absolute-positioned works
          const rx = w * 0.1 + Math.random() * w * 0.8;
          const ry = h * 0.1 + Math.random() * h * 0.8;
          const size = cellSize * (0.5 + Math.random() * 2);
          ctx.globalAlpha = 0.4 + Math.random() * 0.6;
          ctx.fillRect(rx - size / 2, ry - size / 2, size, size);
        } else {
          ctx.globalAlpha = 0.6 + Math.random() * 0.4;
          ctx.fillRect(cx, cy, cellSize, cellSize);
        }
      }
      ctx.globalAlpha = 1;
    }

    // Animated indicator
    if (hasAnimation) {
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.font = `${Math.max(10, w * 0.025)}px monospace`;
      ctx.textAlign = "center";
      ctx.fillText("\u25B6 ANIMATED WORK", w / 2, h - w * 0.04);
    }

    resolve(canvas);
  });
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
