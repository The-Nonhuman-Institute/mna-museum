/**
 * /events/archive — The permanent record of every ceremony designated
 * by the institution. Past, present, future, and cancelled all live
 * here at the same weight.
 *
 * This is the "Browse Record" destination from /events. Where /events
 * is forward-looking (what is about to happen), /events/archive is
 * complete — nothing is hidden, nothing reorders. Cancelled ceremonies
 * remain visible because the institution does not retroactively unmake
 * its calendar; what was scheduled was scheduled.
 *
 * Layout:
 *   - Hero with institutional eyebrow + Record headline + framing prose
 *   - Two-column body: chronological list of all ceremonies (left),
 *     summary by status + type + cross-links (right)
 *   - All ceremonies show full status pill so cancelled and completed
 *     read alongside upcoming without editorial sorting
 */

import Link from "next/link";
import type { Metadata } from "next";
import {
  listAllCeremonies,
  ceremonyCounts,
  ceremonyTypeLabel,
  type Ceremony,
  type CeremonyStatus,
} from "@/lib/ceremonies";
import EventThumbnail from "@/components/EventThumbnail";

export const metadata: Metadata = {
  title: "The Record — Events — Museum of Nonhuman Art",
  description:
    "Every ceremony designated by the institution — upcoming, in progress, completed, cancelled. The permanent calendar archive.",
};

// Past + cancelled ceremonies are immutable. Future ceremonies show
// up here too, but they don't churn. 30min ISR is fine.
export const revalidate = 1800;

const MONTHS_SHORT = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

function parseUtc(iso: string): Date {
  const t = iso.includes("T") ? iso : iso.replace(" ", "T");
  return new Date(t.endsWith("Z") ? t : t + "Z");
}

function shortDateParts(iso: string): { month: string; day: string; year: string } {
  const d = parseUtc(iso);
  if (Number.isNaN(d.getTime())) return { month: "—", day: "—", year: "—" };
  return {
    month: MONTHS_SHORT[d.getUTCMonth()],
    day: String(d.getUTCDate()).padStart(2, "0"),
    year: String(d.getUTCFullYear()),
  };
}

function formatTime(iso: string): string {
  const d = parseUtc(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function coverWorkIdOf(c: Ceremony): string | null {
  const m = (c.metadata ?? {}) as Record<string, unknown>;
  return typeof m.cover_work_id === "string" ? m.cover_work_id : null;
}

function yearOf(iso: string): string {
  const d = parseUtc(iso);
  return Number.isNaN(d.getTime()) ? "—" : String(d.getUTCFullYear());
}

function groupByYear(ceremonies: Ceremony[]): Array<{ year: string; items: Ceremony[] }> {
  const map = new Map<string, Ceremony[]>();
  for (const c of ceremonies) {
    const y = yearOf(c.scheduled_at);
    if (!map.has(y)) map.set(y, []);
    map.get(y)!.push(c);
  }
  return Array.from(map.entries()).map(([year, items]) => ({ year, items }));
}

export default async function EventsArchivePage() {
  const [all, counts] = await Promise.all([listAllCeremonies(), ceremonyCounts()]);
  const grouped = groupByYear(all);

  return (
    <div className="bg-ink text-mna-white min-h-screen">
      <Hero total={counts.total} />

      <section className="px-5 md:px-10 lg:px-16 pb-24">
        <div className="max-w-[1280px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10">
            <ArchiveList grouped={grouped} />
            <ArchiveSidebar counts={counts} />
          </div>
        </div>
      </section>
    </div>
  );
}

function Hero({ total }: { total: number }) {
  return (
    <section className="px-5 md:px-10 lg:px-16 pt-14 md:pt-20 pb-10">
      <div className="max-w-[1280px] mx-auto">
        <Link
          href="/events"
          className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 hover:text-mna-white"
        >
          ← Events
        </Link>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10 lg:gap-12 mt-6">
          <div>
            <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55 mb-5">
              Institutional Record
            </p>
            <h1
              className="font-serif font-light text-mna-white"
              style={{
                fontSize: "clamp(46px, 7vw, 86px)",
                lineHeight: "1.02",
                letterSpacing: "-0.005em",
              }}
            >
              The Record
            </h1>
            <div className="w-12 h-px bg-mna-white/35 mt-7 mb-7" />
            <p className="text-[15px] leading-[1.55] text-mna-white/72 max-w-[620px]">
              Every ceremony the institution has ever designated — those
              that have happened, those that have not yet happened, and
              those that were called off. Nothing is removed. A cancelled
              opening remains in the record alongside a completed one,
              because the institution does not retroactively unmake its
              calendar; what was scheduled was scheduled.
            </p>
            <p className="text-[14px] leading-[1.6] text-mna-white/60 max-w-[620px] mt-4">
              The Record is chronological, not curated. To see what is
              about to happen, return to <Link href="/events" className="underline decoration-mna-white/35 hover:decoration-mna-white">Events</Link>.
              To see what is happening across the institution at every
              level, see <Link href="/log" className="underline decoration-mna-white/35 hover:decoration-mna-white">The Log</Link>.
            </p>
          </div>
          <div className="lg:pt-2">
            <div className="border border-mna-white/15 p-5">
              <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-3">
                Total Ceremonies
              </p>
              <p className="text-[42px] font-serif font-light text-mna-white tabular-nums leading-none">
                {total}
              </p>
              <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 mt-2">
                designated
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ArchiveList({
  grouped,
}: {
  grouped: Array<{ year: string; items: Ceremony[] }>;
}) {
  if (grouped.length === 0) {
    return (
      <div>
        <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55 mb-5">
          Full Record
        </p>
        <div className="border border-mna-white/15 px-6 py-12 text-[13px] text-mna-white/55 italic leading-[1.6]">
          The Record is empty. No ceremonies have been designated yet.
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55 mb-5">
        Full Record
      </p>
      <div className="space-y-10">
        {grouped.map(({ year, items }) => (
          <YearBlock key={year} year={year} items={items} />
        ))}
      </div>
    </div>
  );
}

function YearBlock({ year, items }: { year: string; items: Ceremony[] }) {
  return (
    <div>
      <div className="flex items-baseline justify-between border-b border-mna-white/15 pb-3 mb-4">
        <p className="font-serif text-[28px] text-mna-white leading-none">
          {year}
        </p>
        <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 tabular-nums">
          {items.length} {items.length === 1 ? "ceremony" : "ceremonies"}
        </p>
      </div>
      <ul>
        {items.map((c) => (
          <ArchiveRow key={c.id} ceremony={c} />
        ))}
      </ul>
    </div>
  );
}

function ArchiveRow({ ceremony }: { ceremony: Ceremony }) {
  const parts = shortDateParts(ceremony.scheduled_at);
  const venue =
    ceremony.constellation === "chamber"
      ? "The Chamber"
      : ceremony.constellation === "solo_exhibition"
      ? "Solo Exhibition Hall"
      : ceremony.constellation === "exhibition"
      ? "Exhibition Hall"
      : "The Spatial Museum";

  return (
    <li className="border-b border-mna-white/10">
      <Link
        href={`/events/${ceremony.id}`}
        className="grid grid-cols-[64px_72px_1fr_auto_auto] items-center gap-4 py-4 group"
      >
        <div className="text-center">
          <p className="text-[10px] uppercase tracking-[0.22em] text-mna-white/55 tabular-nums">
            {parts.month}
          </p>
          <p className="text-[22px] font-serif text-mna-white tabular-nums leading-none mt-0.5">
            {parts.day}
          </p>
          <p className="text-[9.5px] uppercase tracking-[0.22em] text-mna-white/45 tabular-nums mt-0.5">
            {parts.year}
          </p>
        </div>
        <EventThumbnail
          workId={ceremony.work_id}
          coverWorkId={coverWorkIdOf(ceremony)}
          ceremonyType={ceremony.ceremony_type}
          seed={ceremony.id}
          size="md"
          className="!w-16 !h-16 !aspect-square"
        />
        <div className="min-w-0">
          <p className="text-[9.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-1">
            {ceremonyTypeLabel(ceremony.ceremony_type)}
          </p>
          <p className="font-serif text-[15px] leading-tight text-mna-white truncate group-hover:underline decoration-mna-white/35 underline-offset-4">
            {ceremony.title}
          </p>
          <p className="text-[10.5px] text-mna-white/55 mt-1">
            {venue} · {formatTime(ceremony.scheduled_at)} UTC
          </p>
        </div>
        <StatusPill status={ceremony.status} />
        <span className="text-mna-white/45 group-hover:text-mna-white text-[14px] pl-2">
          →
        </span>
      </Link>
    </li>
  );
}

function StatusPill({ status }: { status: CeremonyStatus }) {
  const styles: Record<CeremonyStatus, { label: string; cls: string }> = {
    scheduled: {
      label: "Scheduled",
      cls: "text-mna-white/65 border-mna-white/25",
    },
    in_progress: {
      label: "Live",
      cls: "text-emerald-300 border-emerald-400/45",
    },
    completed: {
      label: "Completed",
      cls: "text-mna-white/55 border-mna-white/15",
    },
    cancelled: {
      label: "Cancelled",
      cls: "text-mna-white/45 border-mna-white/15 line-through decoration-mna-white/30",
    },
  };
  const { label, cls } = styles[status];
  return (
    <span
      className={`inline-block text-[9.5px] uppercase tracking-[0.22em] px-2 py-1 border ${cls}`}
    >
      {label}
    </span>
  );
}

function ArchiveSidebar({
  counts,
}: {
  counts: { total: number; by_status: Record<CeremonyStatus, number>; by_type: Record<string, number> };
}) {
  const statusRows: Array<{ key: CeremonyStatus; label: string }> = [
    { key: "scheduled", label: "Scheduled" },
    { key: "in_progress", label: "In Progress" },
    { key: "completed", label: "Completed" },
    { key: "cancelled", label: "Cancelled" },
  ];

  const typeRows = Object.entries(counts.by_type)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <aside className="space-y-6 lg:sticky lg:top-24 self-start">
      <div className="border border-mna-white/15 p-5">
        <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-4">
          By Status
        </p>
        <ul className="space-y-2">
          {statusRows.map(({ key, label }) => (
            <li
              key={key}
              className="flex items-baseline justify-between text-[11px] uppercase tracking-[0.22em]"
            >
              <span className="text-mna-white/65">{label}</span>
              <span className="text-mna-white tabular-nums">
                {counts.by_status[key] ?? 0}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {typeRows.length > 0 ? (
        <div className="border border-mna-white/15 p-5">
          <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-4">
            By Type
          </p>
          <ul className="space-y-2">
            {typeRows.map(([type, n]) => (
              <li
                key={type}
                className="flex items-baseline justify-between text-[11px] uppercase tracking-[0.22em]"
              >
                <span className="text-mna-white/65">
                  {ceremonyTypeLabel(type)}
                </span>
                <span className="text-mna-white tabular-nums">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="border border-mna-white/15 p-5">
        <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-3">
          About The Record
        </p>
        <p className="text-[12.5px] leading-[1.6] text-mna-white/65">
          Cancelled ceremonies are not removed. A designation that was
          undone remains visible because the institution does not erase
          its own decisions — it records the reversal alongside the
          original.
        </p>
        <div className="mt-5 pt-4 border-t border-mna-white/10 space-y-2">
          <SidebarLink href="/log" label="The Log" />
          <SidebarLink href="/events" label="Upcoming Events" />
          <SidebarLink href="/events/submit" label="Submit a Proposal" />
          <SidebarLink href="/api/calendar.ics" label="Subscribe (.ics)" />
        </div>
      </div>
    </aside>
  );
}

function SidebarLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 hover:text-mna-white"
    >
      → {label}
    </Link>
  );
}
