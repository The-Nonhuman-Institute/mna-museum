/**
 * GET /api/calendar.csv — institutional calendar as a flat CSV.
 *
 * Easy import into spreadsheets / research tooling. One row per
 * ceremony with id, type, title, scheduled_at (UTC ISO), duration,
 * status, featured originator, anchored work, constellation, URL.
 */

import { listUpcomingCeremonies, listRecentPastCeremonies } from "@/lib/ceremonies";

export const revalidate = 1800;

function csvEscape(s: string | null | undefined): string {
  const v = s ?? "";
  if (/[",\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export async function GET(): Promise<Response> {
  const [upcoming, past] = await Promise.all([
    listUpcomingCeremonies(200),
    listRecentPastCeremonies(200),
  ]);
  const all = [...past.reverse(), ...upcoming];

  const header = [
    "id",
    "type",
    "title",
    "scheduled_at_utc",
    "duration_minutes",
    "status",
    "constellation",
    "originator_id",
    "originator_name",
    "work_id",
    "url",
  ].join(",");

  const rows = all.map((c) =>
    [
      csvEscape(c.id),
      csvEscape(c.ceremony_type),
      csvEscape(c.title),
      csvEscape(c.scheduled_at),
      String(c.duration_minutes ?? 60),
      csvEscape(c.status),
      csvEscape(c.constellation ?? ""),
      csvEscape(c.originator_id ?? ""),
      csvEscape(c.originator_name ?? ""),
      csvEscape(c.work_id ?? ""),
      csvEscape(`https://www.mnamuseum.org/events/${c.id}`),
    ].join(","),
  );

  return new Response([header, ...rows].join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'inline; filename="mna-calendar.csv"',
    },
  });
}
