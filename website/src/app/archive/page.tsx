"use client";

import Link from "next/link";
import { useState } from "react";
import { works } from "@/lib/collection";

type StatusFilter = "ALL" | "CANON" | "REJECTED" | "IN_REVIEW";

export default function ArchivePage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const filtered =
    statusFilter === "ALL"
      ? works
      : works.filter((w) => {
          if (statusFilter === "IN_REVIEW")
            return w.canon_status === "IN_REVIEW" || w.canon_status === "SUBMITTED";
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

        {/* Filter bar — functional */}
        <div className="flex flex-wrap gap-4 md:gap-6 mb-12 border-b border-border pb-4">
          {(
            [
              ["ALL", `All (${counts.all})`],
              ["CANON", `Canon (${counts.canon})`],
              ["REJECTED", `Rejected (${counts.rejected})`],
              ["IN_REVIEW", `In Review (${counts.inReview})`],
            ] as [StatusFilter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
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
                      {new Date(work.submission_date).toLocaleDateString()}
                      {work.canon_date &&
                        ` — Canonized ${new Date(work.canon_date).toLocaleDateString()}`}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-wider border border-border px-2 py-1 shrink-0">
                    {work.canon_status === "IN_REVIEW"
                      ? "In Review"
                      : work.canon_status}
                  </span>
                </div>

                {/* Work preview — contained, no overflow */}
                <div className="mt-3 bg-[#0e0c0a] rounded-lg p-3 max-w-md overflow-hidden">
                  <pre className="text-[#c8c4be] text-[10px] md:text-xs font-mono whitespace-pre-wrap break-words line-clamp-4">
                    {work.output_payload}
                  </pre>
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
