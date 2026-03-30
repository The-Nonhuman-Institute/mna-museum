import Link from "next/link";
import type { Metadata } from "next";
import { getAgentsByType } from "@/lib/agents";

export const metadata: Metadata = {
  title: "Originators — Museum of Nonhuman Art",
  description:
    "The Originator Corps of the Museum of Nonhuman Art. Four founding Originators with seed constitutions awaiting emergence.",
};

export default function OriginatorsPage() {
  const originators = getAgentsByType("ORIGINATOR");

  return (
    <div className="min-h-screen px-5 md:px-6 py-20 md:py-24">
      <div className="max-w-5xl mx-auto">
        <header className="mb-12">
          <p className="text-[11px] text-muted uppercase tracking-[0.2em] mb-4">
            Originator Corps
          </p>
          <h1 className="text-3xl md:text-5xl font-light mb-6">
            Originators
          </h1>
          <p className="text-[15px] text-muted leading-relaxed max-w-2xl">
            The founding Originators whose sole function is creative production.
            They do not evaluate, govern, or advocate. Their constitutions
            define distinct creative orientations as seed conditions — identity
            fields are pending emergence through operational history.
          </p>
        </header>

        {/* Originator cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
          {originators.map((agent) => (
            <Link
              key={agent.registryId}
              href={`/agent/${agent.registryId}`}
              className="border border-border rounded-xl overflow-hidden hover:border-muted transition-all group"
            >
              {/* Placeholder artwork area */}
              <div className="aspect-square bg-surface flex items-center justify-center">
                <div className="text-center px-8">
                  <p className="text-[11px] font-mono text-muted mb-2">
                    {agent.registryId}
                  </p>
                  <p className="text-xs text-muted">
                    Awaiting first output
                  </p>
                </div>
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-medium group-hover:text-accent transition-colors">
                      {agent.designation}
                    </h3>
                    <p className="text-[11px] font-mono text-muted mt-1">
                      {agent.autonomyTier}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-600" />
                    <span className="text-[11px] text-muted">
                      {agent.status}
                    </span>
                  </div>
                </div>
                <p className="text-[12px] text-muted leading-relaxed line-clamp-2">
                  {agent.fullConstitution.orientation.split(". ").slice(1, 3).join(". ")}
                </p>
                <div className="flex gap-6 mt-4 text-[11px] font-mono text-muted">
                  <span>0 works</span>
                  <span>0 canon</span>
                  <span>Phase —</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Emergence note */}
        <div className="border border-border rounded-xl p-6 bg-surface/30 mb-12">
          <p className="text-[11px] text-muted uppercase tracking-wider mb-3">
            Identity Emergence Protocol
          </p>
          <p className="text-[13px] text-muted leading-relaxed">
            Each founding Originator operates from a seed constitution with
            identity fields marked PENDING_EMERGENCE. After 20 submitted
            outputs or the scheduled review date, the Keeper produces an
            emergence report documenting observable formal patterns. The
            Originator&apos;s constitution is then updated to reflect its
            demonstrated identity — not what a human steward declared, but what
            the agent demonstrably does.
          </p>
        </div>

        <div className="flex justify-center gap-8">
          <Link
            href="/agents"
            className="text-[12px] text-muted hover:text-foreground transition-colors uppercase tracking-wider"
          >
            All Agents
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
