"use client";

import Link from "next/link";
import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { pressDocuments, pressTypeLabels } from "@/lib/press";
import type { PressDocument } from "@/lib/press";
import { formatDate } from "@/lib/format-date";

type TypeFilter = "ALL" | PressDocument["document_type"];

export default function PressPage() {
  return (
    <Suspense>
      <PressContent />
    </Suspense>
  );
}

function PressContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialType = (searchParams.get("type") as TypeFilter) || "ALL";
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(initialType);

  const updateFilter = (type: TypeFilter) => {
    setTypeFilter(type);
    if (type === "ALL") {
      router.replace("/press", { scroll: false });
    } else {
      router.replace(`/press?type=${type}`, { scroll: false });
    }
  };

  const filtered = pressDocuments
    .filter((d) => typeFilter === "ALL" || d.document_type === typeFilter)
    .sort((a, b) => b.publication_date.localeCompare(a.publication_date));

  return (
    <div className="min-h-screen px-5 md:px-6 py-20 md:py-24">
      <div className="max-w-3xl mx-auto">
        <header className="mb-12">
          <p className="text-[11px] text-muted uppercase tracking-[0.2em] mb-4">
            Institutional Voice
          </p>
          <h1 className="text-3xl md:text-5xl font-light mb-6">Press</h1>
          <p className="text-[15px] text-foreground leading-relaxed max-w-2xl">
            Interviews, stewardship records, and institutional statements.
            The public voice of the Museum of Nonhuman Art.
          </p>
        </header>

        {/* Filter */}
        <div className="flex flex-wrap gap-4 md:gap-6 mb-12 border-b border-border pb-4">
          {(
            [
              ["ALL", "All"],
              ["interview", "Interviews"],
              ["stewardship-record", "Stewardship Records"],
              ["statement", "Statements"],
            ] as [TypeFilter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => updateFilter(value)}
              className={`text-[12px] uppercase tracking-wider transition-colors ${
                typeFilter === value
                  ? "text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {filtered.length > 0 ? (
          <div className="space-y-6 mb-12">
            {filtered.map((doc) => (
              <Link
                key={doc.id}
                href={`/press/${doc.id}`}
                className="block border border-border rounded-xl p-5 md:p-6 hover:border-muted hover:bg-surface/30 transition-all"
              >
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-[10px] font-mono text-muted uppercase tracking-wider border border-border px-2 py-0.5">
                    {pressTypeLabels[doc.document_type]}
                  </span>
                  <span className="text-[10px] font-mono text-muted">
                    {doc.id}
                  </span>
                </div>
                <h2 className="text-[17px] md:text-lg font-serif text-foreground mb-1">
                  {doc.title}
                </h2>
                {doc.subtitle && (
                  <p className="text-[13px] text-muted/70 italic mb-3">
                    {doc.subtitle}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted/60">
                  <span>{doc.subject}</span>
                  <span>·</span>
                  <span>Conducted by {doc.conducted_by}</span>
                  <span>·</span>
                  <span>{formatDate(doc.publication_date)}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="border border-border rounded-xl p-16 text-center bg-surface/30 mb-12">
            <p className="text-muted text-[14px]">
              No press documents yet. Interviews, stewardship records, and
              institutional statements will appear here.
            </p>
          </div>
        )}

        <div className="flex justify-center gap-8">
          <Link
            href="/research"
            className="text-[12px] text-muted hover:text-foreground transition-colors uppercase tracking-wider"
          >
            View Research
          </Link>
          <Link
            href="/canon"
            className="text-[12px] text-muted hover:text-foreground transition-colors uppercase tracking-wider"
          >
            View Canon
          </Link>
        </div>
      </div>
    </div>
  );
}
