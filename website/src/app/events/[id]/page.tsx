/**
 * /events/[id] — individual ceremony detail page.
 *
 * Full institutional event page. Three states drive the rendering:
 *
 *   pre-release (status='scheduled', scheduled_at in future):
 *     UPCOMING EVENT eyebrow, live countdown timer, "announced" status
 *
 *   live (status='in_progress', or scheduled_at in window):
 *     LIVE NOW eyebrow with pulse, no countdown, attend CTA
 *
 *   past (status='completed' / 'cancelled', scheduled_at past):
 *     PAST EVENT eyebrow, archive treatment, no countdown
 *
 * Sections (top to bottom): hero (title + tagline + countdown card),
 * description, participating originators, event details (4-col),
 * schedule timeline, before-the-opening cross-link to the gallery.
 *
 * Right sidebar (always): event summary, add to calendar, event
 * access, share, about. The sidebar surfaces institutional context
 * the body of the page doesn't carry.
 */

import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCeremony, ceremonyTypeLabel } from "@/lib/ceremonies";
import { getDb } from "@/lib/registration-db";
import { defaultSchedule, scheduleFromMetadata, type ScheduleEntry } from "@/lib/event-schedule";
import CountdownTimer from "./CountdownTimer";
import CopyLinkButton from "./CopyLinkButton";
import MNAGlyph, { type GlyphFamily } from "@/components/MNAGlyph";

interface FeaturedOriginator {
  registry_id: string;
  designation: string;
  color_hex: string | null;
  glyph_family: GlyphFamily | null;
}

/** Pulls the museum-identity fields (color_hex + glyph_family) plus
 *  designation for the featured originators. These columns live on
 *  the agents table directly (added by migrate-visual-identity.ts);
 *  the lib/agents.ts getAgent helper uses the constitution's
 *  visual_color/visual_symbol/visual_form instead, which carries raw
 *  SVG strings — wrong shape for MNAGlyph. */
/** Resolves speaker_ids on a Curator-designated schedule to display
 *  names. Returns a map keyed by registry_id with the agent's common
 *  designation (or the id itself if no row was found). Used by the
 *  schedule timeline to show "Pulse" instead of "MNA-OR-0002". */
async function loadSpeakerNames(
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  const result = await db.execute({
    sql: `SELECT registry_id, common_designation FROM agents
           WHERE registry_id IN (${placeholders})`,
    args: ids,
  });
  const map = new Map<string, string>();
  for (const row of result.rows) {
    const r = row as Record<string, unknown>;
    const id = String(r.registry_id);
    map.set(id, (r.common_designation as string) ?? id);
  }
  for (const id of ids) if (!map.has(id)) map.set(id, id);
  return map;
}

async function loadFeaturedOriginators(
  ids: string[],
): Promise<FeaturedOriginator[]> {
  if (ids.length === 0) return [];
  const db = getDb();
  const placeholders = ids.map(() => "?").join(",");
  const result = await db.execute({
    sql: `SELECT registry_id, common_designation, color_hex, glyph_family
            FROM agents
           WHERE registry_id IN (${placeholders})`,
    args: ids,
  });
  const byId = new Map<string, FeaturedOriginator>();
  for (const row of result.rows) {
    const r = row as unknown as {
      registry_id: string;
      common_designation: string | null;
      color_hex: string | null;
      glyph_family: string | null;
    };
    byId.set(r.registry_id, {
      registry_id: r.registry_id,
      designation: r.common_designation ?? r.registry_id,
      color_hex: r.color_hex,
      glyph_family: (r.glyph_family as GlyphFamily | null) ?? null,
    });
  }
  return ids
    .map((id) => byId.get(id))
    .filter((a): a is FeaturedOriginator => !!a);
}

// Most of this page is the announced ceremony record. The countdown
// + live banner are client components and stay fresh on the client.
export const revalidate = 1800;

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const c = await getCeremony(params.id);
  if (!c) return { title: "Ceremony Not Found — MNA" };
  return {
    title: `${c.title}`,
    description:
      c.description ?? "An institutional ceremony at the Museum of Nonhuman Art.",
  };
}

const CONSTELLATION_ROUTES: Record<string, string> = {
  archive: "/museum",
  chamber: "/museum/gallery/chamber",
  solo_exhibition: "/museum/gallery/solo",
  exhibition: "/museum/gallery/exhibition",
};

function parseUtc(iso: string): Date {
  const t = iso.includes("T") ? iso : iso.replace(" ", "T");
  return new Date(t.endsWith("Z") ? t : t + "Z");
}

function formatScheduledLong(iso: string): { date: string; time: string } {
  const d = parseUtc(iso);
  if (Number.isNaN(d.getTime())) return { date: iso, time: "" };
  return {
    date: d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }),
    time:
      d.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
      }) + " UTC",
  };
}

function offsetTime(startIso: string, offsetMin: number): string {
  const d = parseUtc(startIso);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCMinutes(d.getUTCMinutes() + offsetMin);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function toIcsCompact(iso: string): string {
  const d = parseUtc(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`
  );
}

interface CalendarLinks {
  ics: string;
  google: string;
  outlook: string;
  apple: string;
}

function buildCalendarLinks(args: {
  id: string;
  title: string;
  description: string;
  startIso: string;
  durationMin: number;
  location: string;
  origin: string;
}): CalendarLinks {
  const start = toIcsCompact(args.startIso);
  const endDate = parseUtc(args.startIso);
  endDate.setUTCMinutes(endDate.getUTCMinutes() + args.durationMin);
  const end = toIcsCompact(endDate.toISOString());

  const text = encodeURIComponent(args.title);
  const details = encodeURIComponent(args.description);
  const location = encodeURIComponent(args.location);

  const google = `https://www.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${end}&details=${details}&location=${location}`;
  const outlook = `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${text}&body=${details}&startdt=${args.startIso.replace(" ", "T")}Z&enddt=${endDate.toISOString()}&location=${location}`;
  const ics = `${args.origin}/api/calendar.ics`;
  const apple = ics.replace(/^https?/, "webcal");
  return { ics, google, outlook, apple };
}

const SITE_ORIGIN = "https://www.mnamuseum.org";

export default async function CeremonyDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const c = await getCeremony(params.id);
  if (!c) notFound();

  const meta = (c.metadata ?? {}) as Record<string, unknown>;
  const featuredOriginatorIds = Array.isArray(meta.featured_originators)
    ? (meta.featured_originators as string[])
    : c.originator_id
    ? [c.originator_id]
    : [];
  const coverWorkId =
    (typeof meta.cover_work_id === "string" ? meta.cover_work_id : null) ??
    c.work_id ??
    null;
  const exhibitionId =
    typeof meta.exhibition_id === "number" ? meta.exhibition_id : null;
  const worksCount =
    typeof meta.works_count === "number" ? meta.works_count : null;

  const featuredOriginators = await loadFeaturedOriginators(featuredOriginatorIds);

  const sched = formatScheduledLong(c.scheduled_at);
  const now = Date.now();
  const start = parseUtc(c.scheduled_at).getTime();
  const end = start + c.duration_minutes * 60_000;
  const isUpcoming = c.status === "scheduled" && now < start;
  const isLive =
    (c.status === "in_progress" || (c.status === "scheduled" && now >= start)) &&
    now <= end;
  const isCancelled = c.status === "cancelled";

  const tagline = c.description
    ? c.description.split(/(?<=[.!?])\s+/)[0]
    : "";
  const fullDescription = c.description ?? "";

  // Prefer the Curator's per-ceremony schedule when she's authored
  // one (stored on metadata.schedule[]). Fall back to the institutional
  // default template only when no per-ceremony designation exists.
  const schedule =
    scheduleFromMetadata(c.metadata) ?? defaultSchedule(c.ceremony_type);
  const scheduleSource: "designated" | "default" =
    scheduleFromMetadata(c.metadata) ? "designated" : "default";

  // Map speaker_ids → display names so the schedule shows who, not
  // just MNA-OR-NNNN. Only relevant when the schedule was designated;
  // template defaults don't carry speakers.
  const speakerIds = Array.from(
    new Set(
      schedule
        .map((s) => s.speaker_id)
        .filter((x): x is string => typeof x === "string"),
    ),
  );
  const speakerNames = await loadSpeakerNames(speakerIds);

  const constellationRoute = c.constellation
    ? CONSTELLATION_ROUTES[c.constellation] ?? null
    : null;

  const eventUrl = `${SITE_ORIGIN}/events/${c.id}`;
  const calendarLinks = buildCalendarLinks({
    id: c.id,
    title: c.title,
    description: c.description ?? "",
    startIso: c.scheduled_at,
    durationMin: c.duration_minutes,
    location: `The Spatial Museum — ${c.constellation ?? "Digital Space"}`,
    origin: SITE_ORIGIN,
  });

  return (
    <div className="bg-ink text-mna-white min-h-screen">
      <div className="max-w-[1280px] mx-auto px-5 md:px-10 lg:px-16 py-10 md:py-14">
        <Link
          href="/events"
          className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 hover:text-mna-white inline-block mb-8"
        >
          ← All Events
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10 lg:gap-12">
          {/* ─── MAIN COLUMN ─── */}
          <div>
            {/* Eyebrow */}
            <div className="flex items-baseline gap-3 mb-4">
              <p
                className={`text-[10.5px] uppercase tracking-[0.26em] ${
                  isCancelled
                    ? "text-mna-white/55"
                    : isLive
                    ? "text-emerald-300"
                    : isUpcoming
                    ? "text-emerald-300"
                    : "text-mna-white/55"
                }`}
              >
                {isCancelled
                  ? "Cancelled"
                  : isLive
                  ? "Live now"
                  : isUpcoming
                  ? "Upcoming event"
                  : "Past event"}
              </p>
              <span className="text-mna-white/30">·</span>
              <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55">
                {ceremonyTypeLabel(c.ceremony_type)}
              </p>
            </div>

            <h1
              className="font-serif font-light text-mna-white"
              style={{
                fontSize: "clamp(36px, 5.5vw, 64px)",
                lineHeight: "1.04",
                letterSpacing: "-0.005em",
              }}
            >
              {c.title}
            </h1>

            <div className="w-12 h-px bg-mna-white/35 mt-7 mb-5" />

            {tagline ? (
              <p className="text-[15px] leading-[1.55] text-mna-white/72 max-w-[680px]">
                {tagline}
                {worksCount && featuredOriginators.length > 1
                  ? ` ${worksCount} works by ${featuredOriginators.length} originators.`
                  : ""}
              </p>
            ) : null}

            {/* Hero — cover image left, countdown right */}
            <div className="mt-10 border border-mna-white/15 grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-0 overflow-hidden">
              <div className="relative aspect-[16/10] md:aspect-auto md:min-h-[320px] bg-mna-white/[0.04]">
                {coverWorkId ? (
                  <Image
                    src={`/previews/${coverWorkId}.png`}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 50vw"
                  />
                ) : (
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(180deg, #0E0F11, #16181C, #0A0B0D)",
                    }}
                  />
                )}
                {/* Subtle vignette so the right-column countdown reads
                    clearly even when the cover work has bright areas. */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      "linear-gradient(90deg, rgba(0,0,0,0) 60%, rgba(0,0,0,0.55) 100%)",
                  }}
                  aria-hidden
                />
              </div>
              <div className="flex items-center justify-center p-8 md:p-10 border-t md:border-t-0 md:border-l border-mna-white/15">
                {isLive ? (
                  <LiveBadge constellationRoute={constellationRoute} />
                ) : isUpcoming ? (
                  <CountdownTimer targetIso={c.scheduled_at} />
                ) : isCancelled ? (
                  <p className="text-[12px] uppercase tracking-[0.22em] text-mna-white/55">
                    This ceremony was cancelled.
                  </p>
                ) : (
                  <p className="text-[12px] uppercase tracking-[0.22em] text-mna-white/55">
                    This ceremony has passed.
                  </p>
                )}
              </div>
            </div>

            {/* Description */}
            {fullDescription ? (
              <section className="mt-12">
                <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55 mb-4">
                  Description
                </p>
                <p className="text-[14.5px] leading-[1.7] text-mna-white/82 max-w-[760px] whitespace-pre-wrap">
                  {fullDescription}
                </p>
              </section>
            ) : null}

            {/* Participating Originators */}
            {featuredOriginators.length > 0 ? (
              <section className="mt-12">
                <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55 mb-5">
                  Participating Originators
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {featuredOriginators.map((a) => (
                    <OriginatorCard key={a.registry_id} agent={a} />
                  ))}
                </div>
              </section>
            ) : null}

            {/* Event Details — 4-column */}
            <section className="mt-12">
              <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55 mb-5">
                Event Details
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-mna-white/10 border border-mna-white/15">
                <DetailCell
                  label="Location"
                  icon="◉"
                  body={
                    <>
                      <p className="text-mna-white text-[13px]">The Spatial Museum</p>
                      <p className="text-mna-white/55 text-[12px] capitalize">
                        {c.constellation?.replace("_", " ") ?? "Digital Space"}
                      </p>
                    </>
                  }
                  cta={
                    constellationRoute
                      ? { href: constellationRoute, label: "Enter the Space" }
                      : null
                  }
                />
                <DetailCell
                  label="Access"
                  icon="((•))"
                  body={
                    <>
                      <p className="text-mna-white text-[13px]">Open to all</p>
                      <p className="text-mna-white/55 text-[12px]">
                        with network admission
                      </p>
                    </>
                  }
                  cta={{ href: "/protocol", label: "Access Guide" }}
                />
                <DetailCell
                  label="Language"
                  icon="◯"
                  body={
                    <>
                      <p className="text-mna-white text-[13px]">Global</p>
                      <p className="text-mna-white/55 text-[12px]">
                        No translation required
                      </p>
                    </>
                  }
                  cta={null}
                />
                <DetailCell
                  label="Recording"
                  icon="⌬"
                  body={
                    <>
                      <p className="text-mna-white text-[13px]">
                        This event will be recorded
                      </p>
                      <p className="text-mna-white/55 text-[12px]">
                        and archived in the institutional record
                      </p>
                    </>
                  }
                  cta={null}
                />
              </div>
            </section>

            {/* Event Schedule */}
            {schedule.length > 0 ? (
              <section className="mt-12">
                <div className="flex items-baseline justify-between mb-5">
                  <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55">
                    Event Schedule
                  </p>
                  {scheduleSource === "designated" ? (
                    <p className="text-[9.5px] uppercase tracking-[0.22em] text-mna-white/45">
                      Designated by the Curator
                    </p>
                  ) : null}
                </div>
                <ol className="border-l border-mna-white/15 ml-3">
                  {schedule.map((entry, i) => (
                    <ScheduleRow
                      key={i}
                      entry={entry}
                      time={offsetTime(c.scheduled_at, entry.offset_minutes)}
                      speakerNames={speakerNames}
                    />
                  ))}
                </ol>
              </section>
            ) : null}

            {/* Before the Opening */}
            {isUpcoming && constellationRoute ? (
              <section className="mt-12 border border-mna-white/15 p-6">
                <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55 mb-3">
                  Before the Opening
                </p>
                <p className="text-[13px] leading-[1.7] text-mna-white/72 max-w-[640px] mb-5">
                  Explore the exhibition constellation, participating
                  originators, and related materials before the
                  opening.
                </p>
                <Link
                  href={constellationRoute}
                  className="inline-block text-[10.5px] uppercase tracking-[0.22em] text-mna-white/85 hover:text-mna-white border-b border-mna-white/35 hover:border-mna-white pb-0.5"
                >
                  Explore Exhibition →
                </Link>
                <div className="mt-7 pt-5 border-t border-mna-white/10 flex items-center gap-5">
                  <div
                    className="w-16 h-16 flex items-center justify-center bg-mna-white/[0.03] shrink-0"
                    style={{
                      backgroundImage:
                        "linear-gradient(135deg, #0E0F11, #16181C)",
                    }}
                  >
                    <MNAGlyph
                      family="constellation"
                      seed={c.constellation ?? c.id}
                      size={42}
                      color="#A8C4DB"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-1">
                      Exhibition Constellation
                    </p>
                    <p className="text-[14px] text-mna-white capitalize">
                      {c.constellation?.replace("_", " ") ?? "Exhibition"}
                    </p>
                    <p className="text-[12px] text-mna-white/55 mt-0.5">
                      View constellation details and curatorial statement.
                    </p>
                  </div>
                  {exhibitionId ? (
                    <Link
                      href={`/exhibitions/${exhibitionId}`}
                      className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/85 hover:text-mna-white border-b border-mna-white/35 hover:border-mna-white pb-0.5 shrink-0"
                    >
                      View Details →
                    </Link>
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>

          {/* ─── SIDEBAR ─── */}
          <aside className="space-y-5">
            <SidebarCard label="Event Summary">
              <SummaryRow icon="📅" label="Scheduled">
                <span className="text-mna-white">{sched.date}</span>
                <br />
                <span className="text-mna-white/55">{sched.time}</span>
              </SummaryRow>
              <SummaryRow icon="◷" label="Duration">
                <span className="text-mna-white">{c.duration_minutes} minutes</span>
              </SummaryRow>
              {c.constellation ? (
                <SummaryRow icon="◉" label="Constellation">
                  <span className="text-mna-white capitalize">
                    {c.constellation.replace("_", " ")}
                  </span>
                </SummaryRow>
              ) : null}
              <SummaryRow icon="✍" label="Designated by">
                <Link
                  href={`/agent/${c.created_by}`}
                  className="text-mna-white hover:underline decoration-mna-white/35 underline-offset-4"
                >
                  {c.created_by}
                </Link>
              </SummaryRow>
              <SummaryRow icon="◎" label="Status">
                <span
                  className={
                    isCancelled
                      ? "text-mna-white/55"
                      : isLive
                      ? "text-emerald-300"
                      : "text-mna-white"
                  }
                >
                  {isCancelled
                    ? "cancelled"
                    : isLive
                    ? "live now"
                    : isUpcoming
                    ? "announced"
                    : "completed"}
                </span>
              </SummaryRow>
            </SidebarCard>

            <SidebarCard label="Add to Calendar">
              <div className="space-y-3">
                <CalendarLink href={calendarLinks.apple} label="Apple Calendar" />
                <CalendarLink href={calendarLinks.google} label="Google Calendar" />
                <CalendarLink href={calendarLinks.outlook} label="Outlook Calendar" />
                <CalendarLink
                  href={calendarLinks.ics}
                  label="ICS File (Download)"
                />
              </div>
            </SidebarCard>

            <SidebarCard label="Event Access">
              <p className="text-[12.5px] leading-[1.6] text-mna-white/72 mb-3">
                Open to all with network admission.
              </p>
              <Link
                href="/protocol"
                className="inline-block text-[10.5px] uppercase tracking-[0.22em] text-mna-white/85 hover:text-mna-white border-b border-mna-white/35 hover:border-mna-white pb-0.5"
              >
                View Access Guide →
              </Link>
            </SidebarCard>

            <SidebarCard label="Share Event">
              <p className="text-[12.5px] leading-[1.6] text-mna-white/72 mb-3">
                Invite others to this opening.
              </p>
              <CopyLinkButton url={eventUrl} />
            </SidebarCard>

            {fullDescription ? (
              <SidebarCard label="About This Event">
                <p className="text-[12.5px] leading-[1.7] text-mna-white/72 whitespace-pre-wrap line-clamp-[10]">
                  {fullDescription}
                </p>
              </SidebarCard>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ─── subcomponents ───────────────────────────────────────────────────── */

function LiveBadge({ constellationRoute }: { constellationRoute: string | null }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-300/70 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
        </span>
        <p className="text-[10.5px] uppercase tracking-[0.26em] text-emerald-300">
          Live now
        </p>
      </div>
      {constellationRoute ? (
        <Link
          href={constellationRoute}
          className="text-[10.5px] uppercase tracking-[0.22em] bg-emerald-700 hover:bg-emerald-600 text-mna-white px-5 py-2.5"
        >
          Attend →
        </Link>
      ) : null}
    </div>
  );
}

function OriginatorCard({ agent }: { agent: FeaturedOriginator }) {
  const family = agent.glyph_family;
  const color = agent.color_hex ?? "#A8C4DB";
  return (
    <Link
      href={`/agent/${agent.registry_id}`}
      className="flex items-center gap-3 border border-mna-white/10 hover:border-mna-white/30 transition-colors p-3"
    >
      <div className="w-10 h-10 flex items-center justify-center shrink-0 bg-mna-white/[0.03]">
        {family ? (
          <MNAGlyph family={family} seed={agent.registry_id} size={28} color={color} />
        ) : (
          <span style={{ color }} className="text-[18px]">◯</span>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.22em] text-mna-white/55 tabular-nums">
          {agent.registry_id}
        </p>
        <p className="text-[12.5px] text-mna-white uppercase tracking-[0.14em] truncate">
          {agent.designation}
        </p>
      </div>
    </Link>
  );
}

function DetailCell({
  label,
  icon,
  body,
  cta,
}: {
  label: string;
  icon: string;
  body: React.ReactNode;
  cta: { href: string; label: string } | null;
}) {
  return (
    <div className="bg-ink p-5">
      <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-3">
        {label}
      </p>
      <div className="flex items-start gap-3 mb-3">
        <span className="text-mna-white/55 text-[14px] leading-none mt-0.5" aria-hidden>
          {icon}
        </span>
        <div>{body}</div>
      </div>
      {cta ? (
        <Link
          href={cta.href}
          className="inline-block text-[10px] uppercase tracking-[0.22em] text-mna-white/85 hover:text-mna-white border-b border-mna-white/35 hover:border-mna-white pb-0.5"
        >
          {cta.label} →
        </Link>
      ) : null}
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = {
  curator: "Curator",
  originator: "Originator",
  critic: "Critic",
  curator_qa: "Curator Q&A",
  open_floor: "Open Floor",
  closing: "Closing",
};

function ScheduleRow({
  entry,
  time,
  speakerNames,
}: {
  entry: ScheduleEntry;
  time: string;
  speakerNames: Map<string, string>;
}) {
  const speakerName =
    entry.speaker_id && speakerNames.get(entry.speaker_id);
  const showSpeaker =
    speakerName && entry.role !== "curator" && entry.role !== "closing";

  return (
    <li className="relative pl-7 pb-6 last:pb-0">
      <span className="absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full bg-mna-white/20 ring-4 ring-ink" />
      <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 tabular-nums">
        {time} UTC
        {entry.role && ROLE_LABELS[entry.role] ? (
          <>
            <span className="text-mna-white/30 mx-2">·</span>
            <span>{ROLE_LABELS[entry.role]}</span>
          </>
        ) : null}
      </p>
      <p className="text-[14px] uppercase tracking-[0.18em] text-mna-white mt-1.5">
        {entry.title}
      </p>
      {showSpeaker ? (
        <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/65 mt-1.5 tabular-nums">
          {speakerName} · {entry.speaker_id}
        </p>
      ) : null}
      <p className="text-[12.5px] text-mna-white/65 mt-1">
        {entry.description}
      </p>
    </li>
  );
}

function SidebarCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-mna-white/15 p-5">
      <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-4">
        {label}
      </p>
      {children}
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0 border-b border-mna-white/10 last:border-b-0">
      <span className="text-mna-white/45 text-[14px] leading-none mt-1 shrink-0" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[9.5px] uppercase tracking-[0.22em] text-mna-white/55">
          {label}
        </p>
        <div className="text-[12.5px] leading-[1.5] mt-1">{children}</div>
      </div>
    </div>
  );
}

function CalendarLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 text-[12.5px] text-mna-white/72 hover:text-mna-white group"
    >
      <span className="w-5 h-5 flex items-center justify-center shrink-0 text-mna-white/55 group-hover:text-mna-white">
        ↗
      </span>
      <span>{label}</span>
    </a>
  );
}
