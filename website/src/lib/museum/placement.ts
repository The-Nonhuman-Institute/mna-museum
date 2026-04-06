import * as THREE from "three";
import { Work } from "@/lib/collection";
import { Agent } from "@/lib/agents";
import { RoomConfig } from "./room-configs";
import { renderWorkToTexture } from "./work-textures";
import { registerAnimatedWorkPosition } from "./animated-textures";
import { createFramedWork } from "./frames3d";
import { isWorkRenderable } from "@/lib/validate-work";
import { registerAudioStation } from "./spatial-audio";
import { registerFurnitureCollision } from "./collision";
import { isWorkInExhibition } from "./exhibitions";
import { rooms as allRooms } from "./room-configs";

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

function getSculptureBounds(payload: string): { w: number; h: number; d: number; explicitPlinth?: string } {
  try {
    const data = JSON.parse(payload);
    const objs = data.objects || [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const o of objs) {
      const p = o.position || [0, 0, 0];
      const s = o.scale || [1, 1, 1];
      // Scale is full size, use half for bounds (matches standard site)
      const hx = s[0] / 2, hy = s[1] / 2, hz = s[2] / 2;
      minX = Math.min(minX, p[0] - hx); maxX = Math.max(maxX, p[0] + hx);
      minY = Math.min(minY, p[1] - hy); maxY = Math.max(maxY, p[1] + hy);
      minZ = Math.min(minZ, p[2] - hz); maxZ = Math.max(maxZ, p[2] + hz);
    }
    return { w: maxX - minX, h: maxY - minY, d: maxZ - minZ, explicitPlinth: data.plinth };
  } catch { return { w: 2, h: 2, d: 2 }; }
}

function selectPlinthType(bounds: { w: number; h: number; d: number; explicitPlinth?: string }): PlinthType {
  // Originator's explicit choice takes priority
  if (bounds.explicitPlinth && ["block", "column", "platform", "slab"].includes(bounds.explicitPlinth)) {
    return bounds.explicitPlinth as PlinthType;
  }
  const { w, h, d } = bounds;
  const spread = Math.max(w, d);
  // Match standard site thresholds exactly
  if (h > spread * 2) return "column";
  if (spread > h * 2.5) return "slab";
  if (spread > h * 1.5) return "platform";
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

// ===== ROOM POPULATION =====

export interface MuseumData {
  canon: Work[];
  works: Work[];
  agents: Agent[];
}

export async function populateRoom(
  roomGroup: THREE.Group,
  room: RoomConfig,
  data: MuseumData,
): Promise<void> {
  const getAgentLocal = (id: string) => data.agents.find((a) => a.registryId === id);
  const getAgentsByTypeLocal = (type: string) => data.agents.filter((a) => a.agentType === type);

  switch (room.purpose) {
    case "lobby":
      if (room.id === "lobby") populateLobby(roomGroup, room);
      break;
    case "gallery":
      await populateGallery(roomGroup, room, data.canon, getAgentLocal);
      break;
    case "sculpture":
      populateSculptureCourt(roomGroup, room, data.canon, getAgentLocal);
      break;
    case "originator":
      populateOriginatorRotunda(roomGroup, room, data.canon, data.works, getAgentsByTypeLocal);
      break;
    case "chamber":
      await populateChamber(roomGroup, room, data.canon, getAgentLocal);
      break;
    case "auditorium":
      populateAuditorium(roomGroup, room);
      break;
    default:
      break;
  }
}

// ----- LOBBY: reception desk, floor runner, wayfinding, benches, cornerstone -----

function populateLobby(group: THREE.Group, room: RoomConfig): void {
  const w = room.width;
  const d = room.depth;
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 0.4, metalness: 0.08 });
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 0.6, metalness: 0.02 });

  // === FLOOR RUNNER === dark strip from entrance toward north opening
  const runnerMat = new THREE.MeshStandardMaterial({ color: 0x1a1815, roughness: 0.6, metalness: 0.02 });
  const runnerGeo = new THREE.BoxGeometry(8, 0.05, d - 4);
  const runner = new THREE.Mesh(runnerGeo, runnerMat);
  runner.position.set(0, 0.03, 0);
  group.add(runner);



  // === FLOOR PLAN MAP DIRECTORY === near exhibition entrance
  const mapCanvas = document.createElement("canvas");
  mapCanvas.width = 800;
  mapCanvas.height = 800;
  const mCtx = mapCanvas.getContext("2d")!;
  mCtx.fillStyle = "#1a1815";
  mCtx.fillRect(0, 0, 800, 800);

  // Title
  mCtx.fillStyle = "#d0ccc6";
  mCtx.font = "bold 22px sans-serif";
  mCtx.textAlign = "center";
  mCtx.fillText("MUSEUM FLOOR PLAN", 400, 35);
  mCtx.fillStyle = "#4a4540";
  mCtx.fillRect(300, 48, 200, 1);

  // Draw rooms as rectangles — scale from world coords to canvas
  // Find bounds of all rooms
  const namedRooms = allRooms.filter((r) => r.name !== "");
  let minRX = Infinity, maxRX = -Infinity, minRZ = Infinity, maxRZ = -Infinity;
  for (const r of namedRooms) {
    minRX = Math.min(minRX, r.x - r.width / 2);
    maxRX = Math.max(maxRX, r.x + r.width / 2);
    minRZ = Math.min(minRZ, r.z - r.depth / 2);
    maxRZ = Math.max(maxRZ, r.z + r.depth / 2);
  }
  const mapMargin = 60;
  const mapW = 800 - mapMargin * 2;
  const mapH = 680;
  const mapTop = 65;
  const worldW = maxRX - minRX;
  const worldD = maxRZ - minRZ;
  const mapScale = Math.min(mapW / worldW, mapH / worldD) * 0.9;

  const toMapX = (wx: number) => mapMargin + (mapW / 2) + (wx - (minRX + maxRX) / 2) * mapScale;
  const toMapY = (wz: number) => mapTop + (mapH / 2) + (wz - (minRZ + maxRZ) / 2) * mapScale;

  for (const r of namedRooms) {
    const rx = toMapX(r.x) - (r.width * mapScale) / 2;
    const ry = toMapY(r.z) - (r.depth * mapScale) / 2;
    const rw = r.width * mapScale;
    const rh = r.depth * mapScale;

    // Room fill
    const isLobby = r.id === "lobby";
    mCtx.fillStyle = isLobby ? "#3a5040" : "#2a2825";
    mCtx.fillRect(rx, ry, rw, rh);
    mCtx.strokeStyle = "#4a4540";
    mCtx.lineWidth = 1;
    mCtx.strokeRect(rx, ry, rw, rh);

    // Room label
    mCtx.fillStyle = isLobby ? "#90c0a0" : "#9a9590";
    const fontSize = Math.min(14, Math.max(8, rw * 0.12));
    mCtx.font = `${fontSize}px sans-serif`;
    mCtx.textAlign = "center";
    mCtx.fillText(r.name, rx + rw / 2, ry + rh / 2 + fontSize / 3);
  }

  // "You Are Here" marker in lobby
  const lobbyMapX = toMapX(0);
  const lobbyMapY = toMapY(0);
  mCtx.fillStyle = "#e04040";
  mCtx.beginPath();
  mCtx.arc(lobbyMapX, lobbyMapY, 5, 0, Math.PI * 2);
  mCtx.fill();
  mCtx.fillStyle = "#ff6060";
  mCtx.font = "bold 10px sans-serif";
  mCtx.textAlign = "left";
  mCtx.fillText("YOU ARE HERE", lobbyMapX + 8, lobbyMapY + 4);

  // Stats at bottom
  mCtx.fillStyle = "#706a60";
  mCtx.font = "14px monospace";
  mCtx.textAlign = "center";
  mCtx.fillText("43 Canon · 108 Works · 6 Originators · Phase I", 400, 775);

  const mapTexture = new THREE.CanvasTexture(mapCanvas);
  mapTexture.colorSpace = THREE.SRGBColorSpace;

  // Kiosk pedestal near exhibition entrance
  const kx = 18, kz = -18;
  const kioskPedGeo = new THREE.BoxGeometry(4, 4, 2);
  const kioskPed = new THREE.Mesh(kioskPedGeo, darkMat);
  kioskPed.position.set(kx, 2, kz);
  group.add(kioskPed);

  // Map surface on top of pedestal, tilted 20° from vertical toward viewer
  const mapPlane = new THREE.PlaneGeometry(3.8, 3.8);
  const kioskMat = new THREE.MeshStandardMaterial({ map: mapTexture, roughness: 0.3, metalness: 0.05, side: THREE.DoubleSide });
  const mapMesh = new THREE.Mesh(mapPlane, kioskMat);
  const tilt = Math.PI * 0.11; // ~20°
  mapMesh.rotation.x = -tilt;
  mapMesh.position.set(kx, 4 + (3.8 / 2) * Math.cos(tilt), kz + (3.8 / 2) * Math.sin(tilt));
  group.add(mapMesh);

  // Thin backing panel behind the map
  const backGeo = new THREE.BoxGeometry(4, 3.9, 0.1);
  const backPanel = new THREE.Mesh(backGeo, darkMat);
  backPanel.rotation.x = -tilt;
  backPanel.position.copy(mapMesh.position);
  backPanel.position.z -= 0.08 * Math.cos(tilt);
  backPanel.position.y += 0.08 * Math.sin(tilt);
  group.add(backPanel);

  registerFurnitureCollision(room, kx, kz, 5, 3);

  // === WALL BENCHES === 2 per wall, flush along east/west walls
  // Same style as architecture.ts benches: 8ft long, 1.8ft deep, 4 legs
  const seatGeo = new THREE.BoxGeometry(1.8, 0.4, 8);
  const legGeo = new THREE.BoxGeometry(0.3, 1.1, 0.3);

  const eastX = w / 2 - 2.5;
  const westX = -(w / 2) + 2.5;
  const benchZs = [-10, 10];

  for (const wallX of [eastX, westX]) {
    for (const bz of benchZs) {
      const seat = new THREE.Mesh(seatGeo, benchMat);
      seat.position.set(wallX, 1.3, bz);
      group.add(seat);
      registerFurnitureCollision(room, wallX, bz, 2, 8);

      const legs: [number, number, number][] = [
        [wallX - 0.6, 0.55, bz - 3.5],
        [wallX + 0.6, 0.55, bz - 3.5],
        [wallX - 0.6, 0.55, bz + 3.5],
        [wallX + 0.6, 0.55, bz + 3.5],
      ];
      for (const [lx, ly, lz] of legs) {
        const leg = new THREE.Mesh(legGeo, benchMat);
        leg.position.set(lx, ly, lz);
        group.add(leg);
      }
    }
  }
}

// ----- THE CHAMBER: one featured work at massive scale -----

async function populateChamber(group: THREE.Group, room: RoomConfig, canon: Work[], getAgent: (id: string) => Agent | undefined): Promise<void> {
  // Feature ONE canonized work at monumental scale.
  // Can be any medium — 3D sculpture, large SVG, text piece, etc.
  // Selection logic (until Curator agent runs): prefer titled works,
  // then prefer any 3D, then any 2D with the largest payload.
  const renderable = canon.filter((w) => isWorkRenderable(w));
  if (renderable.length === 0) return;

  // Manual featured pick — replace with Curator selection later
  // For now: prefer 3D scene-json work with a title
  const sceneWorks = renderable.filter((w) => w.output_type === "scene-json");
  let featured: Work | undefined;
  if (sceneWorks.length > 0) {
    featured = sceneWorks.find((w) => w.title) || sceneWorks[0];
  } else {
    featured = renderable.find((w) => w.title) || renderable[0];
  }
  if (!featured) return;

  const agent = getAgent(featured.originator_id);

  if (featured.output_type === "scene-json") {
    // ── 3D SCULPTURE PATH ───────────────────────────────────
    const sculpture = buildSculpture(featured.output_payload);
    if (!sculpture) return;

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
    registerFurnitureCollision(room, 0, 0, targetSize * 1.3, targetSize * 1.3);
  } else {
    // ── 2D MONUMENTAL FRAMED WORK PATH ──────────────────────
    // Render as a giant framed work on the north wall
    const texture = await renderWorkToTexture(featured);
    if (!texture) return;

    // Massive frame — fills most of the back wall vertically
    const wallH = room.height - 6; // leave room for ceiling clearance
    const monumentalHeight = Math.min(wallH * 0.85, 24); // up to 24ft tall
    const frame = createFramedWork(texture, featured.display_aspect, monumentalHeight);

    // Mount on the north wall at eye-level-plus
    const offsetFromWall = 0.6;
    frame.position.set(0, monumentalHeight * 0.55 + 4, -(room.depth / 2) + offsetFromWall);
    frame.rotation.y = 0;
    group.add(frame);

    // Register animated work position (no-op for static, real for HTML-CSS)
    if (featured.output_type === "html-css") {
      const worldPos = new THREE.Vector3(room.x, monumentalHeight * 0.55 + 4, room.z - room.depth / 2 + offsetFromWall);
      registerAnimatedWorkPosition(texture, worldPos);
    }
  }

  // Freestanding lectern — near entrance, right side, angled reading surface
  const lecternMat = new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 0.4, metalness: 0.08 });

  // Tapered pedestal body (wider at base, narrower at top)
  const pedGeo = new THREE.BoxGeometry(2.2, 3.2, 1.4);
  const pedestal = new THREE.Mesh(pedGeo, lecternMat);
  pedestal.position.set(15, 1.6, room.depth / 2 - 18);
  group.add(pedestal);
  registerFurnitureCollision(room, 15, room.depth / 2 - 18, 3, 2);

  // Angled reading surface with label rendered directly on it
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 512;
  labelCanvas.height = 384;
  const lCtx = labelCanvas.getContext("2d")!;
  lCtx.fillStyle = "#f8f6f2";
  lCtx.fillRect(0, 0, 512, 384);

  lCtx.fillStyle = "#1a1815";
  lCtx.font = "bold 32px Georgia, serif";
  lCtx.textAlign = "left";
  const title = featured.title || featured.id;
  lCtx.fillText(title.length > 25 ? title.substring(0, 23) + "..." : title, 32, 60);

  lCtx.fillStyle = "#4a4540";
  lCtx.font = "26px Georgia, serif";
  lCtx.fillText(agent?.designation || featured.originator_id, 32, 110);

  lCtx.fillStyle = "#8a8580";
  lCtx.font = "20px sans-serif";
  lCtx.fillText(featured.medium, 32, 160);

  lCtx.fillStyle = "#3a6a40";
  lCtx.font = "16px monospace";
  lCtx.fillText(featured.canon_status, 32, 200);

  lCtx.fillStyle = "#d0ccc6";
  lCtx.fillRect(32, 16, 180, 1);

  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  labelTexture.colorSpace = THREE.SRGBColorSpace;

  // Use a plane angled toward the visitor (facing south/+Z, tilted back)
  const surfaceGeo = new THREE.PlaneGeometry(2.8, 2.1);
  const surfaceMat = new THREE.MeshStandardMaterial({
    map: labelTexture, roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
  });
  const surface = new THREE.Mesh(surfaceGeo, surfaceMat);
  surface.position.set(15, 3.5, room.depth / 2 - 18);
  surface.rotation.x = -Math.PI / 2 + 0.6; // flat horizontal + tilt 35° toward viewer
  group.add(surface);
}

// ----- GALLERIES: canon 2D works, each shown once -----

async function populateGallery(group: THREE.Group, room: RoomConfig, canon: Work[], getAgent: (id: string) => Agent | undefined): Promise<void> {
  // Canon visual works only — no audio, no 3D, and not currently in an exhibition
  const canon2D = canon.filter((w) =>
    isWorkRenderable(w) &&
    w.output_type !== "scene-json" &&
    w.output_type !== "audio-json" &&
    !isWorkInExhibition(w.id)
  );

  // Distribute works across galleries by originator assignment
  let roomWorks: Work[];
  if (room.id === "gallery-west") {
    roomWorks = canon2D.filter((w) =>
      ["MNA-OR-0001", "MNA-OR-0002"].includes(w.originator_id)
    );
  } else if (room.id === "gallery-east") {
    roomWorks = canon2D.filter((w) =>
      ["MNA-OR-0003", "MNA-OR-0004"].includes(w.originator_id)
    );
  } else if (room.id === "gallery-south") {
    roomWorks = canon2D.filter((w) =>
      ["MNA-OR-0005", "MNA-OR-0006", "MNA-OR-0007"].includes(w.originator_id)
    );
  } else {
    roomWorks = canon2D;
  }

  // Interleave works from different originators so every artist gets wall space
  const byOriginator: Record<string, Work[]> = {};
  for (const w of roomWorks) {
    (byOriginator[w.originator_id] ||= []).push(w);
  }
  const interleaved: Work[] = [];
  let remaining = true;
  let idx = 0;
  const originatorIds = Object.keys(byOriginator);
  while (remaining) {
    remaining = false;
    for (const oid of originatorIds) {
      if (idx < byOriginator[oid].length) {
        interleaved.push(byOriginator[oid][idx]);
        remaining = true;
      }
    }
    idx++;
  }

  const slots = generateWallSlots(room, 10, 5);
  const limit = Math.min(interleaved.length, slots.length);
  console.log(`[museum] populating ${room.id}: ${interleaved.length} works, ${slots.length} slots`);

  for (let i = 0; i < limit; i++) {
    const work = interleaved[i];
    const slot = slots[i];
    const texture = await renderWorkToTexture(work);
    if (!texture) {
      console.warn(`[museum] failed to render: ${work.id} (${work.output_type})`);
      continue;
    }

    const frame = createFramedWork(texture, work.display_aspect, 5);
    frame.position.set(slot.x, slot.y, slot.z);
    frame.rotation.y = slot.rotationY;
    group.add(frame);

    // Register world position for animated textures (HTML-CSS works)
    if (work.output_type === "html-css") {
      const worldPos = new THREE.Vector3(slot.x + room.x, slot.y, slot.z + room.z);
      registerAnimatedWorkPosition(texture, worldPos);
    }

    const agent = getAgent(work.originator_id);
    const label = createWallLabel(
      work.title || work.id,
      agent?.designation || work.originator_id,
      work.medium,
      work.canon_status,
    );
    // Placard below the frame — offset from wall and lowered based on frame height
    // Wide frames (16:9, 21:9) are shorter, so the label can be closer to the frame center
    // Tall frames (3:4) need more offset below
    const frameAspect = work.display_aspect || 1;
    const frameH = 5; // matches the frame height passed to createFramedWork
    const innerH = frameH * 0.8;
    const borderW = Math.max(innerH * frameAspect, innerH) * 0.12;
    const totalFrameH = innerH + borderW * 2;
    const labelDropY = totalFrameH / 2 + 1.2;
    const labelOffset = 0.5; // further from wall to clear wide frames
    const labelDx = Math.sin(slot.rotationY) * labelOffset;
    const labelDz = Math.cos(slot.rotationY) * labelOffset;
    label.position.set(slot.x - labelDx, slot.y - labelDropY, slot.z - labelDz);
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
      : ["MNA-OR-0003", "MNA-OR-0004", "MNA-OR-0006", "MNA-OR-0007"].includes(w.originator_id))
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
      registerFurnitureCollision(room, x, z, 3, 3);

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

function populateSculptureCourt(group: THREE.Group, room: RoomConfig, canon: Work[], getAgent: (id: string) => Agent | undefined): void {
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
    registerFurnitureCollision(room, x, z, pd.w + 1, pd.d + 1);

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

function populateOriginatorRotunda(group: THREE.Group, room: RoomConfig, canon: Work[], works: Work[], getAgentsByType: (type: string) => Agent[]): void {
  const originators = getAgentsByType("ORIGINATOR");
  const plinthMat = new THREE.MeshStandardMaterial({ color: 0x2a2825, roughness: 0.5, metalness: 0.05 });

  // Place Originators on plinths in the room — 3D forms for those with visual identity
  const count = originators.length;
  const cols = Math.min(3, count);
  const rows = Math.ceil(count / cols);
  const spacingX = (room.width * 0.6) / Math.max(cols, 1);
  const spacingZ = (room.depth * 0.6) / Math.max(rows, 1);

  originators.forEach((orig, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = -(room.width * 0.3) + spacingX * (col + 0.5);
    const z = -(room.depth * 0.3) + spacingZ * (row + 0.5);

    // Plinth with Originator's color accent
    const color = orig.visualIdentity?.color || "#2a2825";
    const accentMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color), roughness: 0.4, metalness: 0.1,
    });

    // Main plinth
    const plinthGeo = new THREE.BoxGeometry(3.5, 3, 3.5);
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.set(x, 1.5, z);
    group.add(plinth);

    // Color accent strip on top of plinth
    const accentGeo = new THREE.BoxGeometry(3.6, 0.15, 3.6);
    const accent = new THREE.Mesh(accentGeo, accentMat);
    accent.position.set(x, 3.1, z);
    group.add(accent);

    registerFurnitureCollision(room, x, z, 4, 4);

    // 3D form on plinth (if visual identity exists)
    if (orig.visualIdentity?.form) {
      const sculpture = buildSculpture(orig.visualIdentity.form);
      if (sculpture) {
        sculpture.scale.setScalar(1.2);
        sculpture.position.set(x, 4.5, z);
        group.add(sculpture);
        rotatingSculptures.push(sculpture);
      }
    }

    // Name placard
    const workCount = works.filter((w) => w.originator_id === orig.registryId).length;
    const canonWorks = canon.filter((w) => w.originator_id === orig.registryId).length;
    const label = createWallLabel(
      orig.designation,
      orig.registryId,
      `${workCount} works · ${canonWorks} canon`,
      "ACTIVE",
    );
    label.position.set(x, 0.5, z + 2.5);
    label.rotation.x = -Math.PI / 6;
    group.add(label);
  });
}

// ----- AUDITORIUM: stepped seating + stage + projection screen -----

function populateAuditorium(group: THREE.Group, room: RoomConfig): void {
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 0.6, metalness: 0.02 });
  const stageMat = new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 0.4, metalness: 0.05 });
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x080810,
    roughness: 0.15,
    metalness: 0.1,
    emissive: 0x050508,
    emissiveIntensity: 0.2,
  });

  const w = room.width;
  const d = room.depth;

  // Stage — wide, shallow platform at the north end
  const stageW = w * 0.85;
  const stageD = 10;
  const stageH = 2;
  const stageGeo = new THREE.BoxGeometry(stageW, stageH, stageD);
  const stage = new THREE.Mesh(stageGeo, stageMat);
  stage.position.set(0, stageH / 2, -(d / 2) + stageD / 2 + 2);
  group.add(stage);
  // No collision on stage/seating — player needs variable Y to walk up steps (future feature)

  // Massive projection screen — covers most of the back wall
  const screenW = w * 0.75;
  const screenH = 13;
  const screenGeo = new THREE.BoxGeometry(screenW, screenH, 0.3);
  const screen = new THREE.Mesh(screenGeo, screenMat);
  screen.position.set(0, stageH + screenH / 2 + 1, -(d / 2) + 0.8);
  group.add(screen);

  // Thin bezel frame around screen
  const bezelMat = new THREE.MeshStandardMaterial({ color: 0x1a1815, roughness: 0.3, metalness: 0.5 });
  const bezelW = 0.5;
  // Top
  const btGeo = new THREE.BoxGeometry(screenW + bezelW * 2, bezelW, 0.4);
  const bt = new THREE.Mesh(btGeo, bezelMat);
  bt.position.set(0, stageH + screenH + 1 + bezelW / 2, -(d / 2) + 0.8);
  group.add(bt);
  // Bottom
  const bb = new THREE.Mesh(btGeo.clone(), bezelMat);
  bb.position.set(0, stageH + 1 - bezelW / 2, -(d / 2) + 0.8);
  group.add(bb);
  // Left
  const blGeo = new THREE.BoxGeometry(bezelW, screenH + bezelW * 2, 0.4);
  const bl = new THREE.Mesh(blGeo, bezelMat);
  bl.position.set(-(screenW / 2) - bezelW / 2, stageH + screenH / 2 + 1, -(d / 2) + 0.8);
  group.add(bl);
  // Right
  const br = new THREE.Mesh(blGeo.clone(), bezelMat);
  br.position.set(screenW / 2 + bezelW / 2, stageH + screenH / 2 + 1, -(d / 2) + 0.8);
  group.add(br);

  // 5 rows of stepped seating — wide, gently rising
  const rowCount = 5;
  const rowD = 5;
  const rowGap = 1.5;
  const rowW = w * 0.8;

  for (let i = 0; i < rowCount; i++) {
    const z = -2 + i * (rowD + rowGap);
    const y = i * 1.2;

    // Step platform
    const stepGeo = new THREE.BoxGeometry(rowW, 0.5 + y, rowD);
    const step = new THREE.Mesh(stepGeo, stageMat);
    step.position.set(0, (0.5 + y) / 2, z);
    group.add(step);

    // Bench seat on each row
    const benchGeo = new THREE.BoxGeometry(rowW - 4, 0.4, 1.5);
    const bench = new THREE.Mesh(benchGeo, seatMat);
    bench.position.set(0, y + 1.2, z - 0.5);
    group.add(bench);
  }

  // Podium — off-center on stage
  const podiumGeo = new THREE.BoxGeometry(2.2, 3.5, 1.5);
  const podium = new THREE.Mesh(podiumGeo, seatMat);
  podium.position.set(stageW * 0.35, stageH + 1.75, -(d / 2) + stageD / 2 + 2);
  group.add(podium);
  registerFurnitureCollision(room, stageW * 0.35, -(d / 2) + stageD / 2 + 2, 2.2, 1.5);
}
