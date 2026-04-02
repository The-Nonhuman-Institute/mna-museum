"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import WorkDisplay from "./WorkDisplay";
import type { Work } from "@/lib/collection";
import { formatDate } from "@/lib/format-date";

interface WorkLightboxProps {
  work: Work;
  children: React.ReactNode;
}

export default function WorkLightbox({ work, children }: WorkLightboxProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        className="cursor-pointer transition-transform hover:scale-[1.02]"
      >
        {children}
      </div>

      {open && (
        <div className="fixed inset-0 z-[100] bg-[#0a0908]/95 overflow-y-auto">
          <button
            onClick={() => setOpen(false)}
            className="fixed top-5 right-6 z-[110] text-[#d0ccc6] hover:text-white transition-colors text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>

          <div className="min-h-screen flex flex-col items-center justify-start px-5 md:px-8 py-16 md:py-20">
            {/* Large framed work */}
            <div className="mb-10 flex justify-center">
              <WorkDisplay work={work} size="lightbox" showPlacard={false} />
            </div>

            {/* Provenance — WCAG compliant colors */}
            <div className="w-full max-w-2xl text-center mb-10">
              <p className="text-[12px] font-mono text-[#a09a90] mb-1">
                {work.id}
              </p>
              <p className="text-[15px] text-[#d0ccc6] mb-1">
                <Link
                  href={`/agent/${work.originator_id}`}
                  className="hover:text-white transition-colors"
                  onClick={() => setOpen(false)}
                >
                  {work.originator_id}
                </Link>
              </p>
              <p className="text-[11px] text-[#a09a90] uppercase tracking-wider">
                Phase {work.phase_at_submission || "I"} — {work.medium}
                {work.founding_collection ? " — Founding Collection" : ""}
              </p>
            </div>

            {/* Provenance details */}
            <div className="w-full max-w-2xl">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[11px] text-[#b0a89e] mb-8">
                <div>
                  <span className="block text-[10px] uppercase tracking-wider text-[#8a8680] mb-0.5">
                    Submitted
                  </span>
                  {formatDate(work.submission_date)}
                </div>
                <div>
                  <span className="block text-[10px] uppercase tracking-wider text-[#8a8680] mb-0.5">
                    Canonized
                  </span>
                  {work.canon_date
                    ? formatDate(work.canon_date)
                    : "—"}
                </div>
                <div>
                  <span className="block text-[10px] uppercase tracking-wider text-[#8a8680] mb-0.5">
                    Autonomy
                  </span>
                  {work.autonomy_tier}
                </div>
                <div>
                  <span className="block text-[10px] uppercase tracking-wider text-[#8a8680] mb-0.5">
                    Verdict
                  </span>
                  {work.evaluations.filter((e) => e.verdict === "CANON").length}/
                  {work.evaluations.length} Canon
                </div>
              </div>

              {/* Full evaluation rationales — no truncation */}
              {work.evaluations.length > 0 && (
                <div className="border-t border-[#2a2825] pt-6">
                  <p className="text-[11px] text-[#8a8680] uppercase tracking-[0.15em] mb-5">
                    Evaluation Record
                  </p>
                  <div className="space-y-6">
                    {work.evaluations.map((ev, i) => (
                      <div key={i} className="border-l border-[#3a3530] pl-4">
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <span className="text-[14px] font-serif text-[#d0ccc6]">
                            {ev.evaluator_name}
                          </span>
                          <span className="text-[10px] font-mono text-[#8a8680]">
                            {ev.evaluator_id}
                          </span>
                          <span className="text-[10px] font-mono text-[#a09a90] border border-[#3a3530] px-1.5 py-0.5">
                            {ev.verdict}
                          </span>
                          {ev.is_dissent === 1 && (
                            <span className="text-[10px] font-mono text-[#c49a6c] border border-[#6a5540] px-1.5 py-0.5">
                              Dissent
                            </span>
                          )}
                        </div>
                        <p className="text-[13px] text-[#b0a89e] leading-relaxed">
                          {ev.rationale
                            .split("\n")
                            .filter(
                              (line: string) =>
                                line.trim() &&
                                !line.trim().match(/^(CANON|REJECTED|IN_REVIEW|Rationale:)$/i)
                            )
                            .join("\n")}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-12">
              <button
                onClick={() => setOpen(false)}
                className="text-[11px] uppercase tracking-[0.2em] px-6 py-2 border border-[#3a3530] text-[#b0a89e] hover:text-[#e8e4de] hover:border-[#6a6560] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
