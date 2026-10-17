import * as THREE from "three";

// HTML works no longer hang as live iframes in the museum: they show their
// preview (work-textures.ts, renderPreview). These stay as no-ops for the
// placement and engine call sites.

/** No-op — kept for API compatibility with placement.ts */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function registerAnimatedWorkPosition(texture: THREE.CanvasTexture, position: THREE.Vector3): void {}

/** No-op — kept for API compatibility with engine.ts */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function updateAnimatedTextures(playerPosition: THREE.Vector3): void {}

/** No-op — kept for API compatibility with engine.ts */
export function disposeAnimatedTextures(): void {}
