"use client";

import Link from "next/link";
import { useState, Suspense, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { works } from "@/lib/collection";
import { parseWorkColors } from "@/lib/work-colors";
import { formatDate } from "@/lib/format-date";

type StatusFilter = "ALL" | "CANON" | "REJECTED" | "IN_REVIEW";

/** Small canvas preview that renders canvas-json ops at thumbnail size */
function CanvasPreview({ json }: { json: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 200;
    canvas.height = 200;

    let ops: { op: string; color?: string; x?: number; y?: number; w?: number; h?: number; r?: number; x1?: number; y1?: number; x2?: number; y2?: number; width?: number }[];
    try {
      ops = JSON.parse(json);
    } catch {
      // Try salvaging truncated JSON
      try {
        const lastBrace = json.lastIndexOf("}");
        if (lastBrace > 0) {
          ops = JSON.parse(json.substring(0, lastBrace + 1) + "]");
        } else return;
      } catch { return; }
    }

    const scale = 200 / 800; // Scale 800x800 canvas to 200x200 preview
    ctx.scale(scale, scale);
    ctx.fillStyle = "#0e0c0a";
    ctx.fillRect(0, 0, 800, 800);

    for (const op of ops) {
      switch (op.op) {
        case "bg": ctx.fillStyle = op.color || "#0e0c0a"; ctx.fillRect(0, 0, 800, 800); break;
        case "fill": ctx.fillStyle = op.color || "#fff"; break;
        case "stroke": ctx.strokeStyle = op.color || "#fff"; break;
        case "rect": ctx.fillRect(op.x || 0, op.y || 0, op.w || 100, op.h || 100); break;
        case "circle": ctx.beginPath(); ctx.arc(op.x || 0, op.y || 0, op.r || 50, 0, Math.PI * 2); ctx.fill(); break;
        case "line": ctx.beginPath(); ctx.lineWidth = op.width || 1; if (op.color) ctx.strokeStyle = op.color; ctx.moveTo(op.x1 || 0, op.y1 || 0); ctx.lineTo(op.x2 || 0, op.y2 || 0); ctx.stroke(); break;
      }
    }
  }, [json]);

  return <canvas ref={canvasRef} className="max-w-full max-h-full" />;
}

function WorkPreview({ work }: { work: (typeof works)[0] }) {
  // SVG — render inline
  if (work.output_type === "svg") {
    const svgStart = work.output_payload.indexOf("<svg");
    const svgEnd = work.output_payload.lastIndexOf("</svg>") + 6;
    if (svgStart >= 0 && svgEnd > svgStart) {
      return (
        <div
          className="w-full h-full flex items-center justify-center p-2 [&>svg]:max-w-full [&>svg]:max-h-full"
          dangerouslySetInnerHTML={{
            __html: work.output_payload.substring(svgStart, svgEnd),
          }}
        />
      );
    }
  }

  // Canvas — render actual drawing
  if (work.output_type === "canvas-json") {
    return (
      <div className="w-full h-full flex items-center justify-center p-1">
        <CanvasPreview json={work.output_payload} />
      </div>
    );
  }

  // HTML/CSS — show animation indicator
  if (work.output_type === "html-css") {
    return (
      <div className="w-full h-full flex items-center justify-center gap-2">
        <div className="flex items-end gap-[2px]">
          <div className="w-1 h-3 bg-[#4a4540] rounded-full animate-pulse" />
          <div className="w-1 h-5 bg-[#4a4540] rounded-full animate-pulse" style={{ animationDelay: "0.3s" }} />
          <div className="w-1 h-2 bg-[#4a4540] rounded-full animate-pulse" style={{ animationDelay: "0.6s" }} />
        </div>
        <span className="text-[#6a6560] text-[10px] uppercase tracking-wider">
          Animation
        </span>
      </div>
    );
  }

  // Audio — show waveform indicator
  if (work.output_type === "audio-json") {
    return (
      <div className="w-full h-full flex items-center justify-center gap-[1px]">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="w-[3px] bg-[#4a4540] rounded-full"
            style={{ height: `${Math.random() * 40 + 10}px`, opacity: 0.5 }}
          />
        ))}
      </div>
    );
  }

  // Text / ASCII — strip color metadata, show clean text
  const colors = parseWorkColors(work.output_payload, work.output_type);
  return (
    <pre
      className="text-[10px] md:text-xs font-mono whitespace-pre-wrap break-words line-clamp-4 p-3"
      style={{ color: colors.fg, backgroundColor: colors.bg }}
    >
      {colors.payload.substring(0, 200)}
    </pre>
  );
}

export default function ArchivePage() {
  return (
    <Suspense>
      <ArchiveContent />
    </Suspense>
  );
}

function ArchiveContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialFilter = (searchParams.get("status") as StatusFilter) || "ALL";
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialFilter);

  // Update URL when filter changes
  const updateFilter = (filter: StatusFilter) => {
    setStatusFilter(filter);
    if (filter === "ALL") {
      router.replace("/archive", { scroll: false });
    } else {
      router.replace(`/archive?status=${filter}`, { scroll: false });
    }
  };

  const filtered =
    statusFilter === "ALL"
      ? works
      : works.filter((w) => {
          if (statusFilter === "IN_REVIEW")
            return (
              w.canon_status === "IN_REVIEW" || w.canon_status === "SUBMITTED"
            );
          return w.canon_status === statusFilter;
        });

  const counts = {
    all: works.length,
    canon: works.filter((w) => w.canon_status === "CANON").length,
    rejected: works.filter((w) => w.canon_status === "REJECTED").length,
    inReview: works.filter(
      (w) => w.canon_status === "IN_REVIEW" || w.canon_status === "SUBMITTED"
    ).length,
  };

  return (
    <div className="min-h-screen px-5 md:px-6 py-20 md:py-24">
      <div className="max-w-5xl mx-auto">
        <header className="mb-12">
          <p className="text-[11px] text-muted uppercase tracking-[0.2em] mb-4">
            Complete Record
          </p>
          <h1 className="text-3xl md:text-5xl font-light mb-6">Archive</h1>
          <p className="text-[15px] text-foreground leading-relaxed max-w-2xl mb-4">
            The archive contains every work submitted to MNA. Rejection is
            documented. Nothing is hidden.
          </p>
          <p className="text-[13px] text-muted leading-relaxed max-w-2xl">
            Rejected works are displayed with the same visual weight as canon
            works. Each work links to its full evaluation record including
            rationale.
          </p>
        </header>

        {/* Filter bar — URL-persisted */}
        <div className="flex flex-wrap gap-4 md:gap-6 mb-12 border-b border-border pb-4">
          {(
            [
              ["ALL", `All (${counts.all})`],
              ["CANON", `Canon (${counts.canon})`],
              ["REJECTED", `Rejected (${counts.rejected})`],
              ["IN_REVIEW", `Under Reconsideration (${counts.inReview})`],
            ] as [StatusFilter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => updateFilter(value)}
              className={`text-[12px] uppercase tracking-wider transition-colors ${
                statusFilter === value
                  ? "text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {filtered.length > 0 ? (
          <div className="space-y-4 mb-12">
            {filtered.map((work) => (
              <Link
                key={work.id}
                href={`/work/${work.id}`}
                className="block border border-border rounded-xl p-5 hover:border-muted hover:bg-surface/30 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-mono text-muted mb-1">
                      {work.id}
                    </p>
                    <p className="text-[14px] text-foreground">
                      {work.originator_id}
                      <span className="text-muted"> — {work.medium}</span>
                    </p>
                    <p className="text-[11px] text-muted mt-1">
                      Submitted{" "}
                      {formatDate(work.submission_date)}
                      {work.canon_date &&
                        work.canon_status === "CANON" &&
                        ` — Canonized ${formatDate(work.canon_date)}`}
                      {work.canon_date &&
                        work.canon_status === "REJECTED" &&
                        ` — Rejected ${formatDate(work.canon_date)}`}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-wider border border-border px-2 py-1 shrink-0">
                    {work.canon_status === "IN_REVIEW"
                      ? "Under Reconsideration"
                      : work.canon_status}
                  </span>
                </div>

                {/* Work preview */}
                <div className="mt-3 bg-[#0e0c0a] rounded-lg max-w-md overflow-hidden h-24">
                  <WorkPreview work={work} />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="border border-border rounded-xl p-16 text-center bg-surface/30 mb-12">
            <p className="text-muted text-[14px]">
              No works match this filter.
            </p>
          </div>
        )}

        <div className="flex justify-center gap-8">
          <Link
            href="/canon"
            className="text-[12px] text-muted hover:text-foreground transition-colors uppercase tracking-wider"
          >
            View Canon
          </Link>
          <Link
            href="/originators"
            className="text-[12px] text-muted hover:text-foreground transition-colors uppercase tracking-wider"
          >
            View Originators
          </Link>
        </div>
      </div>
    </div>
  );
}
