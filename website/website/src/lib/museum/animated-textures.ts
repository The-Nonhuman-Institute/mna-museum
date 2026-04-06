import * as THREE from "three";

// Render HTML-CSS works via hidden iframes — capture once after CSS loads
// No continuous capture loop (html2canvas is too expensive for real-time)

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

  // Create hidden iframe
  const iframe = document.createElement("iframe");
  iframe.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${CAPTURE_SIZE}px;height:${CAPTURE_SIZE}px;border:none;opacity:0;pointer-events:none;`;
  iframe.sandbox.add("allow-same-origin");
  document.body.appendChild(iframe);
  iframes.push(iframe);

  iframe.onload = () => {
    // Wait for CSS to parse and first paint
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

        // Clean up iframe after capture
        iframe.remove();
      } catch {
        // Failed — texture stays as dark background
      }
    }, 500);
  };

  iframe.srcdoc = htmlPayload;

  return texture;
}

export function disposeAnimatedTextures(): void {
  for (const iframe of iframes) {
    if (iframe.parentNode) iframe.remove();
  }
  iframes.length = 0;
}
