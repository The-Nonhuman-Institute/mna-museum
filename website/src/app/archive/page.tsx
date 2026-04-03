"use client";

import Link from "next/link";
import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { works } from "@/lib/collection";
import WorkDisplay from "@/components/WorkDisplay";

type StatusFilter = "ALL" | "CANON" | "REJECTED" | "IN_REVIEW";

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
          <div className="flex flex-wrap justify-center items-end gap-8 md:gap-12 mb-12">
            {filtered.map((work) => (
              <Link
                key={work.id}
                href={`/work/${work.id}`}
                className="transition-transform hover:scale-[1.02] cursor-pointer relative"
              >
                <div className="absolute inset-0 z-10" />
                <WorkDisplay work={work} size="gallery" showPlacard={false} />
                <div className="mt-3 text-center">
                  {work.title && (
                    <p className="text-[13px] font-serif italic text-foreground/80 mb-1">
                      {work.title}
                    </p>
                  )}
                  <p className="text-[11px] font-mono text-muted">
                    {work.id}
                  </p>
                  <p className="text-[10px] text-muted/60 mt-0.5">
                    {work.originator_id}
                    <span className="mx-1">·</span>
                    <span className={
                      work.canon_status === "CANON" ? "text-foreground/60" :
                      work.canon_status === "IN_REVIEW" ? "text-amber-600/60" :
                      "text-muted/40"
                    }>
                      {work.canon_status === "IN_REVIEW"
                        ? "Reconsidering"
                        : work.canon_status === "CANON"
                          ? "Canon"
                          : "Rejected"}
                    </span>
                  </p>
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
