"use client";

import Link from "next/link";
import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { canon } from "@/lib/collection";
import WorkDisplay from "@/components/WorkDisplay";

type PhaseFilter = "ALL" | "I" | "II" | "III" | "IV";

export default function CanonPage() {
  return (
    <Suspense>
      <CanonContent />
    </Suspense>
  );
}

function CanonContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialPhase = (searchParams.get("phase") as PhaseFilter) || "ALL";
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>(initialPhase);

  const updateFilter = (filter: PhaseFilter) => {
    setPhaseFilter(filter);
    if (filter === "ALL") {
      router.replace("/canon", { scroll: false });
    } else {
      router.replace(`/canon?phase=${filter}`, { scroll: false });
    }
  };

  const filtered =
    phaseFilter === "ALL"
      ? canon
      : canon.filter((w) => (w.phase_at_submission || "I") === phaseFilter);

  const hasWorks = canon.length > 0;

  return (
    <div className="min-h-screen px-5 md:px-6 py-20 md:py-24">
      <div className="max-w-5xl mx-auto">
        <header className="mb-12">
          <p className="text-[11px] text-muted uppercase tracking-[0.2em] mb-4">
            Permanent Collection
          </p>
          <h1 className="text-3xl md:text-5xl font-light mb-6">Canon</h1>
          <p className="text-[15px] text-muted leading-relaxed max-w-2xl">
            Works accepted into the permanent collection by the Evaluation
            Council. Each work carries the full provenance chain: Originator,
            submission record, evaluation rationale, and canon date.
          </p>
        </header>

        {/* Phase filter — functional */}
        <div className="flex flex-wrap gap-4 md:gap-6 mb-12 border-b border-border pb-4">
          {(
            [
              ["ALL", "All Phases"],
              ["I", "Phase I"],
              ["II", "Phase II"],
              ["III", "Phase III"],
              ["IV", "Phase IV"],
            ] as [PhaseFilter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => updateFilter(value)}
              className={`text-[12px] uppercase tracking-wider transition-colors ${
                phaseFilter === value
                  ? "text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {hasWorks ? (
          <>
            {filtered.length > 0 ? (
              <div className="flex flex-wrap justify-center items-end gap-8 md:gap-12 mb-16">
                {filtered.map((work) => (
                  <Link
                    key={work.id}
                    href={`/work/${work.id}`}
                    className="transition-transform hover:scale-[1.02] cursor-pointer relative"
                  >
                    <WorkDisplay work={work} size="gallery" />
                    {/* Transparent overlay to capture clicks above iframes/canvases */}
                    <div className="absolute inset-0 z-10" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="border border-border rounded-xl p-16 text-center bg-surface/30 mb-16">
                <p className="text-muted text-[14px]">
                  No works in this phase yet.
                </p>
              </div>
            )}

            <div className="text-center text-[11px] text-muted uppercase tracking-wider mb-8">
              {canon.length} work{canon.length !== 1 ? "s" : ""} in the
              permanent collection
            </div>
          </>
        ) : (
          <div className="border border-border rounded-xl p-20 text-center bg-surface/30 mb-12">
            <p className="text-muted text-[15px] mb-3">The canon is empty.</p>
            <p className="text-[13px] text-muted max-w-md mx-auto leading-relaxed">
              The Evaluation Council has not yet rendered its first verdict.
            </p>
          </div>
        )}

        <div className="flex justify-center gap-8 mt-8">
          <Link
            href="/archive"
            className="text-[12px] text-muted hover:text-foreground transition-colors uppercase tracking-wider"
          >
            View Archive
          </Link>
          <Link
            href="/evaluation/council"
            className="text-[12px] text-muted hover:text-foreground transition-colors uppercase tracking-wider"
          >
            View Council
          </Link>
        </div>
      </div>
    </div>
  );
}
