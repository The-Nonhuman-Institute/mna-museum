import * as THREE from "three";
import { RoomConfig } from "./room-configs";

// Museum lighting — global lights only, no per-room point lights
// Hemisphere + ambient + directional is enough for a bright gallery
// Point lights are GPU-expensive — avoid them until we need spotlights on art

export function addLanternsToRoom(
  _group: THREE.Group,
  _room: RoomConfig
): void {
  // No per-room lights for now — global lighting handles visibility
  // Phase 3 will add targeted spotlights on artwork only
}

export function createGlobalLights(): THREE.Object3D[] {
  const lights: THREE.Object3D[] = [];

  // Hemisphere: bright, even gallery illumination
  const hemi = new THREE.HemisphereLight(
    0xffffff, // sky
    0xd0c8c0, // ground bounce
    2.5
  );
  lights.push(hemi);

  // Ambient fill
  const ambient = new THREE.AmbientLight(0xfff8f0, 1.0);
  lights.push(ambient);

  // Directional — simulates overhead track lighting / clerestory
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(20, 50, 10);
  lights.push(dir);

  return lights;
}
