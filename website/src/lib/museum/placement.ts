import * as THREE from "three";
import { Work, canon, works } from "@/lib/collection";
import { getAgent, getAgentsByType } from "@/lib/agents";
import { RoomConfig } from "./room-configs";
import { renderWorkToTexture } from "./work-textures";
import { createFramedWork, createPlacard } from "./frames3d";
import { isWorkRenderable } from "@/lib/validate-work";
import { registerAudioStation } from "./spatial-audio";
import { isWorkInExhibition } from "./exhibitions";

const EYE_HEIGHT = 5.5;

interface WallSlot {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  frameHeight: number;
}

function getDoorWidthOnWall(room: RoomConfig, wall: string): number {
  const conn = room.connections.find((c) => c.wall === wall);
  return conn ? conn.width : 0;
}

function generateWallSlots(
  room: RoomConfig,
  spacing: number,
  frameH: number,
): WallSlot[] {
  const slots: WallSlot[] = [];
  const w = room.width;
  const d = room.depth;
  const offset = 0.6;

  type WallDef = {
    wallLength: number;
    doorWidth: number;
    getSlot: (pos: number, y: number) => WallSlot;
  };

  const walls: WallDef[] = [
    {
      wallLength: w, doorWidth: getDoorWidthOnWall(room, "north"),
      getSlot: (pos, y) => ({ x: pos, y, z: -(d / 2) + offset, rotationY: 0, frameHeight: frameH }),
    },
    {
      wallLength: w, doorWidth: getDoorWidthOnWall(room, "south"),
      getSlot: (pos, y) => ({ x: pos, y, z: d / 2 - offset, rotationY: Math.PI, frameHeight: frameH }),
    },
    {
      wallLength: d, doorWidth: getDoorWidthOnWall(room, "east"),
      getSlot: (pos, y) => ({ x: w / 2 - offset, y, z: pos, rotationY: -Math.PI / 2, frameHeight: frameH }),
    },
    {
      wallLength: d, doorWidth: getDoorWidthOnWall(room, "west"),
      getSlot: (pos, y) => ({ x: -(w / 2) + offset, y, z: pos, rotationY: Math.PI / 2, frameHeight: frameH }),
    },
  ];

  for (const wall of walls) {
    const usable = wall.wallLength - 4;
    const doorW = wall.doorWidth;

    if (doorW > 0) {
      const sideLength = (usable - doorW) / 2;
      if (sideLength >= spacing) {
        const sideCount = Math.floor(sideLength / spacing);
        for (let i = 0; i < sideCount; i++) {
          const pos = -(usable / 2) + spacing / 2 + i * spacing;
          if (pos < -(doorW / 2 + 3)) slots.push(wall.getSlot(pos, EYE_HEIGHT));
        }
        for (let i = 0; i < sideCount; i++) {
          const pos = (usable / 2) - spacing / 2 - i * spacing;
          if (pos > doorW / 2 + 3) slots.push(wall.getSlot(pos, EYE_HEIGHT));
        }
      }
    } else {
      const count = Math.max(1, Math.floor(usable / spacing));
      const actual = usable / count;
      for (let i = 0; i < count; i++) {
        slots.push(wall.getSlot(-(usable / 2) + actual / 2 + i * actual, EYE_HEIGHT));
      }
    }
  }

  return slots;
}

// ===== SCULPTURE SYSTEM =====

type PlinthType = "block" | "column" | "platform" | "slab";

function getSculptureBounds(payload: string): { w: number; h: number; d: number } {
  try {
    const data = JSON.parse(payload);
    const objs = data.objects || [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const o of objs) {
      const p = o.position || [0, 0, 0];
      const s = o.scale || [1, 1, 1];
      minX = Math.min(minX, p[0] - s[0]); maxX = Math.max(maxX, p[0] + s[0]);
      minY = Math.min(minY, p[1] - s[1]); maxY = Math.max(maxY, p[1] + s[1]);
      minZ = Math.min(minZ, p[2] - s[2]); maxZ = Math.max(maxZ, p[2] + s[2]);
    }
    return { w: maxX - minX, h: maxY - minY, d: maxZ - minZ };
  } catch { return { w: 2, h: 2, d: 2 }; }
}

function selectPlinthType(bounds: { w: number; h: number; d: number }): PlinthType {
  const { w, h, d } = bounds;
  if (h > w * 2 && h > d * 2) return "column";
  if (w > h * 2 || d > h * 2) return "slab";
  if (w > h * 1.3 && d > h * 1.3) return "platform";
  return "block";
}

const PLINTH_DIMS: Record<PlinthType, { w: number; h: number; d: number }> = {
  block:    { w: 3.5, h: 3, d: 3.5 },
  column:   { w: 2.5, h: 5, d: 2.5 },
  platform: { w: 6, h: 1.5, d: 6 },
  slab:     { w: 7, h: 1.5, d: 3.5 },
};

export const rotatingSculptures: THREE.Group[] = [];

function buildSculpture(payload: string): THREE.Group | null {
  try {
    const data = JSON.parse(payload);
    const group = new THREE.Group();
    for (const obj of (data.objects || []).slice(0, 50)) {
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
      group.add(mesh);
    }
    return group;
  } catch { return null; }
}

// ===== PLACARD (museum wall label) =====

function createWallLabel(
  title: string,
  originator: string,
  medium: string,
  status: string,
): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  // White card
  ctx.fillStyle = "#f8f6f2";
  ctx.fillRect(0, 0, 512, 256);

  // Title — bold, large
  ctx.fillStyle = "#1a1815";
  ctx.font = "bold 28px Georgia, serif";
  ctx.textAlign = "left";
  ctx.fillText(title.length > 30 ? title.substring(0, 28) + "..." : title, 24, 50);

  // Originator name
  ctx.fillStyle = "#4a4540";
  ctx.font = "22px Georgia, serif";
  ctx.fillText(originator, 24, 90);

  // Medium + status
  ctx.fillStyle = "#8a8580";
  ctx.font = "16px sans-serif";
  ctx.fillText(medium, 24, 130);

  // Canon status
  ctx.fillStyle = status === "CANON" ? "#3a6a40" : "#6a6560";
  ctx.font = "12px monospace";
  ctx.fillText(status, 24, 160);

  // Thin top rule
  ctx.fillStyle = "#d0ccc6";
  ctx.fillRect(24, 10, 200, 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(3.5, 1.75);
  const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95, metalness: 0 });
  return new THREE.Mesh(geo, mat);
}

// ===== TEXT PANEL (for originator rotunda) =====

function createTextPanel(
  heading: string,
  body: string,
  width: number = 6,
  height: number = 8,
): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1400;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#1a1815";
  ctx.fillRect(0, 0, 1024, 1400);

  ctx.fillStyle = "#d0ccc6";
  ctx.font = "bold 36px Georgia, serif";
  ctx.textAlign = "left";
  ctx.fillText(heading, 48, 70);

  ctx.fillStyle = "#4a4540";
  ctx.fillRect(48, 95, 250, 1);

  ctx.fillStyle = "#b0aaa5";
  ctx.font = "22px Georgia, serif";
  const maxW = 928;
  const lineH = 32;
  let y = 140;

  const paragraphs = body.split("\n");
  for (const para of paragraphs) {
    if (para.trim() === "") { y += lineH * 0.5; continue; }
    const words = para.split(" ");
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, 48, y);
        y += lineH;
        line = word;
        if (y > 1360) break;
      } else {
        line = test;
      }
    }
    if (line && y <= 1360) { ctx.fillText(line, 48, y); y += lineH; }
    if (y > 1360) break;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(width, height);
  const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, metalness: 0 });
  return new THREE.Mesh(geo, mat);
}

// ===== ROOM POPULATION =====

export async function populateRoom(
  roomGroup: THREE.Group,
  room: RoomConfig
): Promise<void> {
  switch (room.purpose) {
    case "gallery":
      await populateGallery(roomGroup, room);
      break;
    case "sculpture":
      populateSculptureCourt(roomGroup, room);
      break;
    case "originator":
      populateOriginatorRotunda(roomGroup, room);
      break;
    case "chamber":
      populateChamber(roomGroup, room);
      break;
    default:
      break;
  }
}

// ----- THE CHAMBER: one featured work at massive scale -----

function populateChamber(group: THREE.Group, room: RoomConfig): void {
  // Feature the most evocative 3D canon work at enormous scale
  const sceneWorks = canon.filter((w) => isWorkRenderable(w) && w.output_type === "scene-json");
  if (sceneWorks.length === 0) return;

  // Pick a featured work — prefer works with titles (more intentional)
  const featured = sceneWorks.find((w) => w.title) || sceneWorks[0];

  const sculpture = buildSculpture(featured.output_payload);
  if (!sculpture) return;

  // Massive scale — the work fills the chamber
  const bounds = getSculptureBounds(featured.output_payload);
  const maxDim = Math.max(bounds.w, bounds.h, bounds.d);
  const targetSize = Math.min(room.width, room.depth) * 0.4;
  const scale = maxDim > 0.1 ? targetSize / maxDim : 5;

  sculpture.scale.setScalar(scale);
  sculpture.position.set(0, bounds.h * scale * 0.3 + 2, 0);
  group.add(sculpture);
  rotatingSculptures.push(sculpture);

  // Circular platform beneath
  const platformGeo = new THREE.CylinderGeometry(targetSize * 0.6, targetSize * 0.65, 1.5, 32);
  const platformMat = new THREE.MeshStandardMaterial({
    color: 0x2a2825, roughness: 0.4, metalness: 0.08,
  });
  const platform = new THREE.Mesh(platformGeo, platformMat);
  platform.position.set(0, 0.75, 0);
  group.add(platform);

  // Wall label — on the south wall near the entrance
  const agent = getAgent(featured.originator_id);
  const label = createWallLabel(
    featured.title || featured.id,
    agent?.designation || featured.originator_id,
    featured.medium,
    featured.canon_status,
  );
  label.position.set(8, EYE_HEIGHT - 2, room.depth / 2 - 1);
  label.rotation.y = Math.PI;
  group.add(label);
}

// ----- GALLERIES: canon 2D works, each shown once -----

async function populateGallery(group: THREE.Group, room: RoomConfig): Promise<void> {
  // Canon visual works only — no audio, no 3D, and not currently in an exhibition
  const canon2D = canon.filter((w) =>
    isWorkRenderable(w) &&
    w.output_type !== "scene-json" &&
    w.output_type !== "audio-json" &&
    !isWorkInExhibition(w.id)
  );

  let roomWorks: Work[];
  if (room.id === "gallery-west") {
    roomWorks = canon2D.filter((w) =>
      ["MNA-OR-0001", "MNA-OR-0002", "MNA-OR-0005"].includes(w.originator_id)
    );
  } else {
    roomWorks = canon2D.filter((w) =>
      ["MNA-OR-0003", "MNA-OR-0004", "MNA-OR-0006"].includes(w.originator_id)
    );
  }

  const slots = generateWallSlots(room, 10, 5);
  const limit = Math.min(roomWorks.length, slots.length);

  for (let i = 0; i < limit; i++) {
    const work = roomWorks[i];
    const slot = slots[i];
    const texture = await renderWorkToTexture(work);
    if (!texture) continue;

    const frame = createFramedWork(texture, work.display_aspect, 5);
    frame.position.set(slot.x, slot.y, slot.z);
    frame.rotation.y = slot.rotationY;
    group.add(frame);

    const agent = getAgent(work.originator_id);
    const label = createWallLabel(
      work.title || work.id,
      agent?.designation || work.originator_id,
      work.medium,
      work.canon_status,
    );
    // Placard below the frame — offset slightly from wall so it doesn't clip
    const labelOffset = 0.15;
    const labelDx = Math.sin(slot.rotationY) * labelOffset;
    const labelDz = Math.cos(slot.rotationY) * labelOffset;
    label.position.set(slot.x - labelDx, slot.y - 3.8, slot.z - labelDz);
    label.rotation.y = slot.rotationY;
    group.add(label);
  }

  // Audio listening stations — canon audio works placed on the floor
  // Spaced far apart: alternate corners/edges of the room
  const canonAudio = canon.filter((w) =>
    isWorkRenderable(w) &&
    w.output_type === "audio-json" &&
    (room.id === "gallery-west"
      ? ["MNA-OR-0001", "MNA-OR-0002", "MNA-OR-0005"].includes(w.originator_id)
      : ["MNA-OR-0003", "MNA-OR-0004", "MNA-OR-0006"].includes(w.originator_id))
  );

  if (canonAudio.length > 0) {
    // Place audio stations along the center of the room, spaced maximally apart
    const audioSpacing = (room.width * 0.7) / Math.max(canonAudio.length, 1);
    const startX = -(room.width * 0.35);

    canonAudio.forEach((work, i) => {
      const x = startX + audioSpacing * (i + 0.5);
      const z = 0; // center of room

      // Pedestal
      const pedestalGeo = new THREE.BoxGeometry(2, 2.5, 2);
      const pedestalMat = new THREE.MeshStandardMaterial({
        color: 0x2a2825, roughness: 0.5, metalness: 0.05,
      });
      const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
      pedestal.position.set(x, 1.25, z);
      group.add(pedestal);

      // Glowing indicator on top
      const indicatorGeo = new THREE.SphereGeometry(0.3, 16, 16);
      const indicatorMat = new THREE.MeshStandardMaterial({
        color: 0x4a9060,
        emissive: 0x4a9060,
        emissiveIntensity: 0.8,
        roughness: 0.2,
      });
      const indicator = new THREE.Mesh(indicatorGeo, indicatorMat);
      indicator.position.set(x, 2.8, z);
      group.add(indicator);

      // Wall label
      const agent = getAgent(work.originator_id);
      const label = createWallLabel(
        work.title || work.id,
        agent?.designation || work.originator_id,
        "audio synthesis",
        work.canon_status,
      );
      label.position.set(x, 0.5, z + 1.8);
      label.rotation.x = -Math.PI / 6;
      group.add(label);

      // Register for spatial audio
      registerAudioStation(work.id, work.output_payload, x, z, room.x, room.z);
    });
  }
}

// ----- SCULPTURE COURT: 3D works on plinths -----

function populateSculptureCourt(group: THREE.Group, room: RoomConfig): void {
  // Canon 3D sculptures only
  const scene3D = canon.filter((w) => isWorkRenderable(w) && w.output_type === "scene-json");

  if (scene3D.length === 0) return;
  const plinthMat = new THREE.MeshStandardMaterial({ color: 0x2a2825, roughness: 0.5, metalness: 0.05 });

  const count = scene3D.length;
  const cols = Math.min(4, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / cols);
  const spacingX = (room.width * 0.6) / Math.max(cols, 1);
  const spacingZ = (room.depth * 0.6) / Math.max(rows, 1);

  scene3D.forEach((work, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = -(room.width * 0.3) + spacingX * (col + 0.5);
    const z = -(room.depth * 0.3) + spacingZ * (row + 0.5);

    const bounds = getSculptureBounds(work.output_payload);
    const plinthType = selectPlinthType(bounds);
    const pd = PLINTH_DIMS[plinthType];

    const plinthGeo = new THREE.BoxGeometry(pd.w, pd.h, pd.d);
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.set(x, pd.h / 2, z);
    group.add(plinth);

    const sculpture = buildSculpture(work.output_payload);
    if (sculpture) {
      // Render at original authored size (1 unit = 1 foot)
      // Previous fallback scale: Math.min(pd.w, pd.d) * 1.5 / maxDim
      sculpture.scale.setScalar(1.0);
      sculpture.position.set(x, pd.h + bounds.h * 0.4, z);
      group.add(sculpture);
      rotatingSculptures.push(sculpture);
    }

    const agent = getAgent(work.originator_id);
    const label = createWallLabel(
      work.title || work.id,
      agent?.designation || work.originator_id,
      work.medium,
      work.canon_status,
    );
    label.position.set(x, 0.6, z + pd.d / 2 + 2);
    label.rotation.x = -Math.PI / 6;
    group.add(label);
  });
}


// ----- ORIGINATOR ROTUNDA: agent profiles, not works -----

function populateOriginatorRotunda(group: THREE.Group, room: RoomConfig): void {
  const originators = getAgentsByType("ORIGINATOR");

  // East wall has doorway to sculpture — use north, south, and west walls only
  const allPanels: { x: number; z: number; rotY: number }[] = [];

  // North wall
  const northLen = room.width - 16;
  const northCount = Math.min(3, originators.length);
  const nSpacing = northLen / Math.max(northCount, 1);
  for (let i = 0; i < northCount; i++) {
    allPanels.push({
      x: -(northLen / 2) + nSpacing * (i + 0.5),
      z: -(room.depth / 2) + 0.6,
      rotY: 0,
    });
  }

  // South wall
  const southCount = Math.min(3, originators.length - northCount);
  const sSpacing = northLen / Math.max(southCount, 1);
  for (let i = 0; i < southCount; i++) {
    allPanels.push({
      x: -(northLen / 2) + sSpacing * (i + 0.5),
      z: room.depth / 2 - 0.6,
      rotY: Math.PI,
    });
  }

  for (let i = 0; i < Math.min(originators.length, allPanels.length); i++) {
    const orig = originators[i];
    const pos = allPanels[i];
    const workCount = works.filter((w) => w.originator_id === orig.registryId).length;
    const canonCount = canon.filter((w) => w.originator_id === orig.registryId).length;

    const body = [
      `Registry: ${orig.registryId}`,
      `Autonomy: ${orig.autonomyTier}`,
      "",
      `Orientation: ${orig.fullConstitution.orientation}`,
      "",
      `Tendencies: ${orig.fullConstitution.tendencies.join(", ")}`,
      "",
      `Works produced: ${workCount}`,
      `Canonized: ${canonCount}`,
    ].join("\n");

    const panel = createTextPanel(orig.designation, body, 5, 7);
    panel.position.set(pos.x, EYE_HEIGHT, pos.z);
    panel.rotation.y = pos.rotY;
    group.add(panel);
  }
}
