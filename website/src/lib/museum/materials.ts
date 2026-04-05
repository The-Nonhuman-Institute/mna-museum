import * as THREE from "three";
import { concreteWallTexture, polishedFloorTexture, concreteNormalMap, disposeTextures } from "./textures";

// Museum materials — textured concrete walls, polished concrete floors
// Textures generated procedurally at runtime (no external files)

let _floor: THREE.MeshStandardMaterial | null = null;
let _wall: THREE.MeshStandardMaterial | null = null;
let _ceiling: THREE.MeshStandardMaterial | null = null;
let _corridor: THREE.MeshStandardMaterial | null = null;
let _frameWood: THREE.MeshStandardMaterial | null = null;
let _plinthStone: THREE.MeshStandardMaterial | null = null;
let _brass: THREE.MeshStandardMaterial | null = null;

export function floorMaterial(): THREE.MeshStandardMaterial {
  if (!_floor) {
    _floor = new THREE.MeshStandardMaterial({
      color: 0x706860,
      map: polishedFloorTexture(),
      roughness: 0.12,
      metalness: 0.05,
    });
  }
  return _floor;
}

export function wallMaterial(): THREE.MeshStandardMaterial {
  if (!_wall) {
    _wall = new THREE.MeshStandardMaterial({
      color: 0xb0a8a0,
      map: concreteWallTexture(),
      normalMap: concreteNormalMap(),
      normalScale: new THREE.Vector2(0.3, 0.3),
      roughness: 0.85,
      metalness: 0.0,
    });
  }
  return _wall;
}

export function ceilingMaterial(): THREE.MeshStandardMaterial {
  if (!_ceiling) {
    _ceiling = new THREE.MeshStandardMaterial({
      color: 0x807a75,
      roughness: 0.92,
      metalness: 0.0,
    });
  }
  return _ceiling;
}

export function corridorMaterial(): THREE.MeshStandardMaterial {
  if (!_corridor) {
    _corridor = new THREE.MeshStandardMaterial({
      color: 0x9a9590,
      map: concreteWallTexture(),
      roughness: 0.85,
      metalness: 0.0,
    });
  }
  return _corridor;
}

export function frameWoodMaterial(): THREE.MeshStandardMaterial {
  if (!_frameWood) {
    _frameWood = new THREE.MeshStandardMaterial({
      color: 0x1a1510,
      roughness: 0.6,
      metalness: 0.1,
    });
  }
  return _frameWood;
}

export function plinthStoneMaterial(): THREE.MeshStandardMaterial {
  if (!_plinthStone) {
    _plinthStone = new THREE.MeshStandardMaterial({
      color: 0x2a2825,
      roughness: 0.5,
      metalness: 0.05,
    });
  }
  return _plinthStone;
}

export function brassMaterial(): THREE.MeshStandardMaterial {
  if (!_brass) {
    _brass = new THREE.MeshStandardMaterial({
      color: 0x8a7a55,
      roughness: 0.4,
      metalness: 0.7,
    });
  }
  return _brass;
}

export function disposeMaterials(): void {
  [_floor, _wall, _ceiling, _corridor, _frameWood, _plinthStone, _brass].forEach(
    (m) => m?.dispose()
  );
  _floor = _wall = _ceiling = _corridor = _frameWood = _plinthStone = _brass = null;
  disposeTextures();
}
