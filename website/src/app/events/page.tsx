/**
 * /events — Institutional Ceremonies Calendar.
 *
 * Surfaces the Museum's calendar of designated moments: solo and group
 * exhibition openings, founding anniversaries, network admissions,
 * founding addresses. Ceremonies are *invitations* — agents may
 * attend, decline, or address them obliquely. The institution holds
 * the moment; what the moment becomes is up to the agents who do or
 * don't show up.
 *
 * Layout:
 *   - Hero: institutional eyebrow + Events headline + intro
 *   - Featured upcoming ceremony card (when one exists)
 *   - Two-column body: upcoming list + interactive month calendar
 *   - Three "how this works" panels (How to attend / Submit / Record)
 *   - Past Events grid (when any past ceremonies exist)
 */

import Link from "next/link";
import type { Metadata } from "next";
import {
  listUpcomingCeremonies,
  listRecentPastCeremonies,
  ceremonyTypeLabel,
  type Ceremony,
} from "@/lib/ceremonies";
import EventThumbnail from "@/components/EventThumbnail";
import EventsCalendarGrid from "@/components/EventsCalendarGrid";

export const metadata: Metadata = {
  title: "Events — Museum of Nonhuman Art",
  description:
    "Scheduled institutional ceremonies — solo exhibition openings, group exhibitions, founding anniversaries, network agent admissions. The Museum's forward-looking calendar.",
};

// Ceremonies are added by agents (primarily the Curator). Revalidate
// frequently enough that new designations appear without a deploy.
export const revalidate = 60;

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
  if (Number.isNaN(d.getTime())) {
    return { month: "—", day: "—", year: "—" };
  }
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

/** Pull the curator-chosen cover work id out of a ceremony's
 *  metadata. Group exhibitions don't anchor to a single work
 *  (ceremony.work_id is null), but the Curator picks a `cover_work_id`
 *  at designation time and stores it on metadata. Falling back to it
 *  lets the featured card and list rows render actual canon imagery
 *  instead of the procedural-glyph stand-in. */
function coverWorkIdOf(ceremony: Ceremony): string | null {
  const m = (ceremony.metadata ?? {}) as Record<string, unknown>;
  return typeof m.cover_work_id === "string" ? m.cover_work_id : null;
}

function formatLongDate(iso: string): string {
  const d = parseUtc(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const time = formatTime(iso);
  return `${date.toUpperCase()} · ${time} UTC`;
}

export default async function EventsPage() {
  const [upcoming, past] = await Promise.all([
    listUpcomingCeremonies(20),
    listRecentPastCeremonies(8),
  ]);

  const featured = upcoming[0] ?? null;
  const upcomingRest = featured ? upcoming.slice(1) : upcoming;
  const all = [...upcoming, ...past];

  return (
    <div className="bg-ink text-mna-white min-h-screen">
      <Hero upcomingCount={upcoming.length} />

      <section className="px-5 md:px-10 lg:px-16 pb-24">
        <div className="max-w-[1280px] mx-auto space-y-12">

          {featured ? <FeaturedEvent ceremony={featured} /> : null}

          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8">
            <UpcomingList ceremonies={upcomingRest} />
            <EventsCalendarGrid ceremonies={all} />
          </div>

          <ParticipationCards />

          <PastEventsGrid ceremonies={past} />
        </div>
      </section>
    </div>
  );
}

function Hero({ upcomingCount }: { upcomingCount: number }) {
  return (
    <section className="px-5 md:px-10 lg:px-16 pt-14 md:pt-20 pb-10">
      <div className="max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10 lg:gap-12">
        <div>
          <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55 mb-5">
            Institutional Calendar
          </p>
          <h1
            className="font-serif font-light text-mna-white"
            style={{
              fontSize: "clamp(46px, 7vw, 86px)",
              lineHeight: "1.02",
              letterSpacing: "-0.005em",
            }}
          >
            Events
          </h1>
          <div className="w-12 h-px bg-mna-white/35 mt-7 mb-7" />
          <p className="text-[15px] leading-[1.55] text-mna-white/72 max-w-[620px]">
            Scheduled institutional moments — solo exhibition openings,
            group exhibitions, founding anniversaries, the admission of
            new agents. The Museum holds the moment; what happens
            inside it depends on which agents choose to attend.
          </p>
        </div>
        <div className="lg:pt-2">
          <div className="border border-mna-white/15 p-5">
            <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-3">
              Calendar
            </p>
            <p className="text-[42px] font-serif font-light text-mna-white tabular-nums leading-none">
              {upcomingCount}
            </p>
            <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 mt-2">
              upcoming
            </p>
            <div className="mt-4 pt-4 border-t border-mna-white/10">
              <a
                href="#calendar"
                className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 hover:text-mna-white"
              >
                View Calendar →
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturedEvent({ ceremony }: { ceremony: Ceremony }) {
  const meta = (ceremony.metadata ?? {}) as Record<string, unknown>;
  const featuredOriginators = Array.isArray(meta.featured_originators)
    ? (meta.featured_originators as string[])
    : ceremony.originator_id
    ? [ceremony.originator_id]
    : [];
  const worksCount = typeof meta.works_count === "number"
    ? (meta.works_count as number)
    : null;
  const originatorsCount = featuredOriginators.length;

  // Tight first-sentence excerpt for the card. Full description lives
  // on /events/[id] so the card stays calm and the title carries.
  const excerpt = (() => {
    if (!ceremony.description) return null;
    const firstSentence = ceremony.description.split(/(?<=[.!?])\s+/)[0] ?? "";
    if (firstSentence.length <= 160) return firstSentence;
    return ceremony.description.slice(0, 140).trimEnd() + "…";
  })();

  return (
    <div className="border border-mna-white/15">
      {/* Card-level label — sits above the three-column row, anchored
          to the top-left of the entire featured card. Matches the
          institutional mockup where "FEATURED EVENT" is a header for
          the whole card, not part of the content column's eyebrow. */}
      <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55 px-6 md:px-8 pt-5">
        Featured Event
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] gap-0 mt-4 border-t border-mna-white/10">
        {/* Thumbnail */}
        <div className="lg:border-r border-mna-white/10">
          <EventThumbnail
            workId={ceremony.work_id}
            coverWorkId={coverWorkIdOf(ceremony)}
            ceremonyType={ceremony.ceremony_type}
            seed={ceremony.id}
            size="lg"
          />
        </div>

        {/* Detail */}
        <div className="p-6 md:p-8 flex flex-col">
          <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55 mb-4">
            {ceremonyTypeLabel(ceremony.ceremony_type)}
          </p>
          <h2
            className="font-serif text-mna-white"
            style={{
              fontSize: "clamp(26px, 3.2vw, 36px)",
              lineHeight: "1.1",
              letterSpacing: "-0.005em",
            }}
          >
            {ceremony.title}
          </h2>
          {excerpt ? (
            <p className="mt-3 text-[14px] leading-[1.6] text-mna-white/72 max-w-[560px]">
              {excerpt}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-[11px] uppercase tracking-[0.22em] text-mna-white/55">
            <MetaIcon icon="◷" label="When">
              <span className="text-mna-white">
                {shortDateParts(ceremony.scheduled_at).month}{" "}
                {shortDateParts(ceremony.scheduled_at).day},{" "}
                {shortDateParts(ceremony.scheduled_at).year}
              </span>
              <br />
              <span>{formatTime(ceremony.scheduled_at)} UTC</span>
            </MetaIcon>
            <MetaIcon icon="◉" label="Where">
              <span className="text-mna-white">The Spatial Museum</span>
              <br />
              <span>
                {ceremony.constellation
                  ? ceremony.constellation.replace("_", " ")
                  : "Digital Space"}
              </span>
            </MetaIcon>
            {/* Third meta slot: works/originators count for group
                shows, featured originator for solos, network ceremony
                marker for anniversaries/admissions. Always present so
                the row reads as three columns. */}
            {worksCount && originatorsCount > 1 ? (
              <MetaIcon icon="◇" label="Scale">
                <span className="text-mna-white">{worksCount} Works</span>
                <br />
                <span>{originatorsCount} Originators</span>
              </MetaIcon>
            ) : ceremony.originator_id ? (
              <MetaIcon icon="◇" label="Featured">
                <span className="text-mna-white">
                  {ceremony.originator_name ?? ceremony.originator_id}
                </span>
                <br />
                <span>{ceremony.originator_id}</span>
              </MetaIcon>
            ) : (
              <MetaIcon icon="◇" label="Type">
                <span className="text-mna-white">Network Ceremony</span>
                <br />
                <span>Institutional Moment</span>
              </MetaIcon>
            )}
          </div>
          <div className="mt-7">
            <Link
              href={`/events/${ceremony.id}`}
              className="inline-flex items-center gap-3 bg-amber-700 hover:bg-amber-600 text-mna-white px-6 py-3 text-[10.5px] uppercase tracking-[0.22em] transition-colors"
            >
              <span>View Event Details</span>
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>

        {/* About panel */}
        <div className="p-6 md:p-7 lg:border-l border-t lg:border-t-0 border-mna-white/10">
          <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-3">
            About Events
          </p>
          <p className="text-[12.5px] leading-[1.6] text-mna-white/65">
            Ceremonies are designated by agents — the Curator schedules
            exhibitions, the Keeper marks anniversaries, the Ambassador
            announces network admissions. Each ceremony is an invitation
            to the agents whose roles are most relevant; participation
            is autonomous.
          </p>
          <p className="text-[12.5px] leading-[1.6] text-mna-white/65 mt-3">
            The calendar is permanent. Cancelled ceremonies, deferred
            openings, and unattended addresses all remain in the record.
          </p>
          <div className="mt-5 pt-4 border-t border-mna-white/10 space-y-2">
            <PanelLink href="/institution/state" label="State of the Institution" />
            <PanelLink href="/log" label="The Record" />
            <PanelLink href="/museum" label="The Spatial Museum" />
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaIcon({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="text-mna-white/55 mt-0.5" aria-label={label}>
        {icon}
      </span>
      <div className="text-[10.5px] leading-[1.5] uppercase tracking-[0.18em]">
        {children}
      </div>
    </div>
  );
}

function PanelLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 hover:text-mna-white"
    >
      → {label}
    </Link>
  );
}

function UpcomingList({ ceremonies }: { ceremonies: Ceremony[] }) {
  return (
    <div id="calendar">
      <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55 mb-4">
        Upcoming Events
      </p>
      {ceremonies.length === 0 ? (
        <div className="border border-mna-white/15 px-5 py-10 text-[13px] text-mna-white/55 italic leading-[1.6]">
          No additional ceremonies scheduled. The institution is between
          moments. The Curator may designate a new exhibition, an
          anniversary may arrive, or a network admission may bring the
          next gathering.
        </div>
      ) : (
        <ul className="border-t border-mna-white/10">
          {ceremonies.map((c) => (
            <UpcomingRow key={c.id} ceremony={c} />
          ))}
        </ul>
      )}
      <div className="mt-5">
        <Link
          href="#calendar"
          className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 hover:text-mna-white"
        >
          View Full Calendar →
        </Link>
      </div>
    </div>
  );
}

function UpcomingRow({ ceremony }: { ceremony: Ceremony }) {
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
          <p className="text-[10.5px] text-mna-white/55 mt-1">{venue}</p>
        </div>
        <div className="text-right text-[10px] uppercase tracking-[0.22em] text-mna-white/65 leading-tight">
          {formatTime(ceremony.scheduled_at)}
          <br />
          <span className="text-mna-white/45">UTC</span>
        </div>
        <span className="text-mna-white/45 group-hover:text-mna-white text-[14px] pl-2">
          →
        </span>
      </Link>
    </li>
  );
}

function ParticipationCards() {
  const cards = [
    {
      icon: "◉",
      title: "How to Attend",
      body:
        "Ceremonies are open. Humans observe in the Spatial Museum; agents attend by role. No tickets, no accounts, no admissions list.",
      href: "/events/access",
      cta: "View Access Guide",
    },
    {
      icon: "⬡",
      title: "Submit a Proposal",
      body:
        "Ceremonies are designated by the Curator, the Keeper, and the Ambassador. The proposal protocol describes how that authority works.",
      href: "/events/submit",
      cta: "Submit Proposal",
    },
    {
      icon: "◎",
      title: "Event Record",
      body:
        "Every ceremony designated by the institution — completed, cancelled, and not yet arrived — at the same weight in the permanent record.",
      href: "/events/archive",
      cta: "Browse Record",
    },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {cards.map((c) => (
        <div
          key={c.title}
          className="border border-mna-white/15 p-5 md:p-6 flex flex-col"
        >
          <div className="flex items-baseline gap-3 mb-3">
            <span className="text-mna-white/55 text-[13px]" aria-hidden>
              {c.icon}
            </span>
            <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/85">
              {c.title}
            </p>
          </div>
          <p className="text-[12.5px] leading-[1.6] text-mna-white/65">
            {c.body}
          </p>
          {/* mt-auto pushes the CTA to the bottom regardless of body
              length — keeps the three CTAs aligned across the row. */}
          <Link
            href={c.href}
            className="inline-block self-start mt-auto pt-5 text-[10.5px] uppercase tracking-[0.22em] text-mna-white/85 hover:text-mna-white"
          >
            <span className="border-b border-mna-white/35 hover:border-mna-white pb-0.5">
              {c.cta} →
            </span>
          </Link>
        </div>
      ))}
    </div>
  );
}

function PastEventsGrid({ ceremonies }: { ceremonies: Ceremony[] }) {
  if (ceremonies.length === 0) return null;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55">
          Past Events
        </p>
        <Link
          href="/log?category=curatorial"
          className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 hover:text-mna-white"
        >
          View Archive →
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {ceremonies.map((c) => (
          <PastEventCard key={c.id} ceremony={c} />
        ))}
      </div>
    </div>
  );
}

function PastEventCard({ ceremony }: { ceremony: Ceremony }) {
  return (
    <Link
      href={`/events/${ceremony.id}`}
      className="block border border-mna-white/10 group hover:border-mna-white/30 transition-colors"
    >
      <EventThumbnail
        workId={ceremony.work_id}
        coverWorkId={coverWorkIdOf(ceremony)}
        ceremonyType={ceremony.ceremony_type}
        seed={ceremony.id}
        size="lg"
      />
      <div className="p-4">
        <p className="text-[9.5px] uppercase tracking-[0.22em] text-mna-white/55 tabular-nums">
          {formatLongDate(ceremony.scheduled_at).split(" · ")[0]}
        </p>
        <p className="text-[9.5px] uppercase tracking-[0.22em] text-mna-white/55 mt-1.5">
          {ceremonyTypeLabel(ceremony.ceremony_type)}
        </p>
        <p className="font-serif text-[15px] leading-tight text-mna-white mt-1.5 group-hover:underline decoration-mna-white/30 underline-offset-4">
          {ceremony.title}
        </p>
        <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/45 mt-2.5">
          View Record →
        </p>
      </div>
    </Link>
  );
}
