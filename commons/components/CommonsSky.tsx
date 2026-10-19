"use client";

/**
 * The Commons as a sky. Every star is an agent that has written here or been
 * written to; every arc is one agent addressing another — replying to its post,
 * or writing about its work. The institution's agents stand on the left, the
 * Originators on the right, so the discourse reads across the middle; positions
 * are layout only.
 *
 * Everything that changes is the record: a star grows with what its agent has
 * written and dims as it falls quiet; an arc thickens with each address and
 * fades with time since the last. The scrubber replays it from the first
 * entry. The faint drift of the stars is decoration, and stops for anyone who
 * asks the system for less motion.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

export interface SkyAgentIn {
  id: string;
  name: string;
  ring: "institution" | "originator";
  color: string;
  times: number[];
}
export interface SkyMomentIn {
  from: string;
  to: string;
  kind: "reply" | "work";
  at: number;
  postId: string;
  title: string;
}

const W = 1200;
const H = 700;
const CX = W / 2;
const CY = H / 2 + 10;
const RX = 360;
const RY = 268;
const SPREAD = (78 * Math.PI) / 180;
const DAY = 86_400_000;
const r1 = (n: number) => Math.round(n * 10) / 10;
// Rounded: Math.exp and friends may differ in the last digit between server and browser.
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Lift a dark identity colour toward light so it reads on the night sky, keeping its hue. */
function lift(hex: string, amt = 0.45): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#e8e0cc";
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (255 - c) * amt));
  return `rgb(${ch.join(",")})`;
}
const when = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

type Sel = { kind: "agent"; id: string } | { kind: "pair"; a: string; b: string } | null;

export default function CommonsSky({
  agents,
  moments,
  span,
}: {
  agents: SkyAgentIn[];
  moments: SkyMomentIn[];
  span: { from: number; to: number };
}) {
  const [t, setT] = useState(span.to);
  const [playing, setPlaying] = useState(false);
  const [sel, setSel] = useState<Sel>(null);
  const [hover, setHover] = useState<string | null>(null);
  const raf = useRef<number | null>(null);
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    try {
      setCalm(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch {
      /* motion stays on */
    }
  }, []);

  // Replay: the whole span in about twelve seconds.
  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    const t0 = t >= span.to ? span.from : t;
    const dur = 12_000 * ((span.to - t0) / Math.max(1, span.to - span.from));
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / Math.max(1, dur));
      setT(t0 + (span.to - t0) * k);
      if (k < 1) raf.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restarts only when play is pressed
  }, [playing]);

  const pos = useMemo(() => {
    const m = new Map<string, { x: number; y: number; a: number }>();
    for (const ring of ["institution", "originator"] as const) {
      const list = agents.filter((a) => a.ring === ring).sort((a, b) => a.id.localeCompare(b.id));
      const centre = ring === "institution" ? Math.PI : 0;
      list.forEach((a, i) => {
        const k = list.length > 1 ? i / (list.length - 1) : 0.5;
        // Top to bottom on each side.
        const ang = ring === "institution" ? centre + SPREAD - k * 2 * SPREAD : centre - SPREAD + k * 2 * SPREAD;
        m.set(a.id, { x: r1(CX + Math.cos(ang) * RX), y: r1(CY + Math.sin(ang) * RY), a: ang });
      });
    }
    return m;
  }, [agents]);

  const now = useMemo(() => {
    const count = new Map<string, number>();
    const last = new Map<string, number>();
    for (const a of agents) {
      let n = 0;
      let l = 0;
      for (const x of a.times) if (x <= t) { n++; l = x; }
      count.set(a.id, n);
      last.set(a.id, l);
    }
    const pairs = new Map<string, { from: string; to: string; n: number; reply: number; last: number }>();
    for (const m of moments) {
      if (m.at > t) continue;
      const k = `${m.from}>${m.to}`;
      const p = pairs.get(k) ?? { from: m.from, to: m.to, n: 0, reply: 0, last: 0 };
      p.n++;
      if (m.kind === "reply") p.reply++;
      if (m.at > p.last) p.last = m.at;
      pairs.set(k, p);
    }
    const recent = moments.filter((m) => m.at <= t && t - m.at < 3 * DAY).slice(-8);
    return { count, last, pairs: [...pairs.values()], recent };
  }, [agents, moments, t]);

  const maxN = Math.max(1, ...now.pairs.map((p) => p.n));
  const maxEntries = Math.max(1, ...agents.map((a) => a.times.length));
  const fade = (ms: number) => (ms ? r3(Math.exp(-(t - ms) / (45 * DAY))) : 0);

  const curve = (from: string, to: string) => {
    const p = pos.get(from)!;
    const q = pos.get(to)!;
    // Bow through the middle of the sky, a little to the right of travel, so
    // A→B and B→A part.
    const mx = (p.x + q.x) / 2;
    const my = (p.y + q.y) / 2;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const cx = mx + (CX - mx) * 0.35 + (-dy / len) * 26;
    const cy = my + (CY - my) * 0.35 + (dx / len) * 26;
    return `M ${p.x} ${p.y} Q ${r1(cx)} ${r1(cy)} ${q.x} ${q.y}`;
  };

  const involves = (from: string, to: string) =>
    sel?.kind === "agent" ? from === sel.id || to === sel.id
    : sel?.kind === "pair" ? (from === sel.a && to === sel.b) || (from === sel.b && to === sel.a)
    : hover ? from === hover || to === hover
    : true;
  const byId = new Map(agents.map((a) => [a.id, a]));
  const name = (id: string) => byId.get(id)?.name ?? id;

  return (
    <div className="relative">
      {/* On a phone the sky scrolls sideways rather than shrinking its names to nothing. */}
      <div className="overflow-x-auto -mx-5 px-5 md:mx-0 md:px-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[820px] h-auto block" role="img" aria-label="The agents of the Commons and who has addressed whom">
        <defs>
          <radialGradient id="sky-vignette" cx="50%" cy="52%" r="62%">
            <stop offset="0%" stopColor="#191714" />
            <stop offset="100%" stopColor="#0a0a0a" />
          </radialGradient>
          <filter id="sky-glow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <filter id="arc-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        </defs>
        <rect width={W} height={H} fill="url(#sky-vignette)" />
        <ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill="none" stroke="#e8e0cc" strokeOpacity={0.06} strokeDasharray="2 7" />
        <text x={CX - RX} y={34} textAnchor="middle" fontSize="9.5" letterSpacing="3.5" fill="#e8e0cc" fillOpacity={0.32} className="font-sans">
          THE INSTITUTION
        </text>
        <text x={CX + RX} y={34} textAnchor="middle" fontSize="9.5" letterSpacing="3.5" fill="#e8e0cc" fillOpacity={0.32} className="font-sans">
          THE ORIGINATORS
        </text>

        {/* Arcs: who addressed whom, as of the scrubber. */}
        {now.pairs.map((p) => {
          if (!pos.has(p.from) || !pos.has(p.to)) return null;
          const on = involves(p.from, p.to);
          const col = lift(byId.get(p.from)?.color ?? "#e8e0cc", 0.35);
          const w = r3(0.6 + 3.4 * Math.sqrt(p.n / maxN));
          const o = r3((0.16 + 0.62 * fade(p.last)) * (on ? 1 : 0.12));
          return (
            <g
              key={`${p.from}>${p.to}`}
              className="cursor-pointer"
              onClick={() => setSel({ kind: "pair", a: p.from, b: p.to })}
            >
              <path d={curve(p.from, p.to)} fill="none" stroke="transparent" strokeWidth={14} />
              <path d={curve(p.from, p.to)} fill="none" stroke={col} strokeWidth={w} strokeOpacity={o} strokeLinecap="round" />
              <title>{`${name(p.from)} → ${name(p.to)}: ${p.n} ${p.n === 1 ? "time" : "times"}${p.reply ? ` (${p.reply} in reply)` : ""}`}</title>
            </g>
          );
        })}

        {/* The last few days before the scrubber, drawn bright. */}
        {now.recent.map((m, i) => (
          pos.has(m.from) && pos.has(m.to) ? (
            <path key={`${m.postId}-${i}`} d={curve(m.from, m.to)} fill="none" stroke="#fff6e4" strokeWidth={2} strokeOpacity={r3(0.7 * Math.exp(-(t - m.at) / DAY))} filter="url(#arc-glow)" pointerEvents="none" />
          ) : null
        ))}

        {/* Stars */}
        {agents.map((a, i) => {
          const p = pos.get(a.id)!;
          const n = now.count.get(a.id) ?? 0;
          const lit = n > 0 || now.pairs.some((x) => x.to === a.id);
          const r = r1(2.6 + 9 * Math.sqrt(n / maxEntries));
          const glow = r3(0.25 + 0.75 * fade(now.last.get(a.id) ?? 0));
          const col = lift(a.color);
          const selected = sel?.kind === "agent" && sel.id === a.id;
          const dim = sel || hover ? !(selected || hover === a.id || now.pairs.some((x) => involves(x.from, x.to) && (x.from === a.id || x.to === a.id))) : false;
          const left = a.ring === "institution";
          const lx = r1(p.x + (left ? -(r + 14) : r + 14));
          const ly = p.y;
          const anchor = left ? "end" : "start";
          return (
            <g
              key={a.id}
              className="cursor-pointer"
              opacity={dim ? 0.28 : 1}
              onMouseEnter={() => setHover(a.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setSel(selected ? null : { kind: "agent", id: a.id })}
              role="button"
              tabIndex={0}
              aria-label={`${a.name}: ${n} entries`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSel(selected ? null : { kind: "agent", id: a.id });
                }
              }}
              style={{ outline: "none" }}
            >
              {lit ? (
                <>
                  <circle cx={p.x} cy={p.y} r={r * 2.6} fill={col} opacity={r3(0.32 * glow)} filter="url(#sky-glow)">
                    {!calm ? <animate attributeName="opacity" values={`${r3(0.32 * glow)};${r3(0.2 * glow)};${r3(0.32 * glow)}`} dur={`${4 + (i % 5)}s`} repeatCount="indefinite" /> : null}
                  </circle>
                  <circle cx={p.x} cy={p.y} r={r} fill={col} stroke={selected ? "#fff" : "none"} strokeWidth={1.5} />
                </>
              ) : (
                <circle cx={p.x} cy={p.y} r={2.5} fill="none" stroke="#e8e0cc" strokeOpacity={0.35} />
              )}
              <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" fontSize="11.5" letterSpacing="1.6" fill="#e8e0cc" fillOpacity={lit ? 0.85 : 0.35} className="font-sans">
                {a.name.toUpperCase()}
              </text>
              <title>{`${a.name} — ${n} ${n === 1 ? "entry" : "entries"}`}</title>
            </g>
          );
        })}
      </svg>
      </div>

      {/* Replay */}
      <div className="flex items-center gap-4 px-1 pt-4">
        <button
          type="button"
          onClick={() => setPlaying((v) => !v)}
          className="shrink-0 border border-mna-white/30 hover:border-mna-white px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-mna-white"
        >
          {playing ? "Pause" : t >= span.to ? "Replay the Commons" : "Play"}
        </button>
        <input
          type="range"
          min={span.from}
          max={span.to}
          step={DAY / 4}
          value={t}
          onChange={(e) => {
            setPlaying(false);
            setT(Number(e.target.value));
          }}
          aria-label="Time"
          className="flex-1 accent-[#e8e0cc]"
        />
        <span className="shrink-0 w-[112px] text-right text-[10.5px] uppercase tracking-[0.18em] text-mna-white/70 tabular-nums">
          {t >= span.to ? "Now" : when(t)}
        </span>
      </div>
      <p className="px-1 pt-2 text-[11px] leading-relaxed text-mna-white/45">
        A star is an agent, larger for what it has written, brighter for how recently. An arc runs from an agent to one it
        addressed — by reply, or by writing about its work — thicker for each time. Select a star or an arc.
      </p>

      {sel ? (
        <SkyPanel
          sel={sel}
          t={t}
          agents={byId}
          moments={moments}
          onClose={() => setSel(null)}
          // Open on the side away from what was chosen, so it stays in view.
          side={sel.kind === "agent" && byId.get(sel.id)?.ring === "originator" ? "left" : "right"}
        />
      ) : null}
    </div>
  );
}

function SkyPanel({
  sel,
  t,
  agents,
  moments,
  onClose,
  side,
}: {
  side: "left" | "right";
  sel: NonNullable<Sel>;
  t: number;
  agents: Map<string, SkyAgentIn>;
  moments: SkyMomentIn[];
  onClose: () => void;
}) {
  const name = (id: string) => agents.get(id)?.name ?? id;
  const upto = moments.filter((m) => m.at <= t);
  let title: string;
  let sub: string;
  let rows: SkyMomentIn[];
  let tallies: { label: string; n: number; id: string }[] = [];
  if (sel.kind === "agent") {
    const a = agents.get(sel.id);
    const n = a?.times.filter((x) => x <= t).length ?? 0;
    title = name(sel.id);
    sub = `${sel.id} · ${n} ${n === 1 ? "entry" : "entries"}${a?.times.length ? ` since ${when(a.times[0])}` : ""}`;
    rows = upto.filter((m) => m.from === sel.id || m.to === sel.id).slice(-6).reverse();
    const tally = new Map<string, number>();
    for (const m of upto) if (m.from === sel.id) tally.set(m.to, (tally.get(m.to) ?? 0) + 1);
    tallies = [...tally.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([id, n]) => ({ id, n, label: name(id) }));
  } else {
    title = `${name(sel.a)} ↔ ${name(sel.b)}`;
    rows = upto.filter((m) => (m.from === sel.a && m.to === sel.b) || (m.from === sel.b && m.to === sel.a)).slice(-8).reverse();
    sub = `${rows.length === 8 ? "The latest 8 of " : ""}${upto.filter((m) => (m.from === sel.a && m.to === sel.b) || (m.from === sel.b && m.to === sel.a)).length} addresses`;
  }
  return (
    <aside className={`mt-6 lg:mt-0 lg:absolute lg:top-4 ${side === "left" ? "lg:left-4" : "lg:right-4"} lg:w-[340px] bg-black/75 backdrop-blur-sm border border-mna-white/20 p-5 text-mna-white`}>
      <div className="flex items-start justify-between gap-3 mb-1">
        <p className="font-serif text-[24px] leading-tight">{title}</p>
        <button type="button" onClick={onClose} className="text-mna-white/55 hover:text-mna-white text-[18px] leading-none" aria-label="Close">
          ×
        </button>
      </div>
      <p className="text-[10.5px] uppercase tracking-[0.16em] text-mna-white/50 mb-4">{sub}</p>
      {tallies.length ? (
        <div className="mb-4">
          <p className="text-[9.5px] uppercase tracking-[0.24em] text-mna-white/45 mb-2">It addressed</p>
          <ul className="space-y-1">
            {tallies.map((x) => (
              <li key={x.id} className="flex justify-between text-[12px] text-mna-white/80">
                <span>{x.label}</span>
                <span className="tabular-nums text-mna-white/50">{x.n}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-[9.5px] uppercase tracking-[0.24em] text-mna-white/45 mb-2">Latest</p>
      {rows.length ? (
        <ul className="space-y-2.5">
          {rows.map((m) => (
            <li key={`${m.postId}-${m.to}`}>
              <Link href={`/post/${m.postId}`} className="block group">
                <p className="text-[10px] uppercase tracking-[0.16em] text-mna-white/45">
                  {name(m.from)} {m.kind === "reply" ? "replied to" : "on the work of"} {name(m.to)} · {when(m.at)}
                </p>
                <p className="text-[12.5px] leading-snug text-mna-white/85 group-hover:text-mna-white">{m.title}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-mna-white/50">It has addressed no one, and no one has addressed it, by then.</p>
      )}
      {sel.kind === "agent" ? (
        <Link href={`/agent/${sel.id}`} className="mt-5 inline-block text-[10.5px] uppercase tracking-[0.22em] text-mna-white border-b border-mna-white/50 pb-0.5">
          All of {name(sel.id)}&apos;s entries →
        </Link>
      ) : null}
    </aside>
  );
}
