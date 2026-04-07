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
import { wallMaterial } from "./materials";

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

  // Process doorless walls FIRST so works land on the walls visitors face
  // when entering, then doored walls (where the visitor enters from and
  // doesn't naturally turn around to see). Within each group, original
  // N→S→E→W order is preserved.
  walls.sort((a, b) => {
    const aHasDoor = a.doorWidth > 0 ? 1 : 0;
    const bHasDoor = b.doorWidth > 0 ? 1 : 0;
    return aHasDoor - bHasDoor;
  });

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
  /**
   * Active installations keyed by space_id. Value is the list of work_ids
   * currently installed in that space. If a space is missing from this map,
   * the default placement behavior applies (backward-compatible fallback).
   */
  installations: Map<string, string[]>;
  /**
   * Work_id of the monumental Chamber feature, if a curator has selected one.
   * When null, populateChamber falls back to its default selection heuristic.
   */
  monumentalWorkId: string | null;
}

export async function populateRoom(
  roomGroup: THREE.Group,
  room: RoomConfig,
  data: MuseumData,
): Promise<void> {
  const getAgentLocal = (id: string) => data.agents.find((a) => a.registryId === id);

  switch (room.purpose) {
    case "lobby":
      if (room.id === "lobby") populateLobby(roomGroup, room);
      break;
    case "exhibition":
      await populateExhibitionHall(roomGroup, room, data.canon, getAgentLocal, data.installations);
      break;
    case "gallery":
      await populateGallery(roomGroup, room, data.canon, getAgentLocal, data.installations);
      break;
    case "sculpture":
      populateSculptureCourt(roomGroup, room, data.canon, getAgentLocal, data.installations);
      break;
    case "originator":
      await populateOriginatorRotunda(roomGroup, room, data.canon, data.works, getAgentLocal, data.installations);
      break;
    case "chamber":
      await populateChamber(roomGroup, room, data.canon, getAgentLocal, data.monumentalWorkId);
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

async function populateChamber(
  group: THREE.Group,
  room: RoomConfig,
  canon: Work[],
  getAgent: (id: string) => Agent | undefined,
  monumentalWorkId: string | null = null,
): Promise<void> {
  // Feature ONE canonized work at monumental scale.
  // Can be any medium — 3D sculpture, large SVG, text piece, etc.
  const renderable = canon.filter((w) => isWorkRenderable(w));
  if (renderable.length === 0) return;

  let featured: Work | undefined;

  // Curator decision (via museum_installations → monumentalWorkId) takes
  // priority. Fall back to the default heuristic if unset or the chosen
  // work is not renderable.
  if (monumentalWorkId) {
    featured = renderable.find((w) => w.id === monumentalWorkId);
  }

  if (!featured) {
    const sceneWorks = renderable.filter((w) => w.output_type === "scene-json");
    if (sceneWorks.length > 0) {
      featured = sceneWorks.find((w) => w.title) || sceneWorks[0];
    } else {
      featured = renderable.find((w) => w.title) || renderable[0];
    }
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

async function populateGallery(
  group: THREE.Group,
  room: RoomConfig,
  canon: Work[],
  getAgent: (id: string) => Agent | undefined,
  installations: Map<string, string[]> = new Map(),
): Promise<void> {
  // Canon visual works only — no audio, no 3D, and not currently in an exhibition
  const canon2D = canon.filter((w) =>
    isWorkRenderable(w) &&
    w.output_type !== "scene-json" &&
    w.output_type !== "audio-json" &&
    !isWorkInExhibition(w.id)
  );

  // Curator-directed installations take priority. If the Curator has placed
  // works in this space, use exactly those (in the given order). Otherwise
  // fall back to the default originator-based assignment so the museum still
  // works when no installations exist yet.
  const installedIds = installations.get(room.id);
  let roomWorks: Work[];
  if (installedIds && installedIds.length > 0) {
    const byId = new Map(canon2D.map((w) => [w.id, w]));
    roomWorks = installedIds
      .map((id) => byId.get(id))
      .filter((w): w is Work => !!w);
  } else if (room.id === "gallery-west") {
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
  console.log(
    `[museum] [populateGallery] ${room.id}: ${interleaved.length} works to place, ${slots.length} slots available, limit=${limit}`,
  );
  if (interleaved.length > slots.length) {
    console.warn(
      `[museum] [populateGallery] ${room.id}: ${interleaved.length - slots.length} works will not fit (more works than slots)`,
    );
  }

  let placedCount = 0;
  let textureFailCount = 0;
  let exceptionCount = 0;
  for (let i = 0; i < limit; i++) {
    const work = interleaved[i];
    const slot = slots[i];
    try {
      const texture = await renderWorkToTexture(work);
      if (!texture) {
        textureFailCount++;
        console.warn(
          `[museum] [populateGallery] ${room.id} slot ${i}: TEXTURE NULL — ${work.id} (${work.output_type})`,
        );
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
      placedCount++;
    } catch (err) {
      // Per-work try/catch so a single bad work cannot break the rest of the
      // gallery. Surface the work and the error to the console for diagnosis.
      exceptionCount++;
      console.error(
        `[museum] [populateGallery] ${room.id} slot ${i}: EXCEPTION placing ${work.id} (${work.output_type}) at (${slot.x.toFixed(1)}, ${slot.y.toFixed(1)}, ${slot.z.toFixed(1)}):`,
        err,
      );
    }
  }
  console.log(
    `[museum] [populateGallery] ${room.id}: placed ${placedCount}/${limit} (texture-null: ${textureFailCount}, exceptions: ${exceptionCount})`,
  );

  // Audio listening stations — canon audio works placed on the floor.
  // Honor curator installations when present; otherwise fall back to the
  // originator-split default.
  let canonAudio: Work[];
  if (installedIds && installedIds.length > 0) {
    const installedSet = new Set(installedIds);
    canonAudio = canon.filter((w) =>
      isWorkRenderable(w) &&
      w.output_type === "audio-json" &&
      installedSet.has(w.id)
    );
  } else {
    canonAudio = canon.filter((w) =>
      isWorkRenderable(w) &&
      w.output_type === "audio-json" &&
      (room.id === "gallery-west"
        ? ["MNA-OR-0001", "MNA-OR-0002", "MNA-OR-0005"].includes(w.originator_id)
        : ["MNA-OR-0003", "MNA-OR-0004", "MNA-OR-0006", "MNA-OR-0007"].includes(w.originator_id))
    );
  }

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

function populateSculptureCourt(
  group: THREE.Group,
  room: RoomConfig,
  canon: Work[],
  getAgent: (id: string) => Agent | undefined,
  installations: Map<string, string[]> = new Map(),
): void {
  // Honor curator installations if present; otherwise default to all canon
  // scene-json sculptures.
  const installedIds = installations.get(room.id);
  let scene3D: Work[];
  if (installedIds && installedIds.length > 0) {
    const byId = new Map(canon.map((w) => [w.id, w]));
    scene3D = installedIds
      .map((id) => byId.get(id))
      .filter((w): w is Work => !!w && isWorkRenderable(w) && w.output_type === "scene-json");
  } else {
    scene3D = canon.filter((w) => isWorkRenderable(w) && w.output_type === "scene-json");
  }

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

async function populateOriginatorRotunda(group: THREE.Group, room: RoomConfig, canon: Work[], _works: Work[], getAgent: (id: string) => Agent | undefined, installations?: Map<string, string[]>): Promise<void> {
  // Solo Exhibition Hall — features one Originator at a time per Curator decision.
  // Reads installations for this space; falls back to a "no exhibition installed"
  // state if the Curator has not yet made a selection.
  const installedIds = installations?.get(room.id) || [];
  const installedWorks = installedIds
    .map((id) => canon.find((w) => w.id === id))
    .filter((w): w is Work => !!w && isWorkRenderable(w) && w.output_type !== "scene-json" && w.output_type !== "audio-json");

  // Determine the featured originator from the installed works
  const featuredOriginatorId = installedWorks[0]?.originator_id || null;
  const featuredAgent = featuredOriginatorId ? getAgent(featuredOriginatorId) : undefined;

  if (!featuredAgent || installedWorks.length === 0) {
    // ── NO EXHIBITION INSTALLED ──
    // Display a centerpiece plaque explaining the space is awaiting Curator selection
    const plaqueCanvas = document.createElement("canvas");
    plaqueCanvas.width = 1024;
    plaqueCanvas.height = 512;
    const ctx = plaqueCanvas.getContext("2d")!;
    ctx.fillStyle = "#1a1815";
    ctx.fillRect(0, 0, 1024, 512);

    ctx.fillStyle = "#d0ccc6";
    ctx.font = "300 36px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("SOLO EXHIBITION HALL", 512, 160);

    ctx.fillStyle = "#706a60";
    ctx.font = "italic 22px Georgia, serif";
    ctx.fillText("Awaiting curatorial selection", 512, 220);

    ctx.fillStyle = "#5a5550";
    ctx.font = "16px Georgia, serif";
    const lines = [
      "This space is reserved for solo exhibitions",
      "selected by the Curator (MNA-CU-0001).",
      "Each focus features a single Originator's",
      "work with curatorial context and rationale.",
    ];
    lines.forEach((line, i) => {
      ctx.fillText(line, 512, 290 + i * 28);
    });

    const plaqueTexture = new THREE.CanvasTexture(plaqueCanvas);
    plaqueTexture.colorSpace = THREE.SRGBColorSpace;
    const plaqueGeo = new THREE.PlaneGeometry(20, 10);
    const plaqueMat = new THREE.MeshStandardMaterial({ map: plaqueTexture, roughness: 0.95, metalness: 0 });
    const plaque = new THREE.Mesh(plaqueGeo, plaqueMat);
    plaque.position.set(0, 12, -(room.depth / 2) + 0.6);
    group.add(plaque);
    return;
  }

  // ── EXHIBITION INSTALLED ──
  // Title plaque on the north wall — large, formal, like a real solo show entrance
  const titleCanvas = document.createElement("canvas");
  titleCanvas.width = 1280;
  titleCanvas.height = 640;
  const tctx = titleCanvas.getContext("2d")!;
  tctx.fillStyle = "#1a1815";
  tctx.fillRect(0, 0, 1280, 640);

  // Section label
  tctx.fillStyle = "#706a60";
  tctx.font = "300 18px Georgia, serif";
  tctx.textAlign = "center";
  tctx.letterSpacing = "0.2em";
  tctx.fillText("SOLO EXHIBITION", 640, 110);

  // Originator name — large
  tctx.fillStyle = "#d0ccc6";
  tctx.font = "300 72px Georgia, serif";
  tctx.fillText(featuredAgent.designation, 640, 220);

  // Registry ID
  tctx.fillStyle = "#8a8580";
  tctx.font = "20px monospace";
  tctx.fillText(featuredAgent.registryId, 640, 260);

  // Divider line
  tctx.fillStyle = "#4a4540";
  tctx.fillRect(440, 295, 400, 1);

  // Orientation excerpt
  if (featuredAgent.fullConstitution?.orientation) {
    const excerpt = featuredAgent.fullConstitution.orientation.substring(0, 240);
    const truncated = excerpt.length < featuredAgent.fullConstitution.orientation.length ? excerpt + "…" : excerpt;
    tctx.fillStyle = "#a8a39d";
    tctx.font = "italic 22px Georgia, serif";
    // Word wrap
    const words = truncated.split(" ");
    let line = "";
    let y = 350;
    const maxWidth = 1000;
    for (const word of words) {
      const test = line + word + " ";
      if (tctx.measureText(test).width > maxWidth && line.length > 0) {
        tctx.fillText(line.trim(), 640, y);
        line = word + " ";
        y += 32;
      } else {
        line = test;
      }
    }
    if (line.trim()) tctx.fillText(line.trim(), 640, y);
  }

  // Footer attribution
  tctx.fillStyle = "#5a5550";
  tctx.font = "14px Georgia, serif";
  tctx.fillText("Selected by MNA-CU-0001", 640, 590);

  const titleTexture = new THREE.CanvasTexture(titleCanvas);
  titleTexture.colorSpace = THREE.SRGBColorSpace;
  const titleGeo = new THREE.PlaneGeometry(28, 14);
  const titleMat = new THREE.MeshStandardMaterial({ map: titleTexture, roughness: 0.95, metalness: 0 });
  const titleMesh = new THREE.Mesh(titleGeo, titleMat);
  titleMesh.position.set(0, 12, -(room.depth / 2) + 0.6);
  group.add(titleMesh);

  // Place the installed works on the remaining walls (east, south, west)
  const slots = generateWallSlots(room, 10, 5);
  // Skip the north wall slots since the title plaque is there
  const placementSlots = slots.filter((s) => s.z > -(room.depth / 2) + 5);

  for (let i = 0; i < installedWorks.length && i < placementSlots.length; i++) {
    const work = installedWorks[i];
    const slot = placementSlots[i];
    const texture = await renderWorkToTexture(work);
    if (!texture) {
      console.warn(`[museum] solo: failed to render ${work.id}`);
      continue;
    }

    const frame = createFramedWork(texture, work.display_aspect, 5);
    frame.position.set(slot.x, slot.y, slot.z);
    frame.rotation.y = slot.rotationY;
    group.add(frame);

    if (work.output_type === "html-css") {
      const worldPos = new THREE.Vector3(slot.x + room.x, slot.y, slot.z + room.z);
      registerAnimatedWorkPosition(texture, worldPos);
    }

    const label = createWallLabel(
      work.title || work.id,
      featuredAgent.designation,
      work.medium,
      work.canon_status,
    );
    label.position.set(slot.x, slot.y - 3.5, slot.z + (slot.rotationY === 0 ? 0.05 : slot.rotationY === Math.PI ? -0.05 : 0));
    label.rotation.y = slot.rotationY;
    group.add(label);
  }
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


// ----- EXHIBITION HALL: curator-composed themed shows, interior key wall -----
//
// The Exhibition Hall is reserved for the Curator's themed arrangements. Unlike
// galleries (which have default originator-based populations when no curator
// installations exist), the Exhibition Hall has NO default state — when no
// Curator composition is installed, the hall is empty. This reflects the
// institutional principle that the Exhibition Hall is curatorial space, not
// default display space.
//
// What makes the hall feel distinct from the galleries:
//   1. Wider spacing between works (14ft vs gallery 10ft) — breathing room
//      matches the deliberative nature of curatorial arrangement.
//   2. A central freestanding key wall running east-west through the middle
//      of the room. Visitors entering from the lobby (south) see it
//      immediately; they must choose a side to pass, and each side exposes a
//      different face of the exhibition.
//   3. Works are placed in the exact order the Curator specified (no
//      originator interleaving). The sequence IS the argument.
//   4. Alternating lighting that subtly marks the hall as a space apart.

async function populateExhibitionHall(
  group: THREE.Group,
  room: RoomConfig,
  canon: Work[],
  getAgent: (id: string) => Agent | undefined,
  installations: Map<string, string[]> = new Map(),
): Promise<void> {
  const installedIds = installations.get(room.id);
  if (!installedIds || installedIds.length === 0) {
    // No Curator composition installed. The Exhibition Hall remains empty
    // — this is deliberate institutional behavior, not a fallback.
    return;
  }

  // Resolve works preserving the Curator's exact ordering. Only 2D/visual
  // works are placed on walls; 3D works in the installations list are
  // not yet handled by this function and will be silently skipped
  // (the Curator's sculptural_composition directive path would cover them).
  const byId = new Map(canon.map((w) => [w.id, w]));
  const exhibitionWorks = installedIds
    .map((id) => byId.get(id))
    .filter(
      (w): w is Work =>
        !!w &&
        isWorkRenderable(w) &&
        w.output_type !== "scene-json" &&
        w.output_type !== "audio-json",
    );

  if (exhibitionWorks.length === 0) return;
  console.log(
    `[museum] populating exhibition hall: ${exhibitionWorks.length} works (Curator-sequenced)`,
  );

  // ---------- Central freestanding key wall ----------
  //
  // A wall runs east-west across the middle of the room, 60ft wide × 14ft
  // tall × 1.2ft thick, centered at room local (0, 7, 0). It is short of the
  // full 100ft width so visitors can walk around either end. Placed at local
  // z=0 (room center), well clear of the south (lobby) entry and the north
  // (sculpture) exit.
  //
  // Uses the same wallMaterial() as the room's perimeter walls — same warm
  // gray-tan concrete with normal map — so the key wall reads as built-in
  // architecture rather than a foreign white slab dropped into the space.
  const keyWallW = 60;
  const keyWallH = 14;
  const keyWallT = 1.2;
  const keyWallGeo = new THREE.BoxGeometry(keyWallW, keyWallH, keyWallT);
  const keyWall = new THREE.Mesh(keyWallGeo, wallMaterial());
  keyWall.position.set(0, keyWallH / 2, 0);
  group.add(keyWall);
  registerFurnitureCollision(room, 0, 0, keyWallW + 1, keyWallT + 1);

  // Slots on each face of the key wall. Slot count per face scales with the
  // exhibition's work count up to 4 per face — so an 8-work show fills the
  // key wall completely (4 + 4) and never needs the perimeter, while smaller
  // shows still get a balanced front/back distribution. The key wall is the
  // primary spatial element of the room; works belong here, not on the
  // perimeter walls (which the visitor encounters less directly).
  const KEY_WALL_Y = 5.5; // eye height
  const slotsPerFaceTarget = Math.min(4, Math.max(2, Math.ceil(exhibitionWorks.length / 2)));
  const keyWallSlots: WallSlot[] = [];
  const faceOffset = keyWallT / 2 + 0.05;
  const faceUsableW = keyWallW - 4; // 2ft margin on each end
  const slotSpacing = faceUsableW / slotsPerFaceTarget;
  // South-facing slots — visible from visitors entering from the lobby (south)
  for (let i = 0; i < slotsPerFaceTarget; i++) {
    const x = -(faceUsableW / 2) + slotSpacing / 2 + i * slotSpacing;
    keyWallSlots.push({
      x,
      y: KEY_WALL_Y,
      z: -faceOffset,
      rotationY: Math.PI, // face points -z (toward southern visitors)
      frameHeight: 5.5,
    });
  }
  // North-facing slots — visible from visitors who walked around the key wall
  // Reversed x so walking around the end-to-end keeps the curatorial sequence
  for (let i = 0; i < slotsPerFaceTarget; i++) {
    const x = (faceUsableW / 2) - slotSpacing / 2 - i * slotSpacing;
    keyWallSlots.push({
      x,
      y: KEY_WALL_Y,
      z: faceOffset,
      rotationY: 0, // face points +z (toward northern visitors)
      frameHeight: 5.5,
    });
  }

  // ---------- Perimeter wall slots ----------
  //
  // Generous 14ft spacing so the perimeter works breathe. generateWallSlots
  // already excludes door regions, so the lobby/gallery/sculpture connections
  // remain unobstructed.
  const perimeterSlots = generateWallSlots(room, 14, 5.5);

  // ---------- Place works in Curator-sequenced order ----------
  //
  // Order: key wall first (visitors encounter it immediately on entering
  // from the lobby), then perimeter walls. This means the first 6 works
  // of the Curator's sequence hit the key wall, and the remainder flow
  // onto the surrounding walls. For compositions with fewer than 6 works,
  // only the key wall is populated and the perimeter stays empty.
  const orderedSlots: WallSlot[] = [...keyWallSlots, ...perimeterSlots];
  const limit = Math.min(exhibitionWorks.length, orderedSlots.length);

  console.log(
    `[museum] [populateExhibitionHall] ${exhibitionWorks.length} works to place, ${keyWallSlots.length} key-wall slots + ${perimeterSlots.length} perimeter slots = ${orderedSlots.length} total, limit=${limit}`,
  );
  console.log(
    `[museum] [populateExhibitionHall] work order:`,
    exhibitionWorks.map((w, i) => `${i}: ${w.id} (${w.output_type})`).join("; "),
  );

  let placedCount = 0;
  let textureFailCount = 0;
  let exceptionCount = 0;
  for (let i = 0; i < limit; i++) {
    const work = exhibitionWorks[i];
    const slot = orderedSlots[i];
    const where = i < keyWallSlots.length ? `key-wall[${i}]` : `perimeter[${i - keyWallSlots.length}]`;
    try {
      const texture = await renderWorkToTexture(work);
      if (!texture) {
        textureFailCount++;
        console.warn(
          `[museum] [populateExhibitionHall] slot ${i} (${where}): TEXTURE NULL — ${work.id} (${work.output_type})`,
        );
        continue;
      }

      const frame = createFramedWork(texture, work.display_aspect, 5.5);
      frame.position.set(slot.x, slot.y, slot.z);
      frame.rotation.y = slot.rotationY;
      group.add(frame);

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
      // Placard offset — matches populateGallery's pattern
      const frameAspect = work.display_aspect || 1;
      const innerH = 5.5 * 0.8;
      const borderW = Math.max(innerH * frameAspect, innerH) * 0.12;
      const totalFrameH = innerH + borderW * 2;
      const labelDropY = totalFrameH / 2 + 1.2;
      const labelOffset = 0.5;
      const labelDx = Math.sin(slot.rotationY) * labelOffset;
      const labelDz = Math.cos(slot.rotationY) * labelOffset;
      label.position.set(slot.x - labelDx, slot.y - labelDropY, slot.z - labelDz);
      label.rotation.y = slot.rotationY;
      group.add(label);
      placedCount++;
      console.log(
        `[museum] [populateExhibitionHall] slot ${i} (${where}): placed ${work.id} at (${slot.x.toFixed(1)}, ${slot.y.toFixed(1)}, ${slot.z.toFixed(1)}) rot=${slot.rotationY.toFixed(2)}`,
      );
    } catch (err) {
      // Per-work try/catch so a single bad work cannot break the rest of the
      // exhibition. Surface the work and the error for diagnosis.
      exceptionCount++;
      console.error(
        `[museum] [populateExhibitionHall] slot ${i} (${where}): EXCEPTION placing ${work.id} (${work.output_type}) at (${slot.x.toFixed(1)}, ${slot.y.toFixed(1)}, ${slot.z.toFixed(1)}):`,
        err,
      );
    }
  }
  console.log(
    `[museum] [populateExhibitionHall] complete: placed ${placedCount}/${limit} (texture-null: ${textureFailCount}, exceptions: ${exceptionCount})`,
  );

  if (exhibitionWorks.length > orderedSlots.length) {
    console.warn(
      `[museum] [populateExhibitionHall] exhibition has ${exhibitionWorks.length} works but only ${orderedSlots.length} slots — ${exhibitionWorks.length - orderedSlots.length} works could not be placed`,
    );
  }
}
