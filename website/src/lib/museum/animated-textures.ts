import * as THREE from "three";

// HTML-CSS works are captured ONCE as a first-frame snapshot via html2canvas.
// Live animation is reserved for the standard site (work detail pages).
// In the museum, frames show a static image — like a real museum hangs paintings,
// not video screens. This keeps FPS stable and presentation consistent.

const iframes: HTMLIFrameElement[] = [];
const CAPTURE_SIZE = 512;

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
  iframes.push(iframe);

  iframe.onload = () => {
    // Wait for animation to settle into a representative frame
    setTimeout(async () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc || !doc.body) return;

        const html2canvas = (await import("html2canvas")).default;
        const captured = await html2canvas(doc.body, {
          width: CAPTURE_SIZE,
          height: CAPTURE_SIZE,
          backgroundColor: null,
          logging: false,
          scale: 1,
        });

        ctx.clearRect(0, 0, CAPTURE_SIZE, CAPTURE_SIZE);
        ctx.drawImage(captured, 0, 0, CAPTURE_SIZE, CAPTURE_SIZE);
        texture.needsUpdate = true;

        // Iframe served its purpose — remove it to free memory
        iframe.remove();
      } catch {
        // Capture failed — texture stays as dark background
      }
    }, 1500);
  };

  iframe.srcdoc = htmlPayload;

  return texture;
}

/** No-op — kept for API compatibility with placement.ts */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function registerAnimatedWorkPosition(texture: THREE.CanvasTexture, position: THREE.Vector3): void {
  // No-op: works are static snapshots, no proximity tracking needed
}

/** No-op — kept for API compatibility with engine.ts */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function updateAnimatedTextures(playerPosition: THREE.Vector3): void {
  // No-op: nothing to update
}

export function disposeAnimatedTextures(): void {
  for (const iframe of iframes) {
    if (iframe.parentNode) iframe.remove();
  }
  iframes.length = 0;
}
