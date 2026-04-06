import * as THREE from "three";
import { RoomConfig, rooms } from "./room-configs";
import {
  floorMaterial,
  wallMaterial,
  ceilingMaterial,
} from "./materials";

// Rooms built with BoxGeometry walls + corner columns to seal gaps
// Each wall fits between corners, corner columns fill the joins

const WALL_THICKNESS = 1.0;

function hasDoorway(
  room: RoomConfig,
  wall: "north" | "south" | "east" | "west"
): { width: number; height: number } | null {
  const conn = room.connections.find((c) => c.wall === wall);
  return conn ? { width: conn.width, height: conn.height } : null;
}

function buildWall(
  length: number,
  height: number,
  thickness: number,
  door: { width: number; height: number } | null,
  mat: THREE.MeshStandardMaterial
): THREE.Group {
  const group = new THREE.Group();

  if (!door) {
    const geo = new THREE.BoxGeometry(length, height, thickness);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = height / 2;
    group.add(mesh);
    return group;
  }

  const dw = door.width;
  const dh = door.height;
  const sideWidth = (length - dw) / 2;

  if (sideWidth > 0.1) {
    // Left
    const geo = new THREE.BoxGeometry(sideWidth, height, thickness);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.x = -(length / 2) + sideWidth / 2;
    mesh.position.y = height / 2;
    group.add(mesh);

    // Right
    const geo2 = new THREE.BoxGeometry(sideWidth, height, thickness);
    const mesh2 = new THREE.Mesh(geo2, mat);
    mesh2.position.x = (length / 2) - sideWidth / 2;
    mesh2.position.y = height / 2;
    group.add(mesh2);
  }

  // Lintel
  const lintelH = height - dh;
  if (lintelH > 0.1) {
    const geo = new THREE.BoxGeometry(dw, lintelH, thickness);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = dh + lintelH / 2;
    group.add(mesh);
  }

  return group;
}

export function buildRoom(room: RoomConfig): THREE.Group {
  const group = new THREE.Group();
  group.name = `room-${room.id}`;

  const w = room.width;
  const d = room.depth;
  const h = room.height;
  const t = WALL_THICKNESS;
  const ht = t / 2;

  let wallMat = wallMaterial();
  let floorMat = floorMaterial();
  const ceilMat = ceilingMaterial();

  if (room.wallColor) {
    wallMat = wallMat.clone();
    wallMat.color.setHex(room.wallColor);
  }
  if (room.floorColor) {
    floorMat = floorMat.clone();
    floorMat.color.setHex(room.floorColor);
  }

  // Floor — extends slightly past walls
  const floorGeo = new THREE.PlaneGeometry(w + t, d + t);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  // Ceiling
  const ceilGeo = new THREE.PlaneGeometry(w + t, d + t);
  const ceil = new THREE.Mesh(ceilGeo, ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = h;
  group.add(ceil);

  // Walls — each fits between the corner columns (length = interior dimension)
  // North wall (-Z)
  const northDoor = hasDoorway(room, "north");
  const northWall = buildWall(w, h, t, northDoor, wallMat);
  northWall.position.z = -(d / 2 + ht);
  group.add(northWall);

  // South wall (+Z)
  const southDoor = hasDoorway(room, "south");
  const southWall = buildWall(w, h, t, southDoor, wallMat);
  southWall.position.z = d / 2 + ht;
  group.add(southWall);

  // East wall (+X) — length = depth
  const eastDoor = hasDoorway(room, "east");
  const eastWall = buildWall(d, h, t, eastDoor, wallMat);
  eastWall.rotation.y = Math.PI / 2;
  eastWall.position.x = w / 2 + ht;
  group.add(eastWall);

  // West wall (-X)
  const westDoor = hasDoorway(room, "west");
  const westWall = buildWall(d, h, t, westDoor, wallMat);
  westWall.rotation.y = Math.PI / 2;
  westWall.position.x = -(w / 2 + ht);
  group.add(westWall);

  // Corner columns — seal the joins between walls
  const cornerPositions: [number, number][] = [
    [-(w / 2 + ht), -(d / 2 + ht)],
    [(w / 2 + ht), -(d / 2 + ht)],
    [-(w / 2 + ht), (d / 2 + ht)],
    [(w / 2 + ht), (d / 2 + ht)],
  ];
  const cornerGeo = new THREE.BoxGeometry(t, h, t);
  for (const [cx, cz] of cornerPositions) {
    const corner = new THREE.Mesh(cornerGeo, wallMat);
    corner.position.set(cx, h / 2, cz);
    group.add(corner);
  }

  // Position in world space
  group.position.set(room.x, 0, room.z);

  return group;
}

export function buildAllRooms(): THREE.Group {
  const museum = new THREE.Group();
  museum.name = "museum";
  for (const room of rooms) {
    museum.add(buildRoom(room));
  }
  return museum;
}
