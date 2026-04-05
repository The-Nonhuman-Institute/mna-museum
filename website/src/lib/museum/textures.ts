import * as THREE from "three";

// Procedural textures — generated at runtime, no external files
// Concrete grain for walls, polished concrete for floors, flat matte for ceilings

const TEX_SIZE = 512;

function noise(ctx: CanvasRenderingContext2D, w: number, h: number, intensity: number): void {
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * intensity;
    data[i] += n;     // R
    data[i + 1] += n; // G
    data[i + 2] += n; // B
  }
  ctx.putImageData(imageData, 0, 0);
}

function addGrain(ctx: CanvasRenderingContext2D, w: number, h: number, count: number, color: string, maxSize: number): void {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const s = Math.random() * maxSize + 0.5;
    ctx.globalAlpha = Math.random() * 0.3 + 0.05;
    ctx.fillRect(x, y, s, s);
  }
  ctx.globalAlpha = 1;
}

// === CONCRETE WALL TEXTURE ===
// Subtle grain, slight tonal variation, a few hairline marks
let _wallTexture: THREE.CanvasTexture | null = null;

export function concreteWallTexture(): THREE.CanvasTexture {
  if (_wallTexture) return _wallTexture;

  const canvas = document.createElement("canvas");
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext("2d")!;

  // Base color
  ctx.fillStyle = "#9a9590";
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  // Large-scale tonal variation (soft blotches)
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * TEX_SIZE;
    const y = Math.random() * TEX_SIZE;
    const r = 80 + Math.random() * 120;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    const shade = Math.random() > 0.5 ? "rgba(180,170,160," : "rgba(140,130,120,";
    gradient.addColorStop(0, shade + "0.08)");
    gradient.addColorStop(1, shade + "0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  }

  // Fine grain noise
  noise(ctx, TEX_SIZE, TEX_SIZE, 12);

  // Speckle grain (tiny aggregate)
  addGrain(ctx, TEX_SIZE, TEX_SIZE, 2000, "#888078", 1.5);
  addGrain(ctx, TEX_SIZE, TEX_SIZE, 500, "#b0a8a0", 1);

  // Subtle formwork lines (horizontal)
  ctx.strokeStyle = "rgba(120,110,100,0.06)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const y = Math.random() * TEX_SIZE;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(TEX_SIZE, y);
    ctx.stroke();
  }

  _wallTexture = new THREE.CanvasTexture(canvas);
  _wallTexture.wrapS = THREE.RepeatWrapping;
  _wallTexture.wrapT = THREE.RepeatWrapping;
  _wallTexture.repeat.set(2, 2);
  return _wallTexture;
}

// === POLISHED CONCRETE FLOOR TEXTURE ===
// Darker, smoother, with subtle reflective quality
let _floorTexture: THREE.CanvasTexture | null = null;

export function polishedFloorTexture(): THREE.CanvasTexture {
  if (_floorTexture) return _floorTexture;

  const canvas = document.createElement("canvas");
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext("2d")!;

  // Base — dark polished concrete
  ctx.fillStyle = "#555048";
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  // Smooth tonal variation
  for (let i = 0; i < 12; i++) {
    const x = Math.random() * TEX_SIZE;
    const y = Math.random() * TEX_SIZE;
    const r = 60 + Math.random() * 100;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    const shade = Math.random() > 0.5 ? "rgba(100,90,80," : "rgba(70,65,55,";
    gradient.addColorStop(0, shade + "0.1)");
    gradient.addColorStop(1, shade + "0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  }

  // Very fine noise (polished surface still has micro-texture)
  noise(ctx, TEX_SIZE, TEX_SIZE, 6);

  // Fine aggregate speckles
  addGrain(ctx, TEX_SIZE, TEX_SIZE, 1000, "#605850", 1);
  addGrain(ctx, TEX_SIZE, TEX_SIZE, 300, "#4a4540", 1.5);

  _floorTexture = new THREE.CanvasTexture(canvas);
  _floorTexture.wrapS = THREE.RepeatWrapping;
  _floorTexture.wrapT = THREE.RepeatWrapping;
  _floorTexture.repeat.set(4, 4);
  return _floorTexture;
}

// === CONCRETE NORMAL MAP ===
// Gives walls surface depth without extra geometry
let _wallNormal: THREE.CanvasTexture | null = null;

export function concreteNormalMap(): THREE.CanvasTexture {
  if (_wallNormal) return _wallNormal;

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  // Neutral normal (flat surface = rgb(128, 128, 255))
  ctx.fillStyle = "rgb(128, 128, 255)";
  ctx.fillRect(0, 0, 256, 256);

  // Add variation — slight bumps
  const imageData = ctx.getImageData(0, 0, 256, 256);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 15;
    data[i] = Math.max(0, Math.min(255, 128 + n));     // R (x-normal)
    data[i + 1] = Math.max(0, Math.min(255, 128 + n)); // G (y-normal)
    // B stays at 255 (z-normal pointing out)
  }
  ctx.putImageData(imageData, 0, 0);

  _wallNormal = new THREE.CanvasTexture(canvas);
  _wallNormal.wrapS = THREE.RepeatWrapping;
  _wallNormal.wrapT = THREE.RepeatWrapping;
  _wallNormal.repeat.set(2, 2);
  return _wallNormal;
}

export function disposeTextures(): void {
  _wallTexture?.dispose();
  _floorTexture?.dispose();
  _wallNormal?.dispose();
  _wallTexture = _floorTexture = _wallNormal = null;
}
