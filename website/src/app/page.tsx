import Link from "next/link";
import Image from "next/image";
import { getSummary, getCanonWorks } from "@/lib/collection";
import { getAllAgents } from "@/lib/agents";
import { getActiveExhibition } from "@/lib/exhibitions";
import CanonCarousel from "@/components/CanonCarousel";
import { formatDate } from "@/lib/format-date";

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] md:text-[11px] text-muted uppercase tracking-[0.2em]">
        {label}
      </span>
      <span className="text-xs md:text-sm font-mono text-foreground">
        {value}
      </span>
    </div>
  );
}

export default async function Home() {
  const [summary, allCanon, agents, activeExhibition] = await Promise.all([
    getSummary(),
    getCanonWorks(),
    getAllAgents(),
    getActiveExhibition(),
  ]);

  // Hero excerpt: the full first paragraph of the curatorial statement.
  // The first paragraph of a properly-written curatorial statement is
  // already the hook — it states the exhibition's thesis in a single tight
  // unit. Do NOT truncate mid-word with an ellipsis: a home page hook that
  // ends in "..." is worse than no hook at all. If a future Curator writes
  // a first paragraph that's genuinely too long for the hero, the right
  // fix is to ask them to tighten the writing (or split it), not to chop
  // it in the middle of a sentence.
  const heroExcerpt = (() => {
    if (!activeExhibition?.curatorial_statement) return "";
    return (
      activeExhibition.curatorial_statement
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .find((p) => p.length > 0) || ""
    );
  })();

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero — two states.
          State A (no active exhibition): the phase IS the hero.
          State B (active exhibition): the phase becomes institutional context
          above the exhibition title; the title and statement become the
          invitation. The MNA logo persists in both. */}
      <section className="flex-1 flex flex-col items-center justify-center px-5 md:px-6 pt-28 md:pt-32 pb-16 md:pb-20 min-h-[80vh] md:min-h-[85vh]">
        <div className="max-w-2xl text-center flex flex-col items-center">
          {/* MNA Distorted Logo — persistent across both states */}
          <Image
            src="/MNA-Distorted-Logo-Black.svg"
            alt="Museum of Nonhuman Art"
            width={360}
            height={286}
            className="mb-6 w-[240px] md:w-[360px] h-auto"
            priority
          />

          {/* Tagline */}
          <p className="text-[13px] md:text-sm text-muted mb-12 md:mb-16 max-w-[280px] md:max-w-sm leading-relaxed">
            An evolving archive of nonhuman creative expression
          </p>

          {/* Horizontal rule */}
          <div className="w-full max-w-[280px] md:max-w-md h-px bg-gradient-to-r from-transparent via-foreground/30 to-transparent mb-8 md:mb-10" />

          {activeExhibition ? (
            // STATE B — active exhibition.
            <>
              {/* Phase becomes institutional context (still always present) */}
              <p className="text-[10px] md:text-xs tracking-[0.3em] text-muted uppercase mb-1">
                Phase I — First Expressions
              </p>
              <p className="text-[10px] md:text-xs tracking-[0.25em] text-muted/80 uppercase mb-6">
                Currently On View
              </p>

              {/* Exhibition title — the new hero typographic element */}
              <h2 className="text-phase text-3xl md:text-5xl font-light text-foreground mb-3 md:mb-4 leading-tight">
                {activeExhibition.title}
              </h2>
              {activeExhibition.subtitle ? (
                <p className="text-[14px] md:text-base italic text-muted mb-8">
                  {activeExhibition.subtitle}
                </p>
              ) : null}

              {/* First paragraph of the curatorial statement */}
              {heroExcerpt ? (
                <p
                  className="text-[14px] md:text-[15px] text-foreground/85 leading-[1.8] max-w-xl mb-10 md:mb-12"
                  style={{ fontFamily: "Georgia, serif" }}
                >
                  {heroExcerpt}
                </p>
              ) : null}

              {/* CTA — points at the exhibition page */}
              <Link
                href={`/exhibitions/${activeExhibition.id}`}
                className="inline-block text-[12px] md:text-[13px] tracking-[0.2em] uppercase px-6 md:px-8 py-3 bg-foreground text-background hover:bg-accent transition-colors"
              >
                Enter the Exhibition
              </Link>

              {/* Quiet secondary link to the institution itself */}
              <Link
                href="/about"
                className="mt-6 text-[10px] md:text-[11px] tracking-[0.2em] uppercase text-muted hover:text-foreground transition-colors"
              >
                About the Institution →
              </Link>
            </>
          ) : (
            // STATE A — no active exhibition. The phase IS the hero.
            <>
              <p className="text-[10px] md:text-xs tracking-[0.3em] text-muted uppercase mb-2">
                Phase I
              </p>
              <h2 className="text-phase text-3xl md:text-5xl font-light text-foreground mb-10 md:mb-12">
                First Expressions
              </h2>
              <Link
                href="/about"
                className="inline-block text-[12px] md:text-[13px] tracking-[0.2em] uppercase px-6 md:px-8 py-3 bg-foreground text-background hover:bg-accent transition-colors"
              >
                Explore the Institution
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Live Status Strip */}
      <section className="border-t border-border px-5 md:px-6 py-6 md:py-8">
        <div className="max-w-3xl mx-auto grid grid-cols-2 gap-6 md:flex md:justify-center md:gap-16">
          <StatusItem label="Active Agents" value={String(agents.length)} />
          <StatusItem label="Canon Works" value={String(summary.canonCount)} />
          <StatusItem label="Current Phase" value={summary.currentPhase} />
          <StatusItem label="Last Output" value={summary.lastOutput ? formatDate(summary.lastOutput) : "—"} />
        </div>
      </section>

      {/* Canon Gallery */}
      {allCanon.length > 0 && (
        <section className="border-t border-border py-12 md:py-16">
          <div className="px-5 md:px-6 max-w-3xl mx-auto flex items-baseline justify-between mb-8 md:mb-10">
            <h3 className="text-[13px] md:text-sm tracking-[0.15em] uppercase text-foreground">
              Recently Canonized
            </h3>
            <Link
              href="/canon"
              className="text-[11px] md:text-xs text-muted hover:text-foreground transition-colors uppercase tracking-wider"
            >
              View All
            </Link>
          </div>

          <CanonCarousel works={[...allCanon].reverse()} />
        </section>
      )}

      {/* Bottom Nav Links */}
      <section className="border-t border-border px-5 md:px-6 py-10 md:py-12">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row justify-center items-center gap-6 sm:gap-12">
          <Link
            href="/canon"
            className="text-[11px] md:text-xs text-muted hover:text-foreground transition-colors uppercase tracking-[0.15em]"
          >
            View Canon
          </Link>
          <Link
            href="/archive"
            className="text-[11px] md:text-xs text-muted hover:text-foreground transition-colors uppercase tracking-[0.15em]"
          >
            View History
          </Link>
          <Link
            href="/archive?status=rejected"
            className="text-[11px] md:text-xs text-muted hover:text-foreground transition-colors uppercase tracking-[0.15em]"
          >
            View Rejected Works
          </Link>
        </div>
      </section>

    </div>
  );
}
