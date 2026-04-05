import * as THREE from "three";
import { frameWoodMaterial } from "./materials";

// 3D frames for hanging works on walls
// Frame is a beveled rectangular border with the work texture on a plane inside

// Frame configs matching MuseumFrame.tsx aspect ratios
const FRAME_CONFIGS = {
  "1x1": { aspect: 810 / 854, inset: 0.12 },
  "3x4": { aspect: 627 / 940, inset: 0.13 },
  "16x9": { aspect: 1027 / 604, inset: 0.12 },
  "21x9": { aspect: 1369 / 390, inset: 0.08 },
} as const;

type FrameType = keyof typeof FRAME_CONFIGS;

export function selectFrameType(displayAspect: number): FrameType {
  if (displayAspect >= 2.5) return "21x9";
  if (displayAspect >= 1.3) return "16x9";
  if (displayAspect >= 0.85) return "1x1";
  return "3x4";
}

export function createFramedWork(
  texture: THREE.CanvasTexture,
  displayAspect: number,
  frameHeight: number = 5,
): THREE.Group {
  const group = new THREE.Group();
  const frameType = selectFrameType(displayAspect);
  const config = FRAME_CONFIGS[frameType];
  const borderFraction = config.inset;

  // Frame outer dimensions — use actual work aspect for inner, add border
  const innerH = frameHeight * 0.8;
  const innerW = innerH * displayAspect;
  const borderWidth = Math.max(innerW, innerH) * borderFraction;
  const outerH = innerH + borderWidth * 2;
  const outerW = innerW + borderWidth * 2;
  const frameDepth = 0.3;

  // Work plane (sits inside the frame, slightly recessed)
  const workGeo = new THREE.PlaneGeometry(innerW, innerH);
  const workMat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.8,
    metalness: 0.0,
    emissive: 0xffffff,
    emissiveMap: texture,
    emissiveIntensity: 0.15, // subtle self-illumination so dark works are visible
  });
  const workPlane = new THREE.Mesh(workGeo, workMat);
  workPlane.position.z = 0.02; // slightly in front of back
  group.add(workPlane);

  // Frame border — 4 box pieces forming a rectangular frame
  const frameMat = frameWoodMaterial();

  // Top bar
  const topGeo = new THREE.BoxGeometry(outerW, borderWidth, frameDepth);
  const top = new THREE.Mesh(topGeo, frameMat);
  top.position.y = outerH / 2 - borderWidth / 2;
  group.add(top);

  // Bottom bar
  const bottom = new THREE.Mesh(topGeo, frameMat);
  bottom.position.y = -(outerH / 2 - borderWidth / 2);
  group.add(bottom);

  // Left bar
  const sideGeo = new THREE.BoxGeometry(borderWidth, outerH - borderWidth * 2, frameDepth);
  const left = new THREE.Mesh(sideGeo, frameMat);
  left.position.x = -(outerW / 2 - borderWidth / 2);
  group.add(left);

  // Right bar
  const right = new THREE.Mesh(sideGeo, frameMat);
  right.position.x = outerW / 2 - borderWidth / 2;
  group.add(right);

  return group;
}

// Create a placard (small label below the frame)
export function createPlacard(
  text: string,
  subtitle: string,
  width: number = 3
): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#f0ece6";
  ctx.fillRect(0, 0, 512, 128);

  ctx.fillStyle = "#2a2520";
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, 256, 45);

  ctx.fillStyle = "#6a6560";
  ctx.font = "16px sans-serif";
  ctx.fillText(subtitle, 256, 80);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(width, width * (128 / 512));
  const mat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.9,
    metalness: 0.0,
  });

  return new THREE.Mesh(geo, mat);
}
