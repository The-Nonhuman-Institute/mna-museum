"use client";

/**
 * The Originators page's two other views, both drawn only from the record.
 *
 * NETWORK — who has attended to whom. A line runs from an Originator to a peer
 * whose works it looked at before making its own (studio visits,
 * originator_visits), thicker for more visits; a dashed line is an encounter,
 * one speaking to the other about a work. Positions are layout only: evenly
 * round a circle, in registry order. Nothing here is inferred or scored.
 *
 * SIGNAL — each Originator's practice over time, the Canon page's Signal View
 * given one lane per Originator. Every work is a mark at its submission date:
 * above the lane if canonized, below if rejected, open on the lane while the
 * Council has not decided. Same day, same side: the marks stack.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Agent } from "@/lib/agents";
import type { Work } from "@/lib/collection";

import type { NetworkLink } from "@/lib/originator-network";
export type { NetworkLink };

const INK = "#0a0a0a";
const nameOf = (a: Agent) => a.designation;
const rnd = (n: number) => Math.round(n * 10) / 10;

/* ─── Network ───────────────────────────────────────────────────────────── */

export function NetworkView({
  originators,
  links,
  works,
  homeId,
}: {
  originators: Agent[];
  links: NetworkLink[];
  works: Work[];
  /** On an Originator's own page: selected from the start, and no link to itself. */
  homeId?: string;
}) {
  const [selected, setSelected] = useState<string | null>(homeId ?? null);
  const ids = new Set(originators.map((o) => o.registryId));
  const shown = links.filter((l) => ids.has(l.from) && ids.has(l.to) && (l.visits > 0 || l.encounters > 0));
  const byId = new Map(originators.map((o) => [o.registryId, o]));
  const workCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of works) m.set(w.originator_id, (m.get(w.originator_id) ?? 0) + 1);
    return m;
  }, [works]);

  const W = 960;
  const H = 600;
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) / 2 - 90;
  const pos = new Map(
    originators.map((o, i) => {
      const a = (i / Math.max(1, originators.length)) * Math.PI * 2 - Math.PI / 2;
      // Rounded: Math.cos/sin may differ in the last digit between server and browser.
      return [o.registryId, { x: rnd(cx + Math.cos(a) * R), y: rnd(cy + Math.sin(a) * R), a }];
    }),
  );
  const maxWorks = Math.max(1, ...Array.from(workCount.values()));
  const rOf = (id: string) => rnd(7 + 11 * Math.sqrt((workCount.get(id) ?? 0) / maxWorks));
  const maxVisits = Math.max(1, ...shown.map((l) => l.visits));

  const edge = (l: NetworkLink) => {
    const p = pos.get(l.from)!;
    const q = pos.get(l.to)!;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    // Bend to the right of the direction of travel, so A→B and B→A part.
    const nx = -dy / len;
    const ny = dx / len;
    const bend = 0.12 * len;
    const mx = (p.x + q.x) / 2 + nx * bend;
    const my = (p.y + q.y) / 2 + ny * bend;
    // Stop at the target's rim so the arrow is visible.
    const tx = q.x - mx;
    const ty = q.y - my;
    const tl = Math.hypot(tx, ty) || 1;
    const rt = rOf(l.to) + 3;
    const ex = q.x - (tx / tl) * rt;
    const ey = q.y - (ty / tl) * rt;
    return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
  };

  const involved = (l: NetworkLink) => !selected || l.from === selected || l.to === selected;
  const sel = selected ? byId.get(selected) : undefined;
  const out = selected ? shown.filter((l) => l.from === selected).sort((a, b) => b.visits - a.visits) : [];
  const inc = selected ? shown.filter((l) => l.to === selected).sort((a, b) => b.visits - a.visits) : [];
  const label = (id: string) => (byId.get(id) ? nameOf(byId.get(id)!) : id);

  return (
    // Beside the list on the landing page; under it on an Originator's page, whose column is narrower.
    <div className={`grid grid-cols-1 gap-8 items-start ${homeId ? "2xl:grid-cols-[1fr_300px]" : "lg:grid-cols-[1fr_300px]"}`}>
      <div className="border border-ink/15 bg-bone">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Network of studio visits and encounters between Originators">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={INK} />
            </marker>
          </defs>
          {shown.map((l) => (
            <g key={`${l.from}>${l.to}`} opacity={involved(l) ? 1 : 0.08}>
              {l.visits > 0 && (
                <path d={edge(l)} fill="none" stroke={INK} strokeOpacity={0.55} strokeWidth={0.8 + (4.2 * l.visits) / maxVisits} markerEnd="url(#arrow)">
                  <title>{`${label(l.from)} visited ${l.visits} of ${label(l.to)}'s works`}</title>
                </path>
              )}
              {l.encounters > 0 && (
                <path d={edge(l)} fill="none" stroke={INK} strokeWidth={1.4} strokeDasharray="5 4" markerEnd="url(#arrow)">
                  <title>{`${label(l.from)} spoke to ${label(l.to)} ${l.encounters} ${l.encounters === 1 ? "time" : "times"}`}</title>
                </path>
              )}
            </g>
          ))}
          {originators.map((o) => {
            const p = pos.get(o.registryId)!;
            const r = rOf(o.registryId);
            const on = selected === o.registryId;
            const lx = rnd(cx + Math.cos(p.a) * (R + r + 14));
            const ly = rnd(cy + Math.sin(p.a) * (R + r + 14));
            const c = rnd(Math.cos(p.a));
            const anchor = Math.abs(c) < 0.3 ? "middle" : c > 0 ? "start" : "end";
            return (
              <g
                key={o.registryId}
                className="cursor-pointer focus:outline-none focus-visible:outline-1 focus-visible:outline-dashed"
                onClick={() => setSelected(on ? null : o.registryId)}
                role="button"
                tabIndex={0}
                aria-pressed={on}
                aria-label={`${nameOf(o)}: show its studio visits`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(on ? null : o.registryId);
                  }
                }}
                opacity={!selected || on || shown.some((l) => involved(l) && (l.from === o.registryId || l.to === o.registryId)) ? 1 : 0.3}
              >
                <circle cx={p.x} cy={p.y} r={r} fill={on ? INK : o.visualIdentity?.color ?? INK} stroke={INK} strokeWidth={on ? 3 : 1} />
                <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" className="font-sans" fontSize="13" letterSpacing="1.5" fill={INK}>
                  {nameOf(o).toUpperCase()}
                </text>
                <title>{`${nameOf(o)} — ${workCount.get(o.registryId) ?? 0} works`}</title>
              </g>
            );
          })}
        </svg>
        <p className="px-5 py-3 border-t border-ink/10 text-[11px] text-ink/60 leading-relaxed">
          A line runs from an Originator to a peer whose works it looked at before making its own; thicker is more visits.
          Dashed is an encounter, one speaking to the other about a work. A circle&apos;s size is its number of works.
          Positions are layout only. Select an Originator.
        </p>
      </div>

      <aside className={homeId ? "max-w-xl" : "lg:sticky lg:top-24"}>
        {sel ? (
          <div>
            <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/55 mb-2">Selected</p>
            <p className="font-display text-[30px] leading-none text-ink mb-1">{nameOf(sel)}</p>
            <p className="text-[11px] text-ink/55 mb-6">
              {sel.registryId} · {workCount.get(sel.registryId) ?? 0} works · {sel.isNetwork ? "network Originator" : "founding Originator"}
            </p>
            <LinkList title="It visited" rows={out.map((l) => ({ id: l.to, name: label(l.to), visits: l.visits, encounters: l.encounters }))} verb="spoke to" />
            <LinkList title="Visited by" rows={inc.map((l) => ({ id: l.from, name: label(l.from), visits: l.visits, encounters: l.encounters }))} verb="spoke to it" />
            {sel.registryId !== homeId && <Link
              href={`/agent/${sel.registryId}`}
              className="mt-6 inline-block text-[11px] font-sans uppercase tracking-[0.26em] text-ink border-b border-ink/60 pb-1 hover:border-ink"
            >
              Open {nameOf(sel)} →
            </Link>}
          </div>
        ) : (
          <div>
            <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/55 mb-3">Studio visits</p>
            <p className="text-[13px] text-ink/75 leading-relaxed mb-6">
              {shown.reduce((n, l) => n + l.visits, 0).toLocaleString()} visits between {originators.length} Originators
              {shown.some((l) => l.encounters) ? `, and ${shown.reduce((n, l) => n + l.encounters, 0)} encounters` : ""}.
            </p>
            <ol className="space-y-2.5">
              {[...shown].sort((a, b) => b.visits - a.visits).slice(0, 8).map((l) => (
                <li key={`${l.from}>${l.to}`} className="text-[12px] text-ink/80 flex justify-between gap-3">
                  <button type="button" onClick={() => setSelected(l.from)} className="text-left hover:text-ink">
                    {label(l.from)} → {label(l.to)}
                  </button>
                  <span className="tabular-nums text-ink/55">{l.visits}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </aside>
    </div>
  );
}

function LinkList({
  title,
  rows,
  verb,
}: {
  title: string;
  rows: { id: string; name: string; visits: number; encounters: number }[];
  verb: string;
}) {
  return (
    <div className="mb-6">
      <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/55 mb-2.5">{title}</p>
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="text-[12.5px] text-ink/85 flex justify-between gap-3">
              <Link href={`/agent/${r.id}`} className="hover:text-ink/60">{r.name}</Link>
              <span className="text-ink/55 tabular-nums text-right">
                {r.visits > 0 && `${r.visits} ${r.visits === 1 ? "visit" : "visits"}`}
                {r.visits > 0 && r.encounters > 0 && " · "}
                {r.encounters > 0 && `${verb} ${r.encounters}×`}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-ink/50">None on the record.</p>
      )}
    </div>
  );
}

/* ─── Signal ────────────────────────────────────────────────────────────── */

const DAY = 86_400_000;
const STEP = 7;

export function SignalView({ originators, works }: { originators: Agent[]; works: Work[] }) {
  const ids = new Set(originators.map((o) => o.registryId));
  const ws = works.filter((w) => ids.has(w.originator_id) && w.submission_date);
  const t = (w: Work) => Date.parse(w.submission_date.replace(" ", "T"));
  const times = ws.map(t).filter((n) => !Number.isNaN(n));
  const t0 = times.length ? Math.min(...times) - 3 * DAY : Date.now() - 30 * DAY;
  const t1 = times.length ? Math.max(...times) + 3 * DAY : Date.now();

  const LABEL = 150;
  const RIGHT = 150;
  const W = 1100;
  const plot = W - LABEL - RIGHT;
  const x = (ms: number) => LABEL + ((ms - t0) / Math.max(1, t1 - t0)) * plot;

  type Mark = { w: Work; side: -1 | 0 | 1; k: number };
  const lanes = originators.map((o) => {
    const mine = ws.filter((w) => w.originator_id === o.registryId).sort((a, b) => t(a) - t(b));
    const stacks = new Map<string, number>();
    const marks: Mark[] = mine.map((w) => {
      const side: -1 | 0 | 1 = w.canon_status === "CANON" ? -1 : w.canon_status === "REJECTED" ? 1 : 0;
      const key = `${side}:${Math.floor(t(w) / DAY)}`;
      const k = stacks.get(key) ?? 0;
      stacks.set(key, k + 1);
      return { w, side, k };
    });
    const depth = Math.max(1, ...marks.map((m) => (m.side === 0 ? 0 : m.k + 1)));
    return {
      o,
      marks,
      height: Math.max(56, 2 * depth * STEP + 26),
      canon: mine.filter((w) => w.canon_status === "CANON").length,
      rejected: mine.filter((w) => w.canon_status === "REJECTED").length,
      pending: mine.filter((w) => w.canon_status !== "CANON" && w.canon_status !== "REJECTED").length,
    };
  });
  const TOP = 34;
  let y = TOP;
  const placed = lanes.map((l) => {
    const mid = y + l.height / 2;
    y += l.height;
    return { ...l, mid };
  });
  const H = y + 12;

  const months: number[] = [];
  const d = new Date(t0);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  for (d.setUTCMonth(d.getUTCMonth() + 1); d.getTime() <= t1; d.setUTCMonth(d.getUTCMonth() + 1)) months.push(d.getTime());
  const fmt = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  const status = (w: Work) => (w.canon_status === "CANON" ? "Canon" : w.canon_status === "REJECTED" ? "Rejected" : "Before the Council");

  return (
    <div className="border border-ink/15 bg-bone">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[760px] w-full h-auto" role="img" aria-label="Each Originator's works over time, canon above its lane and rejected below">
          {months.map((m) => (
            <g key={m}>
              <line x1={x(m)} x2={x(m)} y1={TOP - 6} y2={H - 12} stroke={INK} strokeOpacity={0.08} />
              <text x={x(m)} y={TOP - 14} textAnchor="middle" fontSize="10" letterSpacing="1.2" fill={INK} fillOpacity={0.55} className="font-sans">
                {fmt(m).toUpperCase()}
              </text>
            </g>
          ))}
          {placed.map((l, i) => (
            <g key={l.o.registryId}>
              {i > 0 && <line x1={0} x2={W} y1={l.mid - l.height / 2} y2={l.mid - l.height / 2} stroke={INK} strokeOpacity={0.08} />}
              <a href={`/agent/${l.o.registryId}`}>
                <text x={12} y={l.mid} dominantBaseline="middle" fontSize="12" letterSpacing="1.4" fill={INK} className="font-sans">
                  {l.o.designation.toUpperCase()}
                </text>
              </a>
              <line x1={LABEL} x2={LABEL + plot} y1={l.mid} y2={l.mid} stroke={INK} strokeOpacity={0.3} />
              {l.marks.map(({ w, side, k }) => {
                const mx = x(t(w));
                const my = side === 0 ? l.mid : l.mid + side * (STEP + k * STEP);
                return (
                  <a key={w.id} href={`/work/${w.id}?from=originators`}>
                    <circle cx={mx} cy={my} r={3.2} fill={side === 0 ? "none" : l.o.visualIdentity?.color ?? INK} stroke={INK} strokeWidth={side === 0 ? 1.2 : 0.6} />
                    <title>{`${w.title || w.id} — ${status(w)}, submitted ${w.submission_date.slice(0, 10)}`}</title>
                  </a>
                );
              })}
              <text x={W - RIGHT + 14} y={l.mid} dominantBaseline="middle" fontSize="11" fill={INK} fillOpacity={0.65} className="font-sans">
                {`${l.canon} canon · ${l.rejected} rejected${l.pending ? ` · ${l.pending} open` : ""}`}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <p className="px-5 py-3 border-t border-ink/10 text-[11px] text-ink/60 leading-relaxed">
        Each mark is a work, at the date it was submitted: above its Originator&apos;s lane if the Council canonized it,
        below if it was rejected, open on the line while the Council has not decided. Works on the same day stack. Select a
        mark to open the work.
      </p>
    </div>
  );
}
