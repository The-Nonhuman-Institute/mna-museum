import * as THREE from "three";
import { RoomConfig, rooms } from "./room-configs";

// AABB collision system
// Generates wall segments from room configs, resolves player movement against them
// Doorways create gaps in walls that the player can walk through

const PLAYER_RADIUS = 1.5;
const WALL_THICKNESS = 0.5; // collision wall half-thickness

interface WallAABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

let wallCache: WallAABB[] | null = null;

function generateWallsForRoom(room: RoomConfig): WallAABB[] {
  const walls: WallAABB[] = [];
  const cx = room.x;
  const cz = room.z;
  const hw = room.width / 2;
  const hd = room.depth / 2;
  const thickness = 0.5;

  // For each wall, check if there's a doorway
  const getDoorWidth = (wall: "north" | "south" | "east" | "west") => {
    const conn = room.connections.find((c) => c.wall === wall);
    return conn ? conn.width : 0;
  };

  // North wall (-Z side)
  const northDoor = getDoorWidth("north");
  if (northDoor > 0) {
    const halfDoor = northDoor / 2;
    // Left segment
    if (hw - halfDoor > 0.1) {
      walls.push({
        minX: cx - hw,
        maxX: cx - halfDoor,
        minZ: cz - hd - thickness,
        maxZ: cz - hd + thickness,
      });
    }
    // Right segment
    if (hw - halfDoor > 0.1) {
      walls.push({
        minX: cx + halfDoor,
        maxX: cx + hw,
        minZ: cz - hd - thickness,
        maxZ: cz - hd + thickness,
      });
    }
  } else {
    walls.push({
      minX: cx - hw,
      maxX: cx + hw,
      minZ: cz - hd - thickness,
      maxZ: cz - hd + thickness,
    });
  }

  // South wall (+Z side)
  const southDoor = getDoorWidth("south");
  if (southDoor > 0) {
    const halfDoor = southDoor / 2;
    if (hw - halfDoor > 0.1) {
      walls.push({
        minX: cx - hw,
        maxX: cx - halfDoor,
        minZ: cz + hd - thickness,
        maxZ: cz + hd + thickness,
      });
    }
    if (hw - halfDoor > 0.1) {
      walls.push({
        minX: cx + halfDoor,
        maxX: cx + hw,
        minZ: cz + hd - thickness,
        maxZ: cz + hd + thickness,
      });
    }
  } else {
    walls.push({
      minX: cx - hw,
      maxX: cx + hw,
      minZ: cz + hd - thickness,
      maxZ: cz + hd + thickness,
    });
  }

  // East wall (+X side)
  const eastDoor = getDoorWidth("east");
  if (eastDoor > 0) {
    const halfDoor = eastDoor / 2;
    if (hd - halfDoor > 0.1) {
      walls.push({
        minX: cx + hw - thickness,
        maxX: cx + hw + thickness,
        minZ: cz - hd,
        maxZ: cz - halfDoor,
      });
    }
    if (hd - halfDoor > 0.1) {
      walls.push({
        minX: cx + hw - thickness,
        maxX: cx + hw + thickness,
        minZ: cz + halfDoor,
        maxZ: cz + hd,
      });
    }
  } else {
    walls.push({
      minX: cx + hw - thickness,
      maxX: cx + hw + thickness,
      minZ: cz - hd,
      maxZ: cz + hd,
    });
  }

  // West wall (-X side)
  const westDoor = getDoorWidth("west");
  if (westDoor > 0) {
    const halfDoor = westDoor / 2;
    if (hd - halfDoor > 0.1) {
      walls.push({
        minX: cx - hw - thickness,
        maxX: cx - hw + thickness,
        minZ: cz - hd,
        maxZ: cz - halfDoor,
      });
    }
    if (hd - halfDoor > 0.1) {
      walls.push({
        minX: cx - hw - thickness,
        maxX: cx - hw + thickness,
        minZ: cz + halfDoor,
        maxZ: cz + hd,
      });
    }
  } else {
    walls.push({
      minX: cx - hw - thickness,
      maxX: cx - hw + thickness,
      minZ: cz - hd,
      maxZ: cz + hd,
    });
  }

  return walls;
}

function getAllWalls(): WallAABB[] {
  if (wallCache) return wallCache;
  wallCache = [];
  for (const room of rooms) {
    wallCache.push(...generateWallsForRoom(room));
  }
  return wallCache;
}

function circleIntersectsAABB(
  cx: number,
  cz: number,
  radius: number,
  wall: WallAABB
): { penetration: THREE.Vector3 } | null {
  // Find closest point on AABB to circle center
  const closestX = Math.max(wall.minX, Math.min(cx, wall.maxX));
  const closestZ = Math.max(wall.minZ, Math.min(cz, wall.maxZ));

  const dx = cx - closestX;
  const dz = cz - closestZ;
  const distSq = dx * dx + dz * dz;

  if (distSq < radius * radius) {
    const dist = Math.sqrt(distSq);
    if (dist < 0.0001) {
      // Center is inside AABB — push out along shortest axis
      const overlapX = Math.min(cx - wall.minX, wall.maxX - cx);
      const overlapZ = Math.min(cz - wall.minZ, wall.maxZ - cz);
      if (overlapX < overlapZ) {
        const dir = cx < (wall.minX + wall.maxX) / 2 ? -1 : 1;
        return { penetration: new THREE.Vector3(dir * (radius + overlapX), 0, 0) };
      } else {
        const dir = cz < (wall.minZ + wall.maxZ) / 2 ? -1 : 1;
        return { penetration: new THREE.Vector3(0, 0, dir * (radius + overlapZ)) };
      }
    }

    const overlap = radius - dist;
    return {
      penetration: new THREE.Vector3(
        (dx / dist) * overlap,
        0,
        (dz / dist) * overlap
      ),
    };
  }

  return null;
}

export function resolveCollision(
  position: THREE.Vector3,
  delta: THREE.Vector3
): THREE.Vector3 {
  const walls = getAllWalls();
  const newPos = position.clone().add(delta);
  const resolved = new THREE.Vector3(newPos.x, 0, newPos.z);

  // Iterative resolution (max 4 passes)
  for (let pass = 0; pass < 4; pass++) {
    let pushed = false;
    for (const wall of walls) {
      const hit = circleIntersectsAABB(resolved.x, resolved.z, PLAYER_RADIUS, wall);
      if (hit) {
        resolved.add(hit.penetration);
        pushed = true;
      }
    }
    if (!pushed) break;
  }

  return new THREE.Vector3(
    resolved.x - position.x,
    0,
    resolved.z - position.z
  );
}

// Determine which room the player is currently in
export function getCurrentRoom(position: THREE.Vector3): RoomConfig | null {
  for (const room of rooms) {
    const hw = room.width / 2;
    const hd = room.depth / 2;
    if (
      position.x >= room.x - hw &&
      position.x <= room.x + hw &&
      position.z >= room.z - hd &&
      position.z <= room.z + hd
    ) {
      return room;
    }
  }
  return null;
}

export function clearWallCache(): void {
  wallCache = null;
}
