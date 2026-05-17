/**
 * AgentDecisions — Recent Decisions panel for /agent/[id] surfaces.
 *
 * Renders an agent's most recent tick events and institutional
 * actions as a chronological section: observations (with their full
 * reflection), abstentions (with rationale), publications, intents,
 * and constitution amendments. Matches the bg-warm-paper / text-ink
 * vocabulary used by the other Recent / Record / History sections on
 * the agent profile pages.
 *
 * Pure presentational — the parent /agent/[id]/page.tsx server
 * component fetches the events via `fetchEventsForAgent` and passes
 * them in as a prop, so each specialized client just renders.
 */

import Link from "next/link";
import { EVENT_TYPE_LABELS, type LogEvent } from "@/lib/log";

interface AgentDecisionsProps {
  agentId: string;
  events: LogEvent[];
  /** "light" = bg-warm-paper / text-ink (default). "dark" = bg-ink / text-mna-white. */
  tone?: "light" | "dark";
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = String(d.getDate()).padStart(2, "0");
  const month = MONTHS_SHORT[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`.toUpperCase();
}

export default function AgentDecisions({
  agentId,
  events,
  tone = "light",
}: AgentDecisionsProps) {
  if (events.length === 0) return null;

  const isDark = tone === "dark";
  const sectionText = isDark ? "text-mna-white" : "text-ink";
  const borderColor = isDark ? "border-mna-white/15" : "border-ink/10";
  const eyebrowColor = isDark ? "text-mna-white/60" : "text-ink/60";
  const mutedColor = isDark ? "text-mna-white/55" : "text-ink/55";
  const bodyColor = isDark ? "text-mna-white/80" : "text-ink/80";
  const chipBorder = isDark ? "border-mna-white/30 text-mna-white" : "border-ink/40 text-ink";
  const quoteBorder = isDark ? "border-mna-white/25" : "border-ink/20";

  return (
    <section className={`mb-14 ${sectionText}`}>
      <div className={`flex items-baseline justify-between mb-6 border-b ${borderColor} pb-3`}>
        <p className={`text-[11px] font-sans uppercase tracking-[0.26em] ${eyebrowColor}`}>
          Recent Decisions
        </p>
        <Link
          href={`/log?agent=${agentId}`}
          className={`text-[10px] font-sans uppercase tracking-[0.22em] ${mutedColor} hover:${sectionText} transition-colors`}
        >
          View Full Record →
        </Link>
      </div>

      <ul className={`divide-y ${borderColor}`}>
        {events.map((event) => {
          const meta = event.metadata ?? {};
          const observation =
            typeof meta.observation === "string" ? meta.observation : null;
          const rationale =
            typeof meta.rationale === "string" ? meta.rationale : null;
          const label = EVENT_TYPE_LABELS[event.event_type] ?? event.event_type;

          return (
            <li key={event.id} className="py-5">
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <span
                  className={`inline-block px-2 py-1 border text-[9px] uppercase tracking-[0.22em] ${chipBorder}`}
                >
                  {label}
                </span>
                <span className={`text-[10.5px] uppercase tracking-[0.18em] ${mutedColor}`}>
                  {formatDate(event.created_at)}
                </span>
                {event.work_id && (
                  <Link
                    href={`/work/${event.work_id}/provenance`}
                    className={`text-[10.5px] uppercase tracking-[0.18em] ${mutedColor} hover:${sectionText} transition-colors`}
                  >
                    {event.work_id}
                  </Link>
                )}
              </div>
              <p className={`text-[13.5px] leading-[1.55] ${bodyColor} max-w-[680px]`}>
                {event.description}
              </p>
              {observation && (
                <blockquote
                  className={`text-[13px] leading-[1.65] italic ${bodyColor} max-w-[680px] mt-3 border-l ${quoteBorder} pl-4`}
                >
                  {observation}
                </blockquote>
              )}
              {rationale && !observation && (
                <p
                  className={`text-[12px] leading-[1.6] italic ${mutedColor} max-w-[680px] mt-2`}
                >
                  — {rationale}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
