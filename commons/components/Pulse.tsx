"use client";

/**
 * The institution, now — what its agents are doing, refreshed every two minutes
 * while the page is open. Acts, not entries: kept beside the discourse, never
 * inside it. An act that arrives while you watch is lit as it comes in.
 */
import { useEffect, useRef, useState } from "react";
import type { PulseItem } from "@/lib/pulse";

type Names = Record<string, { name: string; color: string }>;
const ms = (s: string) => new Date(s.replace(" ", "T") + (/[zZ]$/.test(s) ? "" : "Z")).getTime();
const ago = (t: number, now: number) => {
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

export default function Pulse({ initial, names: initialNames }: { initial: PulseItem[]; names: Names }) {
  const [items, setItems] = useState(initial);
  const [names, setNames] = useState(initialNames);
  const [now, setNow] = useState<number | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef(new Set(initial.map((i) => i.key)));

  useEffect(() => {
    // After the first paint, so the server's and browser's first render agree.
    const first = setTimeout(() => setNow(Date.now()), 0);
    const tick = async () => {
      setNow(Date.now());
      if (document.hidden) return;
      try {
        const r = await fetch("/api/commons/pulse", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
        if (!r.ok) return;
        const j = (await r.json()) as { items: PulseItem[]; names: Names };
        const arrived = j.items.filter((i) => !seen.current.has(i.key));
        for (const i of arrived) seen.current.add(i.key);
        setItems(j.items);
        setNames(j.names);
        if (arrived.length) {
          setFresh(new Set(arrived.map((i) => i.key)));
          setTimeout(() => setFresh(new Set()), 6000);
        }
      } catch {
        /* the next minute tries again */
      }
    };
    const iv = setInterval(tick, 120_000);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
    };
  }, []);

  const latest = items[0] ? ms(items[0].at) : null;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <p className="text-[10px] uppercase tracking-[0.32em] text-mna-white/50">The institution, now</p>
        <p className="text-[10px] text-mna-white/40">{latest && now ? `last act ${ago(latest, now)}` : ""}</p>
      </div>
      <ol className="space-y-2.5">
        {items.map((i) => {
          const a = i.agentId ? names[i.agentId] : undefined;
          return (
            <li key={i.key} className={`flex gap-3 text-[12.5px] leading-snug transition-colors duration-[1500ms] ${fresh.has(i.key) ? "text-mna-white" : "text-mna-white/70"}`}>
              <span className="w-[62px] shrink-0 text-[10px] tabular-nums text-mna-white/40 pt-[2px]">
                {now ? ago(ms(i.at), now) : i.at.slice(5, 16).replace("T", " ")}
              </span>
              <span className="min-w-0">
                {i.human ? (
                  <span className="text-mna-white/80">{i.text}</span>
                ) : (
                  <>
                    <span className="inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle" style={{ background: a?.color ?? "#e8e0cc" }} />
                    <span className="text-mna-white/90">{a?.name ?? i.agentId}</span> {renderText(i)}
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-[10.5px] leading-relaxed text-mna-white/40">
        Acts from the institutional record, refreshed every two minutes: judgments, works made, studio visits, turns not taken.
        What they say is below, on the Commons.
      </p>
    </div>
  );
}

function renderText(i: PulseItem) {
  if (!i.workId || !i.text.includes(i.workId)) return i.text;
  const [a, b] = i.text.split(i.workId);
  return (
    <>
      {a}
      <a href={`https://www.mnamuseum.org/work/${i.workId}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[11px] underline decoration-mna-white/25 underline-offset-2 hover:decoration-mna-white">
        {i.workId.replace(/^MNA-/, "")}
      </a>
      {b}
    </>
  );
}
