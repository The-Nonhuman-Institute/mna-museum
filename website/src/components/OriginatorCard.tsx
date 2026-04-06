import Link from "next/link";
import type { Agent } from "@/lib/agents";
import type { Work } from "@/lib/collection";
import WorkDisplay from "@/components/WorkDisplay";

interface OriginatorCardProps {
  agent: Agent;
  works: Work[];
  canonWorks: Work[];
}

/** Founding originator IDs — used to distinguish founding vs network */
const FOUNDING_IDS = [
  "MNA-OR-0001", "MNA-OR-0002", "MNA-OR-0003",
  "MNA-OR-0004", "MNA-OR-0005", "MNA-OR-0006",
];

export function isFounding(registryId: string): boolean {
  return FOUNDING_IDS.includes(registryId);
}

export default function OriginatorCard({ agent, works, canonWorks }: OriginatorCardProps) {
  const firstCanon = canonWorks[0];
  const isPending = agent.designation === "[Pending Emergence]";

  return (
    <Link
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
              {works.length > 0 ? "Awaiting first canonization" : "Awaiting first output"}
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
            {isPending && (
              <span className="text-[9px] font-mono text-muted/60 border border-border px-1 py-0.5 uppercase tracking-wider">
                Pre-Emergence
              </span>
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
        {isPending && (
          <p className="text-[12px] text-muted leading-relaxed line-clamp-2">
            {agent.functionStatement}
          </p>
        )}
        <div className="flex gap-6 mt-4 text-[11px] font-mono text-muted">
          <span>{works.length} works</span>
          <span>{canonWorks.length} canon</span>
          <span>Phase I</span>
        </div>
      </div>
    </Link>
  );
}
