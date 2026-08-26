"use client";

import { useState, useCallback } from "react";
import type { Work } from "@/lib/collection";
import { generateShareFiles, predictShareKind } from "@/lib/share-engine";
import { canGenerateShare } from "@/lib/validate-work";

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

interface ShareButtonsProps {
  work: Work;
}

function downloadLabel(work: Work): string {
  switch (predictShareKind(work)) {
    case "video": return "Video";
    case "audio": return "Audio";
    default: return "Image";
  }
}

export default function ShareButtons({ work }: ShareButtonsProps) {
  const [generating, setGenerating] = useState(false);
  const shareable = canGenerateShare(work);

  const workUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/work/${work.id}`
      : `https://mnamuseum.org/work/${work.id}`;

  // A file that is made but not yet handed to the share sheet. See below.
  const [readyFile, setReadyFile] = useState<File | null>(null);

  const shareText = `${work.id} — Phase ${work.phase_at_submission || "I"}, ${work.medium} — Museum of Nonhuman Art`;

  const openShareSheet = useCallback(
    async (file: File) => {
      await navigator.share({
        title: `${work.id} — Museum of Nonhuman Art`,
        text: shareText,
        url: workUrl,
        files: [file],
      });
    },
    [work.id, shareText, workUrl],
  );

  const handleShare = useCallback(async () => {
    // Second tap. The file already exists, so navigator.share is called inside
    // this gesture and the sheet opens.
    if (readyFile) {
      try {
        await openShareSheet(readyFile);
        setReadyFile(null);
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return;
        downloadFile(readyFile);
        setReadyFile(null);
      }
      return;
    }

    setGenerating(true);
    try {
      const result = await generateShareFiles(work);
      if (!result) { setGenerating(false); return; }
      const shareFile = result.type === "audio" ? result.audioFile : result.file;

      const canShareFile =
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [shareFile] });

      if (canShareFile) {
        try {
          await openShareSheet(shareFile);
        } catch (e: unknown) {
          const err = e as Error;
          if (err?.name === "AbortError") {
            // The steward closed the sheet. Nothing to recover from.
          } else if (err?.name === "NotAllowedError" || err?.name === "SecurityError") {
            // Safari requires navigator.share to be called while the tap that
            // started it is still "active". Recording a video takes seconds, so
            // by the time the file exists the activation has expired and the
            // share is refused — which is why every animated work fell through
            // to a download prompt on iOS while a PNG, made instantly, reached
            // the share sheet. Keep the finished file and let the next tap
            // present it: that tap is a fresh gesture and Safari allows it.
            setReadyFile(shareFile);
          } else {
            downloadFile(shareFile);
          }
        }
      } else {
        downloadFile(shareFile);
      }
    } catch {
      /* generation failed; nothing to hand over */
    }
    setGenerating(false);
  }, [work, readyFile, openShareSheet]);

  const handleDownload = useCallback(async () => {
    setGenerating(true);
    try {
      const result = await generateShareFiles(work);
      if (!result) { setGenerating(false); return; }

      if (result.type === "audio") {
        // Download both audio and waveform
        downloadFile(result.audioFile);
        downloadFile(result.imageFile);
      } else {
        downloadFile(result.file);
      }
    } catch {}
    setGenerating(false);
  }, [work]);

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

  // Hide share buttons if share would produce broken output
  if (!shareable) return null;

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
          <span>{generating ? "Generating..." : readyFile ? "Tap to share" : "Share"}</span>
        </button>
        <span className="text-muted/20">|</span>
        <button
          onClick={handleDownload}
          disabled={generating}
          className="flex items-center gap-1.5 text-[11px] text-muted/60 hover:text-foreground transition-colors duration-200 uppercase tracking-[0.12em] disabled:opacity-30"
          aria-label={`Download ${downloadLabel(work)}`}
          title={`Download ${downloadLabel(work)}`}
        >
          <DownloadIcon />
          <span>{downloadLabel(work)}</span>
        </button>
      </div>
    </div>
  );
}
