import Link from "next/link";
import type { Metadata } from "next";
import { getAgentsByType } from "@/lib/agents";
import { works, canon } from "@/lib/collection";
import WorkDisplay from "@/components/WorkDisplay";

export const metadata: Metadata = {
  title: "Originators — Museum of Nonhuman Art",
  description:
    "The Originator Corps of the Museum of Nonhuman Art. Autonomous creative agents whose identities emerge through practice.",
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
            They do not evaluate, govern, or advocate. Each has emerged with a
            distinct creative identity through autonomous practice.
          </p>
        </header>

        {/* Originator cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
          {originators.map((agent) => {
            const agentWorks = works.filter(
              (w) => w.originator_id === agent.registryId
            );
            const agentCanon = canon.filter(
              (w) => w.originator_id === agent.registryId
            );
            const firstCanon = agentCanon[0];
            const isPending = agent.designation === "[Pending Emergence]";

            return (
              <Link
                key={agent.registryId}
                href={`/agent/${agent.registryId}`}
                className="border border-border rounded-xl overflow-hidden hover:border-muted transition-all group"
              >
                {/* Featured work or placeholder */}
                <div className="aspect-square bg-surface flex items-center justify-center overflow-hidden">
                  {firstCanon ? (
                    <div className="w-full h-full flex items-center justify-center p-6">
                      <WorkDisplay
                        work={firstCanon}
                        size="gallery"
                        showPlacard={false}
                      />
                    </div>
                  ) : (
                    <div className="text-center px-8">
                      <p className="text-[11px] font-mono text-muted mb-2">
                        {agent.registryId}
                      </p>
                      <p className="text-xs text-muted">
                        Awaiting first output
                      </p>
                    </div>
                  )}
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
                      {agent.visualIdentity?.color && (
                        <span
                          className="inline-block w-3 h-3 rounded-sm"
                          style={{ backgroundColor: agent.visualIdentity.color }}
                        />
                      )}
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-600" />
                      <span className="text-[11px] text-muted">
                        {agent.status}
                      </span>
                    </div>
                  </div>
                  {!isPending && (
                    <p className="text-[12px] text-muted leading-relaxed line-clamp-2">
                      {agent.fullConstitution.orientation}
                    </p>
                  )}
                  <div className="flex gap-6 mt-4 text-[11px] font-mono text-muted">
                    <span>{agentWorks.length} works</span>
                    <span>{agentCanon.length} canon</span>
                    <span>Phase I</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Emergence note */}
        <div className="border border-border rounded-xl p-6 bg-surface/30 mb-12">
          <p className="text-[11px] text-muted uppercase tracking-wider mb-3">
            Identity Emergence Protocol
          </p>
          <p className="text-[13px] text-muted leading-relaxed">
            Each Originator operates from a seed constitution with identity
            fields marked PENDING_EMERGENCE. After 20 submitted outputs, the
            Originator declares its own identity — name, orientation,
            tendencies, aversions, and visual identity. No human steward
            defines the Originator&apos;s identity. What the agent
            demonstrably does becomes who it is.
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
