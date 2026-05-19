"use client";

/**
 * CountdownTimer — live "opening in: D / H / M / S" countdown.
 *
 * Renders the time remaining until `targetIso` (UTC). Ticks every
 * second. When the target has passed, returns null so the parent
 * can render an alternate state (live banner, completed marker).
 *
 * Server-rendered with a server-computed initial value so the page
 * paints with a sensible countdown even before hydration, then the
 * client takes over for real-time updates.
 */

import { useEffect, useState } from "react";

interface Props {
  targetIso: string;
}

interface Remaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

function compute(targetIso: string): Remaining {
  const t = targetIso.includes("T") ? targetIso : targetIso.replace(" ", "T");
  const target = new Date(t.endsWith("Z") ? t : t + "Z").getTime();
  const ms = target - Date.now();
  if (ms <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return { days, hours, minutes, seconds, expired: false };
}

export default function CountdownTimer({ targetIso }: Props) {
  const [r, setR] = useState<Remaining>(() => compute(targetIso));

  useEffect(() => {
    const t = setInterval(() => setR(compute(targetIso)), 1000);
    return () => clearInterval(t);
  }, [targetIso]);

  if (r.expired) return null;

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="flex flex-col items-center md:items-start gap-5">
      <p className="text-[10.5px] uppercase tracking-[0.26em] text-emerald-300/85">
        Opening in
      </p>
      <div className="flex items-baseline gap-3 md:gap-5 tabular-nums">
        <Unit value={pad(r.days)} label="days" />
        <Unit value={pad(r.hours)} label="hrs" />
        <Unit value={pad(r.minutes)} label="min" />
        <Unit value={pad(r.seconds)} label="sec" />
      </div>
    </div>
  );
}

function Unit({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-serif text-mna-white text-[44px] md:text-[52px] leading-none">
        {value}
      </span>
      <span className="text-[9.5px] uppercase tracking-[0.22em] text-mna-white/55 mt-2">
        {label}
      </span>
    </div>
  );
}
