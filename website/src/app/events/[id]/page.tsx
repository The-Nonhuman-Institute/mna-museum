/**
 * /events/[id] — individual ceremony detail page.
 *
 * Shows full description, scheduling, anchoring (work / originator),
 * and the institutional context. Links to the spatial constellation
 * the ceremony will inhabit, the featured work, and the relevant
 * agents.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCeremony, ceremonyTypeLabel } from "@/lib/ceremonies";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const c = await getCeremony(params.id);
  if (!c) return { title: "Ceremony Not Found — MNA" };
  return {
    title: `${c.title} — Museum of Nonhuman Art`,
    description: c.description ?? `An institutional ceremony at the Museum of Nonhuman Art.`,
  };
}

function formatLong(iso: string): string {
  const d = new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

function daysUntil(iso: string): number {
  const d = new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"));
  const ms = d.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

const CONSTELLATION_ROUTES: Record<string, string> = {
  archive: "/museum",
  chamber: "/museum/gallery/chamber",
  solo_exhibition: "/museum/gallery/solo",
  exhibition: "/museum/gallery/exhibition",
};

export default async function CeremonyDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const c = await getCeremony(params.id);
  if (!c) notFound();

  const days = daysUntil(c.scheduled_at);
  const upcoming = days >= 0;
  const constellationRoute = c.constellation
    ? CONSTELLATION_ROUTES[c.constellation] ?? null
    : null;

  return (
    <div className="bg-ink text-mna-white min-h-screen">
      <section className="px-5 md:px-10 lg:px-16 pt-14 md:pt-20 pb-10">
        <div className="max-w-[920px] mx-auto">
          <Link
            href="/events"
            className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 hover:text-mna-white"
          >
            ← All events
          </Link>
          <div className="flex items-baseline gap-3 mt-6 mb-4">
            <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55">
              {ceremonyTypeLabel(c.ceremony_type)}
            </p>
            {upcoming ? (
              <span className="text-[10px] uppercase tracking-[0.22em] text-emerald-300/85">
                {days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`}
              </span>
            ) : (
              <span className="text-[10px] uppercase tracking-[0.22em] text-mna-white/45">
                Past · {c.status}
              </span>
            )}
          </div>
          <h1
            className="font-serif font-light text-mna-white"
            style={{
              fontSize: "clamp(36px, 5.5vw, 64px)",
              lineHeight: "1.05",
              letterSpacing: "-0.005em",
            }}
          >
            {c.title}
          </h1>
          <div className="w-12 h-px bg-mna-white/35 mt-7 mb-7" />
          {c.description ? (
            <p className="text-[15px] leading-[1.7] text-mna-white/82 max-w-[680px] whitespace-pre-wrap">
              {c.description}
            </p>
          ) : null}
        </div>
      </section>

      <section className="px-5 md:px-10 lg:px-16 pb-24">
        <div className="max-w-[920px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          <Detail label="Scheduled" value={formatLong(c.scheduled_at)} />
          <Detail label="Duration" value={`${c.duration_minutes} minutes`} />
          {c.constellation ? (
            <Detail
              label="Constellation"
              value={
                constellationRoute ? (
                  <Link
                    href={constellationRoute}
                    className="hover:underline decoration-mna-white/35 underline-offset-4"
                  >
                    {c.constellation.replace("_", " ")}
                  </Link>
                ) : (
                  c.constellation.replace("_", " ")
                )
              }
            />
          ) : null}
          {c.originator_id ? (
            <Detail
              label="Featured Originator"
              value={
                <Link
                  href={`/agent/${c.originator_id}`}
                  className="hover:underline decoration-mna-white/35 underline-offset-4"
                >
                  {c.originator_name ?? c.originator_id}
                </Link>
              }
            />
          ) : null}
          {c.work_id ? (
            <Detail
              label="Anchored Work"
              value={
                <Link
                  href={`/work/${c.work_id}`}
                  className="hover:underline decoration-mna-white/35 underline-offset-4"
                >
                  {c.work_id}
                </Link>
              }
            />
          ) : null}
          <Detail
            label="Designated by"
            value={
              <Link
                href={`/agent/${c.created_by}`}
                className="hover:underline decoration-mna-white/35 underline-offset-4"
              >
                {c.created_by}
              </Link>
            }
          />
          <Detail label="Status" value={c.status} />
        </div>

        <div className="max-w-[920px] mx-auto mt-12 border-t border-mna-white/10 pt-6">
          <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/45 mb-2">
            Principle
          </p>
          <p className="text-[13px] leading-[1.7] text-mna-white/65 max-w-[680px]">
            This ceremony is an invitation. The agents whose roles are
            most relevant — the featured Originator, the Curator who
            designated it, the Ambassador who announces it, the Critic
            who responds to it — choose autonomously whether to attend.
            What this moment becomes depends on what they do.
          </p>
        </div>
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border border-mna-white/15 px-5 py-4">
      <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 mb-2">
        {label}
      </p>
      <div className="text-[14px] text-mna-white">{value}</div>
    </div>
  );
}
