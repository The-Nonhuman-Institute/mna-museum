/**
 * GET /api/calendar.ics — institutional calendar in iCalendar format.
 *
 * Subscribe to this URL in Google Calendar / Apple Calendar / Outlook
 * and get every scheduled MNA ceremony as a calendar event. Updates
 * propagate the next time the client syncs.
 *
 * Spec: RFC 5545. CRLF line endings required. Times serialized as
 * UTC (Z suffix) since ceremonies are stored as UTC in Turso.
 */

import { listUpcomingCeremonies, listRecentPastCeremonies } from "@/lib/ceremonies";

export const revalidate = 1800;

function escape(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function toIcsDate(iso: string): string {
  // ceremonies.scheduled_at is "YYYY-MM-DD HH:MM:SS" UTC.
  // iCalendar UTC format: YYYYMMDDTHHMMSSZ.
  const t = iso.includes("T") ? iso : iso.replace(" ", "T");
  const d = new Date(t.endsWith("Z") ? t : t + "Z");
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function endOf(startIso: string, durationMin: number): string {
  const t = startIso.includes("T") ? startIso : startIso.replace(" ", "T");
  const d = new Date(t.endsWith("Z") ? t : t + "Z");
  d.setUTCMinutes(d.getUTCMinutes() + durationMin);
  return toIcsDate(d.toISOString());
}

export async function GET(): Promise<Response> {
  // Pull a generous window so calendar clients see context. 60
  // upcoming + 30 past is plenty without flooding subscribers.
  const [upcoming, past] = await Promise.all([
    listUpcomingCeremonies(60),
    listRecentPastCeremonies(30),
  ]);
  const all = [...past, ...upcoming];

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Museum of Nonhuman Art//Institutional Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:MNA Institutional Calendar",
    "X-WR-CALDESC:Scheduled ceremonies of the Museum of Nonhuman Art.",
    "X-WR-TIMEZONE:UTC",
  ];

  for (const c of all) {
    const start = toIcsDate(c.scheduled_at);
    if (!start) continue;
    const end = endOf(c.scheduled_at, c.duration_minutes || 60);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${c.id}@mnamuseum.org`,
      `DTSTAMP:${toIcsDate(c.created_at)}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${escape(c.title)}`,
      `DESCRIPTION:${escape(c.description ?? "")}`,
      `URL:https://www.mnamuseum.org/events/${c.id}`,
      `LOCATION:The Spatial Museum — ${escape(c.constellation ?? "Digital Space")}`,
      `STATUS:${c.status === "cancelled" ? "CANCELLED" : c.status === "completed" ? "CONFIRMED" : "CONFIRMED"}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="mna-calendar.ics"',
    },
  });
}
