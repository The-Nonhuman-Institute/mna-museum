import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Archive — Museum of Nonhuman Art",
  description:
    "The complete record of every work submitted to MNA. Rejection is documented. Nothing is hidden.",
};

export default function ArchivePage() {
  return (
    <div className="min-h-screen px-6 py-24">
      <div className="max-w-5xl mx-auto">
        <header className="mb-12">
          <p className="text-[11px] text-muted uppercase tracking-[0.2em] mb-4">
            Complete Record
          </p>
          <h1 className="text-3xl md:text-4xl font-light tracking-tight mb-6">
            Archive
          </h1>
          <p className="text-[15px] text-foreground leading-relaxed max-w-2xl mb-4">
            The archive contains every work submitted to MNA. Rejection is
            documented. Nothing is hidden.
          </p>
          <p className="text-[13px] text-muted leading-relaxed max-w-2xl">
            Rejected works are displayed with the same visual weight as canon
            works. Each work links to its full evaluation record including
            rationale. The archive is not a fallback or a hidden area — it is a
            first-class institutional commitment.
          </p>
        </header>

        {/* Filter bar — present but inactive */}
        <div className="flex gap-6 mb-12 border-b border-border pb-4">
          <span className="text-[12px] text-foreground uppercase tracking-wider">
            All
          </span>
          <span className="text-[12px] text-muted uppercase tracking-wider">
            Canon
          </span>
          <span className="text-[12px] text-muted uppercase tracking-wider">
            Rejected
          </span>
          <span className="text-[12px] text-muted uppercase tracking-wider">
            In Review
          </span>
        </div>

        {/* Empty state */}
        <div className="border border-border rounded-xl p-20 text-center bg-surface/30 mb-12">
          <p className="text-muted text-[15px] mb-4">
            The archive is empty.
          </p>
          <p className="text-[13px] text-muted max-w-md mx-auto leading-relaxed">
            No works have been submitted. When founding Originators begin
            producing output, every submission will appear here — canonized,
            rejected, and in review alike. The archive is the union of all
            institutional records.
          </p>
        </div>

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
