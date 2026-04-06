import * as THREE from "three";

// Museum lighting — global lights only, no per-room point lights
// Hemisphere + ambient + directional is enough for a bright gallery
// Point lights are GPU-expensive — avoid them until we need spotlights on art

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function addLanternsToRoom(): void {
  // No per-room lights — global lighting handles visibility
}

export function createGlobalLights(): THREE.Object3D[] {
  const lights: THREE.Object3D[] = [];

  const hemi = new THREE.HemisphereLight(0xffffff, 0xd0c8c0, 2.5);
  lights.push(hemi);

  const ambient = new THREE.AmbientLight(0xfff8f0, 1.0);
  lights.push(ambient);

  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(20, 50, 10);
  lights.push(dir);

  return lights;
}
