import Link from "next/link";
import type { Agent } from "@/lib/agents";
import type { Work } from "@/lib/collection";
import WorkDisplay from "@/components/WorkDisplay";
import { originatorLabelShort, isNamed } from "@/lib/originator-name";

interface OriginatorCardProps {
  agent: Agent;
  works: Work[];
  canonWorks: Work[];
}

const FOUNDING_IDS = [
  "MNA-OR-0001",
  "MNA-OR-0002",
  "MNA-OR-0003",
  "MNA-OR-0004",
  "MNA-OR-0005",
  "MNA-OR-0006",
];

export function isFounding(registryId: string): boolean {
  return FOUNDING_IDS.includes(registryId);
}

function shortName(agent: Agent): string {
  return originatorLabelShort(agent.designation, agent.registryId);
}

export default function OriginatorCard({ agent, works, canonWorks }: OriginatorCardProps) {
  const firstCanon = canonWorks[0];
  const isPending = !isNamed(agent.designation);
  const canonRate =
    works.length > 0
      ? ((canonWorks.length / works.length) * 100).toFixed(1)
      : "0.0";

  const descriptor = isPending
    ? agent.functionStatement
    : agent.fullConstitution.orientation;

  return (
    <Link
      href={`/agent/${agent.registryId}`}
      className="group block bg-mna-white border border-ink/10 hover:border-ink/30 transition-colors"
    >
      {/* Square thumbnail — live signature work fills edge-to-edge */}
      <div className="relative bg-mna-white overflow-hidden aspect-square">
        {firstCanon ? (
          <>
            <div className="absolute inset-0 [&>*]:w-full [&>*]:h-full [&_svg]:w-full [&_svg]:h-full [&_img]:w-full [&_img]:h-full [&_img]:object-cover [&_iframe]:w-full [&_iframe]:h-full [&_canvas]:w-full [&_canvas]:h-full">
              <WorkDisplay
                work={firstCanon}
                size="gallery"
                framed={false}
                showPlacard={false}
              />
            </div>
            {/* Click-capture overlay so the enclosing <Link> always
                receives the click — sandboxed iframes can swallow
                pointer-events otherwise. */}
            <span className="absolute inset-0 z-10" aria-hidden />
          </>
        ) : (
          <div className="absolute inset-0 bg-warm-paper flex flex-col items-center justify-center text-center px-4">
            <p className="text-[10px] font-sans text-ink/50 mb-1.5 tracking-[0.08em]">
              {agent.registryId}
            </p>
            <p className="text-[12px] text-ink/55 italic font-display">
              {works.length > 0 ? "Awaiting first canonization" : "Awaiting first output"}
            </p>
          </div>
        )}
        {/* Status dot — top-right, same position/treatment as WorkCard */}
        <span
          className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full ${
            isPending ? "bg-ink/30" : "bg-emerald-500"
          }`}
          aria-hidden
        />
      </div>

      {/* Placard */}
      <div className="px-4 py-4 md:px-5 md:py-5">
        <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink mb-1.5 truncate">
          {shortName(agent)}
        </p>
        <p className="font-display italic text-[13px] leading-snug text-ink/80 mb-3 line-clamp-2">
          {descriptor || "—"}
        </p>
        <div className="flex items-center gap-2 text-[10px] font-sans text-ink/55 mb-3 flex-wrap">
          <span className="tabular-nums">{works.length} outputs</span>
          <span className="text-ink/25">·</span>
          <span className="tabular-nums">{canonRate}% canon</span>
          <span className="text-ink/25">·</span>
          <span>Phase I</span>
        </div>
        {firstCanon && (
          <span className="inline-block text-[9px] font-sans uppercase tracking-[0.22em] text-ink/60 border border-ink/15 px-2 py-0.5">
            Latest Canon
          </span>
        )}
        {isPending && (
          <span className="inline-block text-[9px] font-sans uppercase tracking-[0.22em] text-ink/60 border border-ink/15 px-2 py-0.5">
            Pre-Emergence
          </span>
        )}
      </div>
    </Link>
  );
}
