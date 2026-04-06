import * as THREE from "three";

// Procedural concrete textures — 1024x1024 with visible character
// Multi-scale noise, formwork lines, aggregate, hairline cracks, stain patches
// No external files — everything generated at runtime

const TEX_SIZE = 1024;

// Smooth value noise (interpolated random grid)
function smoothNoise(w: number, h: number, scale: number): number[] {
  const gridW = Math.ceil(w / scale) + 2;
  const gridH = Math.ceil(h / scale) + 2;
  const grid: number[] = [];
  for (let i = 0; i < gridW * gridH; i++) grid.push(Math.random());

  const result: number[] = new Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = x / scale;
      const gy = y / scale;
      const ix = Math.floor(gx);
      const iy = Math.floor(gy);
      const fx = gx - ix;
      const fy = gy - iy;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);

      const i00 = grid[iy * gridW + ix] || 0;
      const i10 = grid[iy * gridW + ix + 1] || 0;
      const i01 = grid[(iy + 1) * gridW + ix] || 0;
      const i11 = grid[(iy + 1) * gridW + ix + 1] || 0;

      const top = i00 + sx * (i10 - i00);
      const bottom = i01 + sx * (i11 - i01);
      result[y * w + x] = top + sy * (bottom - top);
    }
  }
  return result;
}

// === CONCRETE WALL TEXTURE ===
let _wallTexture: THREE.CanvasTexture | null = null;

export function concreteWallTexture(): THREE.CanvasTexture {
  if (_wallTexture) return _wallTexture;

  const canvas = document.createElement("canvas");
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext("2d")!;

  // Base color
  const baseR = 154, baseG = 149, baseB = 144;
  ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  // Get pixel data for direct manipulation
  const imgData = ctx.getImageData(0, 0, TEX_SIZE, TEX_SIZE);
  const px = imgData.data;

  // Layer 1: Large-scale tonal variation (pour sections)
  const large = smoothNoise(TEX_SIZE, TEX_SIZE, 200);
  // Layer 2: Medium texture (aggregate grain)
  const medium = smoothNoise(TEX_SIZE, TEX_SIZE, 40);
  // Layer 3: Fine detail
  const fine = smoothNoise(TEX_SIZE, TEX_SIZE, 8);

  for (let i = 0; i < TEX_SIZE * TEX_SIZE; i++) {
    const idx = i * 4;
    const lv = (large[i] - 0.5) * 30;   // ±15 variation
    const mv = (medium[i] - 0.5) * 16;  // ±8
    const fv = (fine[i] - 0.5) * 10;    // ±5
    const pxNoise = (Math.random() - 0.5) * 12; // per-pixel noise

    const val = lv + mv + fv + pxNoise;
    px[idx] = Math.max(0, Math.min(255, baseR + val));
    px[idx + 1] = Math.max(0, Math.min(255, baseG + val - 1));
    px[idx + 2] = Math.max(0, Math.min(255, baseB + val - 2));
  }
  ctx.putImageData(imgData, 0, 0);

  // Formwork lines (horizontal seams)
  ctx.strokeStyle = "rgba(75, 70, 65, 0.18)";
  ctx.lineWidth = 1.5;
  const formCount = 3 + Math.floor(Math.random() * 2);
  const formSpacing = TEX_SIZE / (formCount + 1);
  for (let i = 1; i <= formCount; i++) {
    const y = formSpacing * i + (Math.random() - 0.5) * 15;
    ctx.beginPath();
    for (let x = 0; x < TEX_SIZE; x += 10) {
      const yy = y + (Math.random() - 0.5) * 1.5;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    // Shadow below seam
    ctx.strokeStyle = "rgba(65, 60, 55, 0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + 2.5);
    ctx.lineTo(TEX_SIZE, y + 2.5);
    ctx.stroke();
    ctx.strokeStyle = "rgba(75, 70, 65, 0.18)";
    ctx.lineWidth = 1.5;
  }

  // Hairline cracks
  ctx.strokeStyle = "rgba(60, 55, 48, 0.14)";
  ctx.lineWidth = 0.7;
  for (let c = 0; c < 3; c++) {
    let cx = Math.random() * TEX_SIZE;
    let cy = Math.random() * TEX_SIZE * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let s = 0; s < 6 + Math.floor(Math.random() * 6); s++) {
      cx += (Math.random() - 0.5) * 50;
      cy += 10 + Math.random() * 30;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  // Aggregate speckle
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * TEX_SIZE;
    const y = Math.random() * TEX_SIZE;
    const size = 0.5 + Math.random() * 2;
    const b = 115 + Math.floor(Math.random() * 55);
    ctx.fillStyle = `rgba(${b}, ${b - 6}, ${b - 12}, ${0.12 + Math.random() * 0.18})`;
    ctx.fillRect(x, y, size, size);
  }

  // Stain patches
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * TEX_SIZE;
    const y = Math.random() * TEX_SIZE;
    const r = 40 + Math.random() * 100;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = Math.random() > 0.5;
    gradient.addColorStop(0, dark ? "rgba(120, 112, 105, 0.08)" : "rgba(170, 165, 158, 0.06)");
    gradient.addColorStop(1, "rgba(150, 145, 140, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  _wallTexture = new THREE.CanvasTexture(canvas);
  _wallTexture.wrapS = THREE.RepeatWrapping;
  _wallTexture.wrapT = THREE.RepeatWrapping;
  _wallTexture.repeat.set(1.5, 1.5);
  return _wallTexture;
}

// === POLISHED CONCRETE FLOOR ===
let _floorTexture: THREE.CanvasTexture | null = null;

export function polishedFloorTexture(): THREE.CanvasTexture {
  if (_floorTexture) return _floorTexture;

  const canvas = document.createElement("canvas");
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext("2d")!;

  const baseR = 80, baseG = 74, baseB = 68;
  ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  const imgData = ctx.getImageData(0, 0, TEX_SIZE, TEX_SIZE);
  const px = imgData.data;

  const large = smoothNoise(TEX_SIZE, TEX_SIZE, 150);
  const medium = smoothNoise(TEX_SIZE, TEX_SIZE, 30);

  for (let i = 0; i < TEX_SIZE * TEX_SIZE; i++) {
    const idx = i * 4;
    const lv = (large[i] - 0.5) * 20;
    const mv = (medium[i] - 0.5) * 10;
    const pxN = (Math.random() - 0.5) * 6;
    const val = lv + mv + pxN;
    px[idx] = Math.max(0, Math.min(255, baseR + val));
    px[idx + 1] = Math.max(0, Math.min(255, baseG + val - 1));
    px[idx + 2] = Math.max(0, Math.min(255, baseB + val - 2));
  }
  ctx.putImageData(imgData, 0, 0);

  // Exposed aggregate (visible stones)
  for (let i = 0; i < 800; i++) {
    const x = Math.random() * TEX_SIZE;
    const y = Math.random() * TEX_SIZE;
    const size = 2 + Math.random() * 5;
    const b = 55 + Math.floor(Math.random() * 45);
    ctx.fillStyle = `rgba(${b + 12}, ${b + 6}, ${b}, ${0.2 + Math.random() * 0.25})`;
    ctx.beginPath();
    ctx.ellipse(x, y, size, size * (0.5 + Math.random() * 0.5), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // Polish scratches (from diamond grinding)
  ctx.strokeStyle = "rgba(95, 88, 80, 0.05)";
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * TEX_SIZE;
    const y = Math.random() * TEX_SIZE;
    const len = 40 + Math.random() * 120;
    const angle = -0.15 + Math.random() * 0.3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }

  _floorTexture = new THREE.CanvasTexture(canvas);
  _floorTexture.wrapS = THREE.RepeatWrapping;
  _floorTexture.wrapT = THREE.RepeatWrapping;
  _floorTexture.repeat.set(3, 3);
  return _floorTexture;
}

// === CONCRETE NORMAL MAP ===
let _wallNormal: THREE.CanvasTexture | null = null;

export function concreteNormalMap(): THREE.CanvasTexture {
  if (_wallNormal) return _wallNormal;

  const SIZE = 512;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  // Build heightmap from layered noise
  const large = smoothNoise(SIZE, SIZE, 50);
  const medium = smoothNoise(SIZE, SIZE, 12);
  const fine = smoothNoise(SIZE, SIZE, 4);

  const heights = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    heights[i] = large[i] * 0.5 + medium[i] * 0.3 + fine[i] * 0.2 + (Math.random() - 0.5) * 0.05;
  }

  // Convert heightmap to normal map via Sobel
  const normalData = ctx.createImageData(SIZE, SIZE);
  const nd = normalData.data;
  const strength = 3.0;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const idx = (y * SIZE + x) * 4;
      const l = heights[y * SIZE + ((x - 1 + SIZE) % SIZE)];
      const r = heights[y * SIZE + ((x + 1) % SIZE)];
      const u = heights[((y - 1 + SIZE) % SIZE) * SIZE + x];
      const d = heights[((y + 1) % SIZE) * SIZE + x];

      const dx = (l - r) * strength;
      const dy = (u - d) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);

      nd[idx] = Math.round(((dx / len) * 0.5 + 0.5) * 255);
      nd[idx + 1] = Math.round(((dy / len) * 0.5 + 0.5) * 255);
      nd[idx + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      nd[idx + 3] = 255;
    }
  }
  ctx.putImageData(normalData, 0, 0);

  _wallNormal = new THREE.CanvasTexture(canvas);
  _wallNormal.wrapS = THREE.RepeatWrapping;
  _wallNormal.wrapT = THREE.RepeatWrapping;
  _wallNormal.repeat.set(1.5, 1.5);
  return _wallNormal;
}

export function disposeTextures(): void {
  _wallTexture?.dispose();
  _floorTexture?.dispose();
  _wallNormal?.dispose();
  _wallTexture = _floorTexture = _wallNormal = null;
}
