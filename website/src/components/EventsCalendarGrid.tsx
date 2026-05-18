"use client";

/**
 * EventsCalendarGrid — month-view calendar showing ceremony markers.
 *
 * Surfaces the full institutional calendar at a glance. Each day with
 * one or more ceremonies gets a marker; clicking a day reveals the
 * ceremonies scheduled for it in a panel beneath the grid. Month nav
 * is local (no URL state) — visitors browse without re-mounting the
 * page. Initial focus lands on the next upcoming ceremony's month so
 * the live calendar is visible on first paint.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Ceremony } from "@/lib/ceremonies";
import { ceremonyTypeLabel } from "@/lib/ceremonies";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

interface Props {
  ceremonies: Ceremony[];
}

function ceremonyDateKey(iso: string): string {
  // The DB stores "YYYY-MM-DD HH:MM:SS" or ISO. Slice the UTC date out.
  const t = iso.includes("T") ? iso : iso.replace(" ", "T");
  return t.slice(0, 10);
}

function utcDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatTime(iso: string): string {
  const t = iso.includes("T") ? iso : iso.replace(" ", "T");
  const d = new Date(t.endsWith("Z") ? t : t + "Z");
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }) + " UTC";
}

export default function EventsCalendarGrid({ ceremonies }: Props) {
  // Index ceremonies by their UTC date key so the grid lookup is O(1).
  const byDate = useMemo(() => {
    const m = new Map<string, Ceremony[]>();
    for (const c of ceremonies) {
      const key = ceremonyDateKey(c.scheduled_at);
      const list = m.get(key) ?? [];
      list.push(c);
      m.set(key, list);
    }
    return m;
  }, [ceremonies]);

  // Initial month: the next upcoming ceremony's month, or current.
  const initial = useMemo(() => {
    const now = new Date();
    const nextUpcoming = ceremonies
      .filter((c) => {
        const t = c.scheduled_at.replace(" ", "T") + "Z";
        return new Date(t).getTime() >= now.getTime();
      })
      .sort((a, b) => (a.scheduled_at < b.scheduled_at ? -1 : 1))[0];
    if (nextUpcoming) {
      const t = nextUpcoming.scheduled_at.replace(" ", "T") + "Z";
      const d = new Date(t);
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    }
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
  }, [ceremonies]);

  const [{ year, month }, setView] = useState(initial);
  const [selectedKey, setSelectedKey] = useState<string | null>(() => {
    const t = ceremonies[0]?.scheduled_at;
    if (!t) return null;
    return ceremonyDateKey(t);
  });

  const monthLabel = `${MONTHS[month].toUpperCase()} ${year}`;

  // Build the 6-week grid: leading days from previous month, the
  // current month, trailing days from next month. Each cell is { y, m,
  // d, inMonth, key, count } so the renderer doesn't have to recompute.
  const cells = useMemo(() => {
    const firstOfMonth = new Date(Date.UTC(year, month, 1));
    const startDow = firstOfMonth.getUTCDay();
    const cellsOut: Array<{
      y: number;
      m: number;
      d: number;
      inMonth: boolean;
      key: string;
      count: number;
      isToday: boolean;
    }> = [];
    const todayKey = ceremonyDateKey(new Date().toISOString());
    // Start from the Sunday of the week containing the 1st.
    const start = new Date(Date.UTC(year, month, 1 - startDow));
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth();
      const day = d.getUTCDate();
      const key = utcDate(y, m, day);
      cellsOut.push({
        y,
        m,
        d: day,
        inMonth: m === month,
        key,
        count: byDate.get(key)?.length ?? 0,
        isToday: key === todayKey,
      });
    }
    return cellsOut;
  }, [year, month, byDate]);

  const selected = selectedKey ? byDate.get(selectedKey) ?? [] : [];

  const prevMonth = () => {
    setView((s) => (s.month === 0 ? { year: s.year - 1, month: 11 } : { year: s.year, month: s.month - 1 }));
  };
  const nextMonth = () => {
    setView((s) => (s.month === 11 ? { year: s.year + 1, month: 0 } : { year: s.year, month: s.month + 1 }));
  };

  return (
    <div className="border border-mna-white/15 p-5 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55">
          Calendar View
        </p>
      </div>

      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          aria-label="Previous month"
          className="text-mna-white/55 hover:text-mna-white text-[14px] w-8 h-8 flex items-center justify-center"
        >
          ←
        </button>
        <p className="text-[11px] uppercase tracking-[0.26em] text-mna-white tabular-nums">
          {monthLabel}
        </p>
        <button
          onClick={nextMonth}
          aria-label="Next month"
          className="text-mna-white/55 hover:text-mna-white text-[14px] w-8 h-8 flex items-center justify-center"
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DOW.map((d) => (
          <div
            key={d}
            className="text-[9.5px] uppercase tracking-[0.18em] text-mna-white/40 text-center py-1.5"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const isSelected = cell.key === selectedKey;
          const hasEvents = cell.count > 0;
          const base =
            "relative aspect-square flex items-center justify-center text-[12px] tabular-nums transition-colors";
          let cls = `${base} `;
          if (!cell.inMonth) {
            cls += "text-mna-white/20 hover:text-mna-white/35";
          } else if (hasEvents) {
            cls += isSelected
              ? "text-mna-white border border-emerald-300/55 bg-emerald-300/[0.08]"
              : "text-mna-white border border-mna-white/25 hover:border-mna-white/55";
          } else if (cell.isToday) {
            cls += "text-mna-white border border-mna-white/35 rounded-full";
          } else {
            cls += "text-mna-white/55 hover:text-mna-white";
          }
          return (
            <button
              key={cell.key + (cell.inMonth ? "" : "_o")}
              onClick={() => setSelectedKey(cell.key)}
              className={cls}
            >
              <span>{cell.d}</span>
              {hasEvents ? (
                <span
                  className="absolute bottom-1 w-1 h-1 rounded-full bg-emerald-300"
                  aria-hidden
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {selected.length > 0 ? (
        <div className="mt-6 pt-5 border-t border-mna-white/10 space-y-4">
          <p className="text-[10px] uppercase tracking-[0.22em] text-mna-white/55 tabular-nums">
            {formatSelectedDateLabel(selectedKey!)}
          </p>
          {selected.map((c) => (
            <Link
              key={c.id}
              href={`/events/${c.id}`}
              className="block group"
            >
              <p className="text-[10px] uppercase tracking-[0.22em] text-mna-white/45 mb-1">
                {ceremonyTypeLabel(c.ceremony_type)}
              </p>
              <p className="font-serif italic text-[16px] leading-snug text-mna-white group-hover:underline decoration-mna-white/35 underline-offset-4">
                {c.title}
              </p>
              <p className="text-[10.5px] uppercase tracking-[0.22em] text-mna-white/55 mt-1.5">
                {formatTime(c.scheduled_at)}
              </p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-6 pt-5 border-t border-mna-white/10">
          <p className="text-[11px] leading-[1.6] text-mna-white/45 italic">
            {selectedKey
              ? "No ceremonies on this date."
              : "Select a date to see scheduled ceremonies."}
          </p>
        </div>
      )}
    </div>
  );
}

function formatSelectedDateLabel(key: string): string {
  const [y, m, d] = key.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return key;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).toUpperCase();
}
