import * as THREE from "three";
import { RoomConfig } from "./room-configs";
import { registerFurnitureCollision } from "./collision";
// BufferGeometryUtils removed — not needed since we add meshes directly

// Architectural detail — baseboards, crown molding, benches, door frames,
// floor borders, track lighting rails, lantern pedestals.
// All geometry merged per room into single draw calls for performance.

const BASEBOARD_HEIGHT = 0.6;
const BASEBOARD_DEPTH = 0.15;
const CROWN_HEIGHT = 0.3;
const CROWN_DEPTH = 0.12;

// Materials (shared, created once)
let _trim: THREE.MeshStandardMaterial | null = null;
let _bench: THREE.MeshStandardMaterial | null = null;
let _track: THREE.MeshStandardMaterial | null = null;
let _lantern: THREE.MeshStandardMaterial | null = null;
let _lanternGlow: THREE.MeshStandardMaterial | null = null;
let _floorBorder: THREE.MeshStandardMaterial | null = null;

function trimMat(): THREE.MeshStandardMaterial {
  if (!_trim) _trim = new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 0.7, metalness: 0.05 });
  return _trim;
}
function benchMat(): THREE.MeshStandardMaterial {
  if (!_bench) _bench = new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 0.6, metalness: 0.02 });
  return _bench;
}
function trackMat(): THREE.MeshStandardMaterial {
  if (!_track) _track = new THREE.MeshStandardMaterial({ color: 0x2a2825, roughness: 0.4, metalness: 0.3 });
  return _track;
}
function lanternMat(): THREE.MeshStandardMaterial {
  if (!_lantern) _lantern = new THREE.MeshStandardMaterial({ color: 0x2a2520, roughness: 0.5, metalness: 0.05 });
  return _lantern;
}
function lanternGlowMat(): THREE.MeshStandardMaterial {
  if (!_lanternGlow) _lanternGlow = new THREE.MeshStandardMaterial({
    color: 0xffaa55, emissive: 0xffaa55, emissiveIntensity: 0.5, roughness: 0.3, metalness: 0,
  });
  return _lanternGlow;
}
function floorBorderMat(): THREE.MeshStandardMaterial {
  if (!_floorBorder) _floorBorder = new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 0.3, metalness: 0.05 });
  return _floorBorder;
}

function hasDoor(room: RoomConfig, wall: string): boolean {
  return room.connections.some((c) => c.wall === wall);
}

function getDoorWidth(room: RoomConfig, wall: string): number {
  const conn = room.connections.find((c) => c.wall === wall);
  return conn ? conn.width : 0;
}

export function addArchitecturalDetail(group: THREE.Group, room: RoomConfig): void {
  const isCorridor = room.name === "";

  // Skip minimal detail for thresholds
  if (isCorridor && room.depth <= 10) {
    return;
  }

  // === BASEBOARDS === dark strip at floor/wall junction
  addBaseboards(group, room);

  // === CROWN MOLDING === strip at ceiling/wall junction
  addCrownMolding(group, room);

  // === FLOOR BORDER === darker perimeter strip
  addFloorBorder(group, room);

  // === DOOR FRAMES === trim around doorway openings
  addDoorFrames(group, room);

  // === TRACK LIGHTING RAILS === thin dark rails on ceiling
  if (!isCorridor) {
    addTrackRails(group, room);
  }

  // === BENCHES === in named gallery rooms
  if (room.purpose === "gallery" || room.purpose === "exhibition") {
    addBenches(group, room);
  }

  // === LANTERN PEDESTALS === warm emissive cubes at floor level
  if (!isCorridor && room.purpose !== "exchange") {
    addLanternPedestals(group, room);
  }
}

function addBaseboards(group: THREE.Group, room: RoomConfig): void {
  const w = room.width;
  const d = room.depth;
  const mat = trimMat();

  // North wall baseboard
  if (!hasDoor(room, "north")) {
    const geo = new THREE.BoxGeometry(w, BASEBOARD_HEIGHT, BASEBOARD_DEPTH);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, BASEBOARD_HEIGHT / 2, -(d / 2) + BASEBOARD_DEPTH / 2);
    group.add(mesh);
  } else {
    addSplitBaseboard(group, w, d, "north", room, mat);
  }

  // South
  if (!hasDoor(room, "south")) {
    const geo = new THREE.BoxGeometry(w, BASEBOARD_HEIGHT, BASEBOARD_DEPTH);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, BASEBOARD_HEIGHT / 2, d / 2 - BASEBOARD_DEPTH / 2);
    group.add(mesh);
  } else {
    addSplitBaseboard(group, w, d, "south", room, mat);
  }

  // East
  if (!hasDoor(room, "east")) {
    const geo = new THREE.BoxGeometry(BASEBOARD_DEPTH, BASEBOARD_HEIGHT, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(w / 2 - BASEBOARD_DEPTH / 2, BASEBOARD_HEIGHT / 2, 0);
    group.add(mesh);
  } else {
    addSplitBaseboardEW(group, w, d, "east", room, mat);
  }

  // West
  if (!hasDoor(room, "west")) {
    const geo = new THREE.BoxGeometry(BASEBOARD_DEPTH, BASEBOARD_HEIGHT, d);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(-(w / 2) + BASEBOARD_DEPTH / 2, BASEBOARD_HEIGHT / 2, 0);
    group.add(mesh);
  } else {
    addSplitBaseboardEW(group, w, d, "west", room, mat);
  }
}

function addSplitBaseboard(
  group: THREE.Group, w: number, d: number,
  wall: "north" | "south", room: RoomConfig, mat: THREE.MeshStandardMaterial
): void {
  const doorW = getDoorWidth(room, wall);
  const sideW = (w - doorW) / 2;
  const zPos = wall === "north" ? -(d / 2) + BASEBOARD_DEPTH / 2 : d / 2 - BASEBOARD_DEPTH / 2;

  if (sideW > 1) {
    const geoL = new THREE.BoxGeometry(sideW, BASEBOARD_HEIGHT, BASEBOARD_DEPTH);
    const meshL = new THREE.Mesh(geoL, mat);
    meshL.position.set(-(w / 2) + sideW / 2, BASEBOARD_HEIGHT / 2, zPos);
    group.add(meshL);

    const geoR = new THREE.BoxGeometry(sideW, BASEBOARD_HEIGHT, BASEBOARD_DEPTH);
    const meshR = new THREE.Mesh(geoR, mat);
    meshR.position.set(w / 2 - sideW / 2, BASEBOARD_HEIGHT / 2, zPos);
    group.add(meshR);
  }
}

function addSplitBaseboardEW(
  group: THREE.Group, w: number, d: number,
  wall: "east" | "west", room: RoomConfig, mat: THREE.MeshStandardMaterial
): void {
  const doorW = getDoorWidth(room, wall);
  const sideD = (d - doorW) / 2;
  const xPos = wall === "east" ? w / 2 - BASEBOARD_DEPTH / 2 : -(w / 2) + BASEBOARD_DEPTH / 2;

  if (sideD > 1) {
    const geoL = new THREE.BoxGeometry(BASEBOARD_DEPTH, BASEBOARD_HEIGHT, sideD);
    const meshL = new THREE.Mesh(geoL, mat);
    meshL.position.set(xPos, BASEBOARD_HEIGHT / 2, -(d / 2) + sideD / 2);
    group.add(meshL);

    const geoR = new THREE.BoxGeometry(BASEBOARD_DEPTH, BASEBOARD_HEIGHT, sideD);
    const meshR = new THREE.Mesh(geoR, mat);
    meshR.position.set(xPos, BASEBOARD_HEIGHT / 2, d / 2 - sideD / 2);
    group.add(meshR);
  }
}

function addCrownMolding(group: THREE.Group, room: RoomConfig): void {
  const w = room.width;
  const d = room.depth;
  const h = room.height;
  const mat = trimMat();
  const y = h - CROWN_HEIGHT / 2;

  // Full strips on doorway-free walls, split on doorway walls
  const walls: { len: number; x: number; z: number; rotY: number; wall: string }[] = [
    { len: w, x: 0, z: -(d / 2) + CROWN_DEPTH / 2, rotY: 0, wall: "north" },
    { len: w, x: 0, z: d / 2 - CROWN_DEPTH / 2, rotY: 0, wall: "south" },
    { len: d, x: w / 2 - CROWN_DEPTH / 2, z: 0, rotY: Math.PI / 2, wall: "east" },
    { len: d, x: -(w / 2) + CROWN_DEPTH / 2, z: 0, rotY: Math.PI / 2, wall: "west" },
  ];

  for (const wl of walls) {
    // Crown molding runs full length regardless of doorways (it's at ceiling height)
    const isEW = wl.wall === "east" || wl.wall === "west";
    const geoW = isEW ? CROWN_DEPTH : wl.len;
    const geoD = isEW ? wl.len : CROWN_DEPTH;
    const geo = new THREE.BoxGeometry(geoW, CROWN_HEIGHT, geoD);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(wl.x, y, wl.z);
    group.add(mesh);
  }
}

function addFloorBorder(group: THREE.Group, room: RoomConfig): void {
  const w = room.width;
  const d = room.depth;
  const borderW = 1.5;
  const mat = floorBorderMat();
  const y = 0.02; // just above floor

  // 4 border strips
  const geo1 = new THREE.BoxGeometry(w, 0.04, borderW);
  const m1 = new THREE.Mesh(geo1, mat);
  m1.position.set(0, y, -(d / 2) + borderW / 2);
  group.add(m1);

  const m2 = new THREE.Mesh(geo1.clone(), mat);
  m2.position.set(0, y, d / 2 - borderW / 2);
  group.add(m2);

  const geo2 = new THREE.BoxGeometry(borderW, 0.04, d);
  const m3 = new THREE.Mesh(geo2, mat);
  m3.position.set(-(w / 2) + borderW / 2, y, 0);
  group.add(m3);

  const m4 = new THREE.Mesh(geo2.clone(), mat);
  m4.position.set(w / 2 - borderW / 2, y, 0);
  group.add(m4);
}

function addDoorFrames(group: THREE.Group, room: RoomConfig): void {
  const w = room.width;
  const d = room.depth;
  const mat = trimMat();
  const frameW = 0.4;
  const frameD = 0.3;

  for (const conn of room.connections) {
    const dw = conn.width;
    const dh = conn.height;

    let x = 0, z = 0;
    let isEW = false;

    switch (conn.wall) {
      case "north": z = -(d / 2); break;
      case "south": z = d / 2; break;
      case "east": x = w / 2; isEW = true; break;
      case "west": x = -(w / 2); isEW = true; break;
    }

    if (isEW) {
      // Left jamb
      const jGeo = new THREE.BoxGeometry(frameD, dh, frameW);
      const jL = new THREE.Mesh(jGeo, mat);
      jL.position.set(x, dh / 2, -(dw / 2) - frameW / 2);
      group.add(jL);

      // Right jamb
      const jR = new THREE.Mesh(jGeo.clone(), mat);
      jR.position.set(x, dh / 2, dw / 2 + frameW / 2);
      group.add(jR);

      // Lintel
      const lGeo = new THREE.BoxGeometry(frameD, frameW, dw + frameW * 2);
      const lintel = new THREE.Mesh(lGeo, mat);
      lintel.position.set(x, dh + frameW / 2, 0);
      group.add(lintel);
    } else {
      // Left jamb
      const jGeo = new THREE.BoxGeometry(frameW, dh, frameD);
      const jL = new THREE.Mesh(jGeo, mat);
      jL.position.set(-(dw / 2) - frameW / 2, dh / 2, z);
      group.add(jL);

      // Right jamb
      const jR = new THREE.Mesh(jGeo.clone(), mat);
      jR.position.set(dw / 2 + frameW / 2, dh / 2, z);
      group.add(jR);

      // Lintel
      const lGeo = new THREE.BoxGeometry(dw + frameW * 2, frameW, frameD);
      const lintel = new THREE.Mesh(lGeo, mat);
      lintel.position.set(0, dh + frameW / 2, z);
      group.add(lintel);
    }
  }
}

function addTrackRails(group: THREE.Group, room: RoomConfig): void {
  const w = room.width;
  const d = room.depth;
  const h = room.height;
  const mat = trackMat();
  const railRadius = 0.08;
  const railY = h - 0.5;

  // 2-3 rails running east-west across the ceiling
  const railCount = d > 60 ? 3 : 2;
  const spacing = d / (railCount + 1);

  for (let i = 0; i < railCount; i++) {
    const z = -(d / 2) + spacing * (i + 1);
    const geo = new THREE.CylinderGeometry(railRadius, railRadius, w * 0.9, 8);
    geo.rotateZ(Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, railY, z);
    group.add(mesh);

    // Small spot fixtures hanging from rail (every ~15ft)
    const spotCount = Math.floor((w * 0.8) / 15);
    const spotSpacing = (w * 0.8) / Math.max(spotCount, 1);
    for (let j = 0; j < spotCount; j++) {
      const sx = -(w * 0.4) + spotSpacing * (j + 0.5);
      const spotGeo = new THREE.CylinderGeometry(0.2, 0.15, 0.4, 8);
      const spot = new THREE.Mesh(spotGeo, mat);
      spot.position.set(sx, railY - 0.3, z);
      group.add(spot);
    }
  }
}

function addBenches(group: THREE.Group, room: RoomConfig): void {
  const mat = benchMat();

  // 1-2 benches along the center of the room
  const benchCount = room.depth > 60 ? 2 : 1;
  const spacing = room.depth * 0.5 / Math.max(benchCount, 1);

  for (let i = 0; i < benchCount; i++) {
    const z = benchCount === 1 ? 0 : -(spacing / 2) + i * spacing;

    // Bench: 8ft long, 1.5ft deep, 1.5ft tall
    const seatGeo = new THREE.BoxGeometry(8, 0.4, 1.8);
    const seat = new THREE.Mesh(seatGeo, mat);
    seat.position.set(0, 1.3, z);
    group.add(seat);
    registerFurnitureCollision(room, 0, z, 8, 2);

    // Legs (4 corners)
    const legGeo = new THREE.BoxGeometry(0.3, 1.1, 0.3);
    const positions = [[-3.5, 0.55, z - 0.6], [3.5, 0.55, z - 0.6], [-3.5, 0.55, z + 0.6], [3.5, 0.55, z + 0.6]];
    for (const [lx, ly, lz] of positions) {
      const leg = new THREE.Mesh(legGeo, mat);
      leg.position.set(lx, ly, lz);
      group.add(leg);
    }
  }
}

function addLanternPedestals(group: THREE.Group, room: RoomConfig): void {
  const w = room.width;
  const d = room.depth;
  const inset = 5;
  const mat = lanternMat();
  const glow = lanternGlowMat();

  // 4 corner lanterns
  const positions: [number, number][] = [
    [-(w / 2) + inset, -(d / 2) + inset],
    [w / 2 - inset, -(d / 2) + inset],
    [-(w / 2) + inset, d / 2 - inset],
    [w / 2 - inset, d / 2 - inset],
  ];

  for (const [x, z] of positions) {
    // Dark stone pedestal
    const pedGeo = new THREE.BoxGeometry(1, 2.5, 1);
    const ped = new THREE.Mesh(pedGeo, mat);
    ped.position.set(x, 1.25, z);
    group.add(ped);
    registerFurnitureCollision(room, x, z, 1.5, 1.5);

    // Warm glowing cube on top
    const glowGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const glowMesh = new THREE.Mesh(glowGeo, glow);
    glowMesh.position.set(x, 2.8, z);
    group.add(glowMesh);
  }
}

export function disposeArchitectureMaterials(): void {
  [_trim, _bench, _track, _lantern, _lanternGlow, _floorBorder].forEach((m) => m?.dispose());
  _trim = _bench = _track = _lantern = _lanternGlow = _floorBorder = null;
}
