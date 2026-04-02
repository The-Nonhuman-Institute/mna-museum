"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import type { Work } from "@/lib/collection";
import WorkDisplay from "./WorkDisplay";

interface ResearchBodyProps {
  body: string;
  referencedWorks?: string[];
  referencedAgents?: string[];
  /** Pre-resolved work objects for modal display */
  worksMap: Record<string, Work>;
}

function WorkModal({
  work,
  onClose,
}: {
  work: Work;
  onClose: () => void;
}) {
  // Close on escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 md:p-10"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />

      {/* Modal content — constrained to viewport */}
      <div
        className="relative z-10 max-w-md w-full max-h-[85vh] flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button — large tap target on mobile */}
        <button
          onClick={onClose}
          className="self-end mb-4 text-muted hover:text-foreground transition-colors text-[12px] uppercase tracking-wider px-2 py-1"
        >
          Close
        </button>

        {/* Work in frame — gallery size on mobile, detail on desktop */}
        <div className="flex justify-center">
          <div className="block md:hidden">
            <WorkDisplay work={work} size="gallery" showPlacard={false} />
          </div>
          <div className="hidden md:block">
            <WorkDisplay work={work} size="detail" showPlacard={false} />
          </div>
        </div>

        {/* Minimal identification */}
        <div className="text-center mt-4">
          <p className="text-[12px] font-mono text-muted">{work.id}</p>
          <p className="text-[13px] text-foreground mt-1">
            {work.originator_id}
            <span className="text-muted"> — {work.medium}</span>
          </p>
          <p className="text-[10px] text-muted/60 mt-1 uppercase tracking-wider">
            Phase {work.phase_at_submission || "I"}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ResearchBody({
  body,
  referencedWorks,
  referencedAgents,
  worksMap,
}: ResearchBodyProps) {
  const [modalWork, setModalWork] = useState<Work | null>(null);

  const openWork = useCallback(
    (workId: string) => {
      const work = worksMap[workId];
      if (work) setModalWork(work);
    },
    [worksMap]
  );

  const paragraphs = body.split("\n");
  const elements: React.ReactNode[] = [];

  // Build refs list — works first (longer IDs match before agent IDs)
  const allRefs = [
    ...(referencedWorks || []).map((id) => ({ id, type: "work" as const })),
    ...(referencedAgents || []).map((id) => ({ id, type: "agent" as const })),
  ];

  for (let i = 0; i < paragraphs.length; i++) {
    const line = paragraphs[i];

    if (!line.trim()) {
      elements.push(<div key={i} className="h-4" />);
      continue;
    }

    if (line.startsWith("### ")) {
      elements.push(
        <h4 key={i} className="text-[14px] font-serif font-semibold text-foreground mt-8 mb-3">
          {line.slice(4)}
        </h4>
      );
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(
        <h3 key={i} className="text-[17px] font-serif font-semibold text-foreground mt-10 mb-4">
          {line.slice(3)}
        </h3>
      );
      continue;
    }
    if (line.startsWith("# ")) {
      elements.push(
        <h2 key={i} className="text-xl font-serif font-semibold text-foreground mt-12 mb-5">
          {line.slice(2)}
        </h2>
      );
      continue;
    }
    if (line.trim() === "---") {
      elements.push(<hr key={i} className="border-border my-8" />);
      continue;
    }

    // Parse inline references
    if (allRefs.length > 0) {
      const parts: React.ReactNode[] = [];
      let remaining = line;
      let keyIdx = 0;

      while (remaining.length > 0) {
        let earliest = -1;
        let earliestRef: (typeof allRefs)[0] | null = null;

        for (const ref of allRefs) {
          const idx = remaining.indexOf(ref.id);
          if (idx !== -1 && (earliest === -1 || idx < earliest)) {
            earliest = idx;
            earliestRef = ref;
          }
        }

        if (earliest === -1 || !earliestRef) {
          parts.push(remaining);
          break;
        }

        if (earliest > 0) {
          parts.push(remaining.slice(0, earliest));
        }

        if (earliestRef.type === "work" && worksMap[earliestRef.id]) {
          // Work reference — opens modal
          const workId = earliestRef.id;
          parts.push(
            <button
              key={`ref-${keyIdx++}`}
              onClick={() => openWork(workId)}
              className="font-mono text-[13px] text-foreground hover:text-accent underline underline-offset-2 decoration-border hover:decoration-foreground transition-colors cursor-pointer"
            >
              {earliestRef.id}
            </button>
          );
        } else {
          // Agent reference — navigates to agent page
          parts.push(
            <Link
              key={`ref-${keyIdx++}`}
              href={`/agent/${earliestRef.id}`}
              className="font-mono text-[13px] text-foreground hover:text-accent underline underline-offset-2 decoration-border hover:decoration-foreground transition-colors"
            >
              {earliestRef.id}
            </Link>
          );
        }

        remaining = remaining.slice(earliest + earliestRef.id.length);
      }

      elements.push(
        <p key={i} className="text-[15px] text-foreground/90 leading-[1.8] mb-1">
          {parts}
        </p>
      );
    } else {
      elements.push(
        <p key={i} className="text-[15px] text-foreground/90 leading-[1.8] mb-1">
          {line}
        </p>
      );
    }
  }

  return (
    <>
      <article className="mb-16">{elements}</article>

      {/* Work preview modal */}
      {modalWork && (
        <WorkModal work={modalWork} onClose={() => setModalWork(null)} />
      )}
    </>
  );
}
