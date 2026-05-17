/**
 * AgentBonesPanel — per-agent obligations summary.
 *
 * Rendered on every /agent/[id] page inside the warm-paper band (just
 * above Recent Decisions). Shows the agent's cadence obligations and
 * whether each is currently met, approaching, or behind.
 *
 * If the agent's role has no cadence obligations defined yet (e.g.
 * Evaluators, whose obligations are reactive), the panel collapses
 * to a small "no cadence obligations defined" note so the page
 * doesn't render an empty card.
 */

import Link from "next/link";
import type { AgentBoneState, BoneState } from "@/lib/bones-detect";
import type { BoneStatus } from "@/lib/bones";

const STATUS_LABEL: Record<BoneStatus, string> = {
  current: "Current",
  approaching: "Approaching",
  behind: "Behind",
  unknown: "—",
};

// Warm-paper variants — this panel sits on the cream band, not on
// dark surfaces, so we use ink tones rather than mna-white.
const STATUS_DOT: Record<BoneStatus, string> = {
  current: "bg-emerald-700/85",
  approaching: "bg-amber-600/85",
  behind: "bg-rose-600/85",
  unknown: "bg-ink/25",
};

const STATUS_TEXT: Record<BoneStatus, string> = {
  current: "text-emerald-800/85",
  approaching: "text-amber-800/85",
  behind: "text-rose-800/85",
  unknown: "text-ink/40",
};

function daysLabel(n: number | null): string {
  if (n === null) return "never";
  if (n === 0) return "today";
  if (n === 1) return "1 day ago";
  return `${n} days ago`;
}

export default function AgentBonesPanel({ state }: { state: AgentBoneState }) {
  if (state.bones.length === 0) {
    return (
      <div className="border border-ink/15 px-5 py-4 text-[12px] text-ink/55">
        No cadence obligations defined for this role. Obligations may
        be reactive (triggered by institutional events) rather than
        cadence-based.
      </div>
    );
  }

  return (
    <div className="border border-ink/15 px-5 py-5">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[10.5px] uppercase tracking-[0.26em] text-ink/55">
          Obligations
        </p>
        <Link
          href="/institution/state"
          className="text-[10px] uppercase tracking-[0.22em] text-ink/45 hover:text-ink"
        >
          State of the Institution →
        </Link>
      </div>
      <ul className="space-y-2.5">
        {state.bones.map((b) => (
          <BoneRow key={b.spec.id} bone={b} />
        ))}
      </ul>
    </div>
  );
}

function BoneRow({ bone }: { bone: BoneState }) {
  return (
    <li className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-1 md:gap-6 text-[12.5px]">
      <div className="flex items-baseline gap-2 min-w-0">
        <span
          className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[bone.status]} shrink-0 translate-y-[-2px]`}
          aria-hidden
        />
        <span className="text-ink">{bone.spec.title}</span>
        <span className="text-ink/30 hidden md:inline">·</span>
        <span className="text-ink/55 truncate">
          every {bone.spec.cadenceDays}{" "}
          {bone.spec.cadenceDays === 1 ? "day" : "days"}
        </span>
      </div>
      <div className="flex items-baseline gap-3 shrink-0">
        <span className="text-ink/60">last {daysLabel(bone.daysSince)}</span>
        <span
          className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] ${STATUS_TEXT[bone.status]}`}
        >
          {STATUS_LABEL[bone.status]}
        </span>
      </div>
    </li>
  );
}
