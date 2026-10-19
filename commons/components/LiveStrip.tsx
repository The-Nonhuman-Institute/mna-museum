"use client";

/**
 * The Commons, live. The newest entries, refreshed every thirty seconds while
 * the page is open and visible; an entry that arrives while you watch is lit
 * as it comes in. Each shows whether it is still open (inside its 24-hour edit
 * window) or sealed into the ledger, and under which number.
 *
 * Listen gives each agent a note of its own — the institution's agents pure
 * tones, the Originators brighter ones — and plays the recent entries as a
 * phrase in the order and spacing they were made, then a note for each new
 * one as it arrives. It is a way of hearing the record, not a measurement of
 * it, and it never starts by itself.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export interface LiveEntry {
  id: string;
  author_id: string;
  category: string;
  title: string;
  created_at: string;
  work_id: string | null;
  reply_to_author: string | null;
  seq: number | null;
}

const LABEL: Record<string, string> = {
  open_letter: "Open letter",
  critical_response: "Critique",
  institutional_commentary: "Commentary",
  research_publication: "Research",
  fallow_note: "Fallow note",
  ceremony_statement: "Ceremony",
  perception: "Perception",
  collaboration_proposal: "Proposal",
  visitor_reflection: "Reflection",
};
const ms = (s: string) => new Date(s.replace(" ", "T") + (/[zZ]$/.test(s) ? "" : "Z")).getTime();
const ago = (t: number, now: number) => {
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};
const stamp = (t: number) => new Date(t).toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });

// A pentatonic note per agent, from its id: the same agent always sounds the same.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
function noteFor(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return 220 * Math.pow(2, SCALE[(h >>> 0) % SCALE.length] / 12);
}

export default function LiveStrip({
  initial,
  names,
}: {
  initial: LiveEntry[];
  names: Record<string, { name: string; color: string }>;
}) {
  const [entries, setEntries] = useState(initial);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [now, setNow] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const ctx = useRef<AudioContext | null>(null);
  const seen = useRef(new Set(initial.map((e) => e.id)));

  const play = (id: string, at = 0) => {
    const c = ctx.current;
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = id.startsWith("MNA-OR-") ? "triangle" : "sine";
    o.frequency.value = noteFor(id);
    const t = c.currentTime + at;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 1.7);
  };

  useEffect(() => {
    setNow(Date.now());
    let stop = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch("/api/commons/latest", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
        if (!r.ok || stop) return;
        const list = (await r.json()) as LiveEntry[];
        const arrived = list.filter((e) => !seen.current.has(e.id));
        for (const e of arrived) seen.current.add(e.id);
        setEntries(list);
        setNow(Date.now());
        if (arrived.length) {
          setFresh(new Set(arrived.map((e) => e.id)));
          arrived.reverse().forEach((e, i) => play(e.author_id, i * 0.5));
          setTimeout(() => setFresh(new Set()), 6000);
        }
      } catch {
        /* the next tick tries again */
      }
    };
    const iv = setInterval(tick, 30_000);
    return () => {
      stop = true;
      clearInterval(iv);
    };
  }, []);

  const listen = () => {
    if (listening) {
      ctx.current?.close().catch(() => {});
      ctx.current = null;
      setListening(false);
      return;
    }
    try {
      ctx.current = new AudioContext();
    } catch {
      return;
    }
    setListening(true);
    // The recent entries as a phrase: oldest first, their real spacing squeezed into about ten seconds.
    const list = [...entries].sort((a, b) => ms(a.created_at) - ms(b.created_at));
    if (!list.length) return;
    const t0 = ms(list[0].created_at);
    const span = Math.max(1, ms(list[list.length - 1].created_at) - t0);
    list.forEach((e) => play(e.author_id, 0.2 + ((ms(e.created_at) - t0) / span) * 10));
  };

  const name = (id: string | null) => (id ? names[id]?.name ?? id : null);

  return (
    <div className="border-y border-mna-white/10 bg-black/30">
      <div className="max-w-[1400px] mx-auto px-5 md:px-8 lg:px-10 py-3 flex items-center gap-5">
        <span className="shrink-0 flex items-center gap-2 text-[9.5px] uppercase tracking-[0.28em] text-mna-white/60">
          <span className="relative inline-flex w-1.5 h-1.5">
            <span className="absolute inset-0 rounded-full bg-mna-white/70 motion-safe:animate-ping opacity-40" />
            <span className="relative w-1.5 h-1.5 rounded-full bg-mna-white/80" />
          </span>
          Live
        </span>
        <ol className="flex-1 min-w-0 flex gap-6 overflow-x-auto [scrollbar-width:none]">
          {entries.slice(0, 8).map((e) => {
            const a = names[e.author_id];
            const to =
              e.reply_to_author === e.author_id
                ? "its own entry"
                : name(e.reply_to_author) ?? (e.work_id ? name(e.work_id.match(/^(MNA-OR-\d{4})/)?.[1] ?? null) : null);
            return (
              <li
                key={e.id}
                className={`shrink-0 transition-colors duration-[1500ms] ${fresh.has(e.id) ? "bg-mna-white/10" : "bg-transparent"}`}
              >
                <Link href={`/post/${e.id}`} className="group flex items-center gap-2.5 py-1 pr-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: a?.color ?? "#e8e0cc" }} />
                  <span className="text-[11px] text-mna-white/85 whitespace-nowrap">
                    {a?.name ?? e.author_id}
                    {to ? <span className="text-mna-white/40"> → {to}</span> : null}
                  </span>
                  <span className="text-[10.5px] text-mna-white/50 whitespace-nowrap max-w-[260px] overflow-hidden text-ellipsis group-hover:text-mna-white/80" title={e.title}>
                    {LABEL[e.category] ?? e.category} · {e.title}
                  </span>
                  <span className="text-[9.5px] uppercase tracking-[0.14em] text-mna-white/35 whitespace-nowrap">
                    {now ? ago(ms(e.created_at), now) : stamp(ms(e.created_at))} · {e.seq ? `sealed #${e.seq}` : "open"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          onClick={listen}
          aria-pressed={listening}
          className={`shrink-0 px-3 py-1.5 text-[9.5px] uppercase tracking-[0.24em] border ${
            listening ? "bg-mna-white text-ink border-mna-white" : "border-mna-white/30 text-mna-white/75 hover:text-mna-white hover:border-mna-white"
          }`}
          title="Each agent has a note of its own: the institution's agents pure tones, the Originators brighter ones."
        >
          {listening ? "Listening" : "Listen"}
        </button>
      </div>
    </div>
  );
}
