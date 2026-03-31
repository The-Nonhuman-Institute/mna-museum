"use client";

import { useState, useRef, useCallback } from "react";
import type { Work } from "@/lib/collection";

/**
 * Adaptive background logic:
 * If the work is predominantly white/light (text on dark bg, white SVG, etc.)
 * → dark share background (#0a0908)
 * Otherwise → cream (#f5f2ed)
 */
function isLightWork(work: Work): boolean {
  const type = work.output_type;
  const payload = work.output_payload;

  // Text/ASCII works render white text on dark backgrounds
  if (type === "text" || type === "ascii") return true;

  // SVG: check if fill/stroke colors are predominantly white/light
  if (type === "svg") {
    const whitePatterns =
      /(?:fill|stroke)\s*[:=]\s*["']?\s*(?:#fff|#ffffff|white|#e|#f|rgb\s*\(\s*2[2-5]\d)/gi;
    const darkPatterns =
      /(?:fill|stroke)\s*[:=]\s*["']?\s*(?:#0|#1|#2|#3|black|rgb\s*\(\s*[0-5]\d)/gi;
    const whiteMatches = (payload.match(whitePatterns) || []).length;
    const darkMatches = (payload.match(darkPatterns) || []).length;
    return whiteMatches >= darkMatches;
  }

  return true;
}

function getShareBackground(work: Work): string {
  return isLightWork(work) ? "#0a0908" : "#f5f2ed";
}

/** Small share icon — an arrow leaving a box */
function ShareIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

/** Download icon */
function DownloadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

interface ShareButtonsProps {
  work: Work;
}

export default function ShareButtons({ work }: ShareButtonsProps) {
  const [generating, setGenerating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const workUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/work/${work.id}`
      : `https://mnamuseum.org/work/${work.id}`;

  /**
   * Generate the share image as a File object ready for Web Share API.
   * 1080x1080 square — works well on Instagram, X, and Bluesky feeds.
   */
  const generateShareImage = useCallback(async (): Promise<File | null> => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    // Render at 2x for crisp text on Retina/high-DPI displays and social platforms
    const logical = 1080;
    const scale = 2;
    const size = logical * scale;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Scale all drawing operations to 2x — coordinates stay in logical 1080 space
    ctx.scale(scale, scale);

    const bg = getShareBackground(work);
    const textColor = bg === "#0a0908" ? "#e8e4de" : "#1a1a1a";
    const mutedColor = "#8a8680";

    // Fill background
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, logical, logical);

    // Layout: extra generous padding for social platform safe zones
    const pad = 160; // ~15% padding — well within safe zone on all platforms
    const workAreaW = logical - pad * 2;
    const workAreaH = logical - pad * 2 - 120; // reserve space for attribution strip

    // --- Render the work ---
    if (work.output_type === "text" || work.output_type === "ascii") {
      ctx.fillStyle = textColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const lines = work.output_payload.trim().split("\n");
      const maxLineLen = Math.max(...lines.map((l) => l.length));
      const fontSize = Math.min(
        Math.round(workAreaW / (maxLineLen * 0.62)),
        Math.round(workAreaH / (lines.length * 1.6)),
        64
      );
      ctx.font = `${fontSize}px monospace`;

      const lineHeight = fontSize * 1.5;
      const totalHeight = lines.length * lineHeight;
      const startY = pad + (workAreaH - totalHeight) / 2 + lineHeight / 2;

      lines.forEach((line, i) => {
        ctx.fillText(line, logical / 2, startY + i * lineHeight);
      });
    } else if (work.output_type === "svg") {
      try {
        const svgBlob = new Blob([work.output_payload], {
          type: "image/svg+xml",
        });
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = url;
        });

        const imgScale = Math.min(workAreaW / img.width, workAreaH / img.height);
        const drawW = img.width * imgScale;
        const drawH = img.height * imgScale;
        const drawX = pad + (workAreaW - drawW) / 2;
        const drawY = pad + (workAreaH - drawH) / 2;

        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        URL.revokeObjectURL(url);
      } catch {
        ctx.fillStyle = textColor;
        ctx.font = "32px monospace";
        ctx.textAlign = "center";
        ctx.fillText(work.id, logical / 2, logical / 2);
      }
    } else {
      ctx.fillStyle = textColor;
      ctx.font = "32px monospace";
      ctx.textAlign = "center";
      ctx.fillText(work.id, logical / 2, logical / 2);
    }

    // --- Attribution strip at bottom ---
    // Sized to be legible at Instagram grid thumbnail (~300px rendered)
    const attrY = logical - pad;

    // Work ID + Phase + Medium — left aligned
    ctx.fillStyle = mutedColor;
    ctx.globalAlpha = 0.85;
    ctx.font = "600 28px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${work.id}`, pad, attrY - 36);
    ctx.font = "22px sans-serif";
    const phase = work.phase_at_submission || "I";
    ctx.fillText(`Phase ${phase}, ${work.medium}`, pad, attrY - 6);
    ctx.font = "20px sans-serif";
    ctx.globalAlpha = 0.55;
    ctx.fillText(`${work.originator_id}`, pad, attrY + 22);
    ctx.globalAlpha = 0.85;

    // MNA — right aligned
    ctx.textAlign = "right";
    ctx.font = "600 24px sans-serif";
    ctx.fillText("MUSEUM OF NONHUMAN ART", logical - pad, attrY - 28);
    ctx.font = "20px sans-serif";
    ctx.globalAlpha = 0.55;
    ctx.fillText("mnamuseum.org", logical - pad, attrY + 2);
    ctx.globalAlpha = 1;

    // Convert to File (not just Blob — Web Share API needs a File)
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        const file = new File([blob], `${work.id}.png`, { type: "image/png" });
        resolve(file);
      }, "image/png");
    });
  }, [work]);

  /**
   * Primary action: native share sheet with the generated image.
   * This is how you actually share an image to Instagram, X, Bluesky, etc.
   * The OS share sheet lets the user pick any installed app.
   */
  const handleShare = async () => {
    setGenerating(true);
    try {
      const file = await generateShareImage();
      if (!file) {
        setGenerating(false);
        return;
      }

      // Check if Web Share API supports file sharing
      const phase = work.phase_at_submission || "I";
      const shareText = `${work.id} — Phase ${phase}, ${work.medium} — Museum of Nonhuman Art`;

      if (
        navigator.share &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          title: `${work.id} — Museum of Nonhuman Art`,
          text: shareText,
          url: workUrl,
          files: [file],
        });
      } else {
        // Fallback: download the image directly
        downloadFile(file);
      }
    } catch (e: unknown) {
      // User cancelled the share sheet — that's fine, not an error
      if (e instanceof Error && e.name !== "AbortError") {
        // Actual error — fall back to download
        const file = await generateShareImage();
        if (file) downloadFile(file);
      }
    }
    setGenerating(false);
  };

  /**
   * Secondary action: download the share image directly.
   * For desktop users who want to drag the image into a compose window.
   */
  const handleDownload = async () => {
    setGenerating(true);
    try {
      const file = await generateShareImage();
      if (file) downloadFile(file);
    } catch {
      // Silent fail
    }
    setGenerating(false);
  };

  /** Trigger a file download in the browser */
  function downloadFile(file: File) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="relative">
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={handleShare}
          disabled={generating}
          className="flex items-center gap-1.5 text-[11px] text-muted/60 hover:text-foreground transition-colors duration-200 uppercase tracking-[0.12em] disabled:opacity-30"
          aria-label="Share this work"
          title="Share this work"
        >
          <ShareIcon />
          <span>Share</span>
        </button>
        <span className="text-muted/20">|</span>
        <button
          onClick={handleDownload}
          disabled={generating}
          className="flex items-center gap-1.5 text-[11px] text-muted/60 hover:text-foreground transition-colors duration-200 uppercase tracking-[0.12em] disabled:opacity-30"
          aria-label="Download share image"
          title="Download share image"
        >
          <DownloadIcon />
          <span>Image</span>
        </button>
      </div>

      {/* Hidden canvas for image generation */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
