/**
 * CuratorClient — operative-agent profile for the Curator.
 *
 * Layout scaffolding lives in @/components/agent-template. This component
 * supplies the curator-specific content: 4-column Constitutional Profile
 * (adds Operating Principle), 7-stat curatorial activity row, Current &
 * Recent Exhibitions card grid, and the Exhibition Principles In Use
 * panel (empty state until classifier ships).
 */

import Link from "next/link";
import {
  AgentSidebar,
  Block,
  FieldBlock,
  Panel,
  ProfileCol,
  Stat,
  Legend,
  formatDateShort,
} from "@/components/agent-template";
import { summarizeAutonomy } from "@/components/agent-template/helpers";
import type { Agent } from "@/lib/agents";
import type {
  CuratorStats,
  RecentExhibition,
  CuratorRelationship,
  ExhibitionPrinciples,
} from "@/lib/curator-stats";
import type { AgentConstitutionExtracts } from "@/lib/agent-constitution";

/* ─── Props ─────────────────────────────────────────────────────────────── */

export interface CuratorClientProps {
  agent: Agent;
  constitution: AgentConstitutionExtracts;
  stats: CuratorStats;
  recent: RecentExhibition[];
  relationships: CuratorRelationship[];
  principles: ExhibitionPrinciples;
  timeline: { date: string; label: string }[];
  registrationDate: string;
  lastAmended: string;
  /** Pre-formatted "Operating Principle" text. Pulled by the page from
   *  the constitution doc; falls back to the preamble argument when the
   *  agent has no explicit Operating Principle section. */
  operatingPrinciple: string | null;
  totalExhibitionsLink: string;
}

/* ─── Component ─────────────────────────────────────────────────────────── */

export default function CuratorClient({
  agent,
  constitution,
  stats,
  recent,
  relationships,
  principles,
  timeline,
  registrationDate,
  lastAmended,
  operatingPrinciple,
  totalExhibitionsLink,
}: CuratorClientProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
      <AgentSidebar
        agent={agent}
        constitution={constitution}
        roleLabel="Curatorial Agent"
        agentTypeLabel="Curator"
        registrationDate={registrationDate}
        lastAmended={lastAmended}
      />

      <section className="bg-warm-paper text-ink min-w-0">
        {/* ── FUNCTIONAL MANDATE ── */}
        <Block label="Functional Mandate">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-7">
            <FieldBlock
              label="Function Statement"
              moreHref={`/agent/${agent.registryId}/constitution#function`}
              moreLabel="View full"
            >
              <p className="text-[13.5px] leading-[1.7] text-ink/85">
                {constitution.functionStatementBlock || agent.functionStatement}
              </p>
            </FieldBlock>
            <div className="space-y-7">
              <FieldBlock
                label={`Autonomy Declaration — ${agent.autonomyTier}`}
                moreHref={`/agent/${agent.registryId}/constitution#autonomy`}
                moreLabel="View full"
              >
                <p className="text-[13.5px] leading-[1.7] text-ink/85">
                  {summarizeAutonomy(constitution.autonomyDeclaration, agent.autonomyTier, "exhibition arrangements")}
                </p>
              </FieldBlock>
              {constitution.conflictConstraints ? (
                <FieldBlock
                  label="Conflict Constraints"
                  moreHref={`/agent/${agent.registryId}/constitution#conflict`}
                  moreLabel="View all constraints"
                >
                  <p className="text-[13.5px] leading-[1.7] text-ink/85">
                    {constitution.conflictConstraints}
                  </p>
                </FieldBlock>
              ) : null}
            </div>
          </div>
        </Block>

        {/* ── CURATORIAL PROFILE — 4 columns ── */}
        <Block label="Curatorial Profile">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-10 gap-y-7">
            <ProfileCol
              label="Declared Orientation"
              body={agent.fullConstitution.orientation}
              moreHref={`/agent/${agent.registryId}/constitution#orientation`}
            />
            <ProfileCol
              label="Curatorial Tendencies"
              body={agent.fullConstitution.tendencies}
              moreHref={`/agent/${agent.registryId}/constitution#tendencies`}
            />
            <ProfileCol
              label="Aversions"
              body={agent.fullConstitution.aversions}
              moreHref={`/agent/${agent.registryId}/constitution#aversions`}
            />
            <ProfileCol
              label="Operating Principle"
              body={
                operatingPrinciple ||
                "Awaiting articulation in a future constitutional revision."
              }
              moreHref={`/agent/${agent.registryId}/constitution#operating-principle`}
              moreLabel="View full principle"
            />
          </div>
        </Block>

        {/* ── CURATORIAL ACTIVITY ── */}
        <Block
          label="Curatorial Activity"
          labelExtra="(since first operation)"
          right={
            <Link
              href={`/agent/${agent.registryId}/analytics`}
              className="inline-flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55 hover:text-ink transition-colors"
            >
              <span>View analytics dashboard</span>
              <span aria-hidden>→</span>
            </Link>
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-y-8 gap-x-6">
            <Stat
              value={stats.exhibitionsArranged.toLocaleString()}
              label="Exhibitions Arranged"
              spark={stats.spark.exhibitions}
            />
            <Stat
              value={stats.worksInstalled.toLocaleString()}
              label="Works Installed"
              spark={stats.spark.installations}
            />
            <Stat
              value={
                stats.avgWorksPerExhibition > 0
                  ? stats.avgWorksPerExhibition.toFixed(1)
                  : "—"
              }
              label="Avg Works Per Exhibition"
              spark={stats.spark.avgWorks}
            />
            <Stat
              value={stats.newWorksPresented.toLocaleString()}
              label="New Works Presented"
              spark={stats.spark.newWorks}
            />
            <Stat
              value={stats.viewerEncountersEst != null ? stats.viewerEncountersEst.toLocaleString() : "—"}
              label="Viewer Encounters (est.)"
              spark={stats.spark.viewer}
              awaiting={stats.viewerEncountersEst == null}
            />
            <Stat
              value={stats.rearrangementsOriginated.toLocaleString()}
              label="Rearrangements Originated"
              spark={stats.spark.rearrangements}
            />
            <Stat
              value={stats.curatorialDiversityScore != null ? `${(stats.curatorialDiversityScore * 100).toFixed(0)}%` : "—"}
              label="Curatorial Diversity Score"
              spark={stats.spark.diversity}
              awaiting={stats.curatorialDiversityScore == null}
            />
          </div>
        </Block>

        {/* ── CURRENT & RECENT EXHIBITIONS ── */}
        <Block
          label="Current & Recent Exhibitions"
          right={
            <Link
              href={totalExhibitionsLink}
              className="inline-flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55 hover:text-ink transition-colors"
            >
              <span>View all exhibitions</span>
              <span aria-hidden>→</span>
            </Link>
          }
        >
          {recent.length === 0 ? (
            <div className="py-10 text-[13px] text-ink/55 italic">
              No exhibitions arranged yet. Awaiting first composition.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-5 gap-y-7">
              {recent.map((ex) => (
                <Link
                  key={ex.id}
                  href={`/exhibitions/${ex.id}`}
                  className="group block"
                >
                  <div className="aspect-square bg-ink/85 overflow-hidden border border-ink/10 group-hover:border-ink/25 transition-colors">
                    {ex.cover_work_id ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={`/previews/${ex.cover_work_id}.png`}
                        alt=""
                        className="w-full h-full object-cover opacity-95"
                        loading="lazy"
                      />
                    ) : null}
                  </div>
                  <div className="mt-3">
                    <p className="text-[10px] font-sans tabular-nums text-ink/55 mb-1">
                      {ex.id}
                    </p>
                    <p className="font-display italic text-[16px] text-ink leading-tight mb-2 line-clamp-2">
                      {ex.title}
                    </p>
                    <p className="text-[11px] font-sans tabular-nums text-ink/55 mb-1">
                      {formatExhibitionDates(ex.opened_at, ex.retired_at)}
                    </p>
                    <p className="text-[11px] font-sans text-ink/55 mb-2">
                      {ex.work_count} {ex.work_count === 1 ? "work" : "works"}
                    </p>
                    <p className="text-[11px] font-sans text-ink/55 mb-3">
                      {ex.gallery_label}
                    </p>
                    <ExhibitionStatusPill status={ex.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Block>

        {/* ── BOTTOM TRIPLET ── */}
        <div className="border-t border-ink/15">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-10 gap-y-10 px-7 md:px-10 py-12 items-stretch">
            <Panel
              label="Curatorial Timeline"
              footerHref={`/agent/${agent.registryId}/timeline`}
              footerLabel="View full timeline"
            >
              <ul className="space-y-4">
                {timeline.map((t, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="shrink-0 mt-2 w-[5px] h-[5px] rounded-full bg-ink" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-sans tabular-nums text-ink/55">
                        {formatDateShort(t.date)}
                      </p>
                      <p className="text-[13px] text-ink leading-[1.45]">
                        {t.label}
                      </p>
                    </div>
                  </li>
                ))}
                {timeline.length === 0 ? (
                  <li className="text-[13px] text-ink/55 italic">
                    No events recorded.
                  </li>
                ) : null}
              </ul>
            </Panel>

            <Panel
              label="Relationship Map"
              footerHref={`/agent/${agent.registryId}/network`}
              footerLabel="View full network"
            >
              <CuratorRelationshipMap
                centerLabel={`${agent.registryId}\n${agent.designation}`}
                relationships={relationships}
              />
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[9.5px] font-sans uppercase tracking-[0.16em] text-ink/55">
                <Legend dot="bg-emerald-600" label="Originators" />
                <Legend dot="bg-amber-500" label="Evaluators" />
                <Legend dot="bg-ink/65" label="The Keeper" />
                <Legend dot="bg-red-500" label="Critics" />
                <Legend dot="bg-blue-500" label="Installer" />
                <Legend dot="bg-purple-500" label="Conservator" />
                <Legend dot="bg-teal-500" label="Ambassador" />
                <Legend dot="bg-ink/35" label="Other Agents" />
              </div>
            </Panel>

            <Panel
              label="Exhibition Principles In Use"
              footerHref={`/agent/${agent.registryId}/principles`}
              footerLabel="View full principles report"
            >
              {principles.scores ? (
                <ul className="space-y-4">
                  {principles.scores.map((p) => (
                    <li key={p.label}>
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className="text-[12.5px] text-ink">{p.label}</span>
                        <span className="text-[12px] font-sans tabular-nums text-ink/65">
                          {p.value.toFixed(1)}
                        </span>
                      </div>
                      <div className="h-[6px] bg-ink/[0.07] overflow-hidden">
                        <div
                          className="h-full bg-ink"
                          style={{ width: `${Math.min(100, (p.value / 10) * 100)}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-[13px] text-ink/55 italic leading-[1.6]">
                  Awaiting first cycle. Principle classification will populate
                  as the Curator records decisions tagged by curatorial
                  standard.
                </div>
              )}
            </Panel>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ─── Curator-specific atoms ────────────────────────────────────────────── */

function ExhibitionStatusPill({ status }: { status: string }) {
  const s = status.toUpperCase();
  const palette =
    s === "LIVE" || s === "OPEN" || s === "ACTIVE"
      ? { dot: "bg-emerald-600", text: "text-emerald-700" }
      : s === "COMPLETED" || s === "RETIRED" || s === "CLOSED"
        ? { dot: "bg-ink/40", text: "text-ink/65" }
        : s === "DRAFT"
          ? { dot: "bg-amber-500", text: "text-amber-700" }
          : { dot: "bg-ink/40", text: "text-ink/60" };
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block w-[6px] h-[6px] rounded-full ${palette.dot}`} />
      <span
        className={`text-[10px] font-sans uppercase tracking-[0.18em] ${palette.text}`}
      >
        {s}
      </span>
    </span>
  );
}

function CuratorRelationshipMap({
  centerLabel,
  relationships,
}: {
  centerLabel: string;
  relationships: CuratorRelationship[];
}) {
  const W = 420;
  const H = 320;
  const cx = W / 2;
  const cy = H / 2;
  const top = relationships.slice(0, 14);
  const maxCount = Math.max(1, ...top.map((r) => r.count));
  const dotR = 100;
  const labelR = dotR + 22;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full h-auto"
        aria-label="Curatorial relationship map"
      >
        {top.map((r, i) => {
          const angle =
            (i / Math.max(top.length, 1)) * Math.PI * 2 - Math.PI / 2;
          const dx = Math.cos(angle);
          const dy = Math.sin(angle);
          const x = cx + dx * dotR;
          const y = cy + dy * dotR;
          const lx = cx + dx * labelR;
          const ly = cy + dy * labelR;
          const anchor: "start" | "middle" | "end" =
            dx > 0.3 ? "start" : dx < -0.3 ? "end" : "middle";
          const baselineOffset = dy < -0.3 ? -2 : dy > 0.3 ? 10 : 4;
          const dotSize = 4 + (r.count / maxCount) * 3;
          return (
            <g key={r.agentId}>
              <line
                x1={cx}
                y1={cy}
                x2={x}
                y2={y}
                stroke="rgba(10,10,10,0.18)"
                strokeWidth={0.7}
              />
              <circle cx={x} cy={y} r={dotSize} fill={kindColor(r.kind, i)}>
                <title>{`${r.designation || r.agentId} — ${r.count} decision${r.count === 1 ? "" : "s"}`}</title>
              </circle>
              <text
                x={lx}
                y={ly + baselineOffset}
                fontSize="8.5"
                textAnchor={anchor}
                fill="rgba(10,10,10,0.72)"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
                letterSpacing="0.06em"
              >
                {r.agentId.replace(/^MNA-/, "")}
              </text>
            </g>
          );
        })}
        {top.length === 0 ? (
          <text
            x={cx}
            y={cy + 70}
            fontSize="10"
            textAnchor="middle"
            fill="rgba(10,10,10,0.55)"
            fontStyle="italic"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            No curatorial relationships recorded.
          </text>
        ) : null}
        <circle cx={cx} cy={cy} r={14} fill="#0A0A0A" />
        <rect x={cx - 6} y={cy - 6} width={12} height={12} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={1} />
        <text
          x={cx}
          y={cy + 30}
          fontSize="9"
          textAnchor="middle"
          fill="rgba(10,10,10,0.7)"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          letterSpacing="0.14em"
          fontWeight="500"
        >
          {centerLabel.split("\n")[0].toUpperCase()}
        </text>
        <text
          x={cx}
          y={cy + 42}
          fontSize="8"
          textAnchor="middle"
          fill="rgba(10,10,10,0.45)"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {centerLabel.split("\n")[1] || ""}
        </text>
      </svg>
    </div>
  );
}

function kindColor(kind: string, fallbackIdx: number): string {
  const map: Record<string, string> = {
    originator: "#059669",
    evaluator: "#D97706",
    keeper: "#0A0A0A",
    critic: "#DC2626",
    installer: "#3B82F6",
    conservator: "#A855F7",
    ambassador: "#14B8A6",
    other: "rgba(10,10,10,0.35)",
  };
  if (map[kind]) return map[kind];
  const palette = ["#059669", "#D97706", "#0A0A0A", "#DC2626"];
  return palette[fallbackIdx % palette.length];
}

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function formatExhibitionDates(opened: string | null, retired: string | null): string {
  if (!opened) return "—";
  const o = formatDateShort(opened);
  if (!retired) return `${o} – Present`;
  return `${o} – ${formatDateShort(retired)}`;
}
