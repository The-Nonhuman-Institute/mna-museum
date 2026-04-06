import * as THREE from "three";

// Animated HTML-CSS works — captured from hidden iframes via html2canvas.
// Performance strategy:
// - Initial capture once on load (so works aren't blank)
// - Active capture loop only when player is within ACTIVATION_DISTANCE
// - Capture rate is throttled (CAPTURE_INTERVAL_MS) to prevent FPS drops
// - Works far from player keep their last captured frame

const CAPTURE_SIZE = 384;
const ACTIVATION_DISTANCE = 35; // start animating when player is within 35 units
const CAPTURE_INTERVAL_MS = 100; // ~10 frames per second when active
const MAX_CONCURRENT_CAPTURES = 2; // up to 2 works capture in parallel

interface AnimatedWork {
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  iframe: HTMLIFrameElement;
  worldPosition: THREE.Vector3 | null; // set by placement after frame is positioned
  lastCaptureTime: number;
  ready: boolean;
  capturing: boolean;
}

const animatedWorks: AnimatedWork[] = [];
let activeCaptures = 0;

export function createAnimatedTexture(htmlPayload: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = CAPTURE_SIZE;
  canvas.height = CAPTURE_SIZE;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, CAPTURE_SIZE, CAPTURE_SIZE);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const iframe = document.createElement("iframe");
  iframe.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${CAPTURE_SIZE}px;height:${CAPTURE_SIZE}px;border:none;opacity:0;pointer-events:none;`;
  iframe.sandbox.add("allow-same-origin");
  iframe.sandbox.add("allow-scripts");
  document.body.appendChild(iframe);

  const work: AnimatedWork = {
    texture,
    canvas,
    ctx,
    iframe,
    worldPosition: null,
    lastCaptureTime: 0,
    ready: false,
    capturing: false,
  };
  animatedWorks.push(work);

  iframe.onload = () => {
    setTimeout(async () => {
      await captureFrame(work);
      work.ready = true;
    }, 500);
  };

  iframe.srcdoc = htmlPayload;

  return texture;
}

/**
 * Register a frame's world position so we can check player proximity.
 * Called by placement.ts after positioning the frame in the scene.
 */
export function registerAnimatedWorkPosition(texture: THREE.CanvasTexture, position: THREE.Vector3): void {
  const work = animatedWorks.find((w) => w.texture === texture);
  if (work) work.worldPosition = position.clone();
}

async function captureFrame(work: AnimatedWork): Promise<void> {
  if (work.capturing) return;
  if (activeCaptures >= MAX_CONCURRENT_CAPTURES) return;

  work.capturing = true;
  activeCaptures++;

  try {
    const doc = work.iframe.contentDocument;
    if (!doc || !doc.body) return;

    const html2canvas = (await import("html2canvas")).default;
    const captured = await html2canvas(doc.body, {
      width: CAPTURE_SIZE,
      height: CAPTURE_SIZE,
      backgroundColor: null,
      logging: false,
      scale: 1,
    });

    work.ctx.clearRect(0, 0, CAPTURE_SIZE, CAPTURE_SIZE);
    work.ctx.drawImage(captured, 0, 0, CAPTURE_SIZE, CAPTURE_SIZE);
    work.texture.needsUpdate = true;
    work.lastCaptureTime = performance.now();
  } catch {
    // Capture failed — texture stays as last good frame
  } finally {
    work.capturing = false;
    activeCaptures--;
  }
}

/**
 * Update animated textures based on player position.
 * Call this from the engine's animation loop.
 */
export function updateAnimatedTextures(playerPosition: THREE.Vector3): void {
  const now = performance.now();

  for (const work of animatedWorks) {
    if (!work.ready || !work.worldPosition) continue;
    if (work.capturing) continue;

    const distance = work.worldPosition.distanceTo(playerPosition);
    if (distance > ACTIVATION_DISTANCE) continue;

    // Within range — capture if interval has elapsed
    const elapsed = now - work.lastCaptureTime;
    if (elapsed < CAPTURE_INTERVAL_MS) continue;

    captureFrame(work);
  }
}

export function disposeAnimatedTextures(): void {
  for (const work of animatedWorks) {
    if (work.iframe.parentNode) work.iframe.remove();
    work.texture.dispose();
  }
  animatedWorks.length = 0;
  activeCaptures = 0;
}
