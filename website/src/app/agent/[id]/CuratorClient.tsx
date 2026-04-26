/**
 * CuratorClient — agent profile template for the Curator.
 *
 * Mirrors EvaluatorClient's two-column layout (dark sidebar + light main)
 * with the four template-specific differences from the Curator mockup:
 *
 *   1. Constitutional Profile is 4 columns (adds Operating Principle)
 *   2. Curatorial Activity has 7 curator-specific stats; metrics we
 *      don't yet track render as "—" rather than fabricated numbers
 *   3. Recent Evaluations table → Current & Recent Exhibitions
 *   4. Citation Activity panel → Exhibition Principles In Use
 */

import Link from "next/link";
import AgentSignature from "@/components/AgentSignature";
import CiteButton from "@/components/CiteButton";
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
      {/* ═══ Sidebar (dark) ═══ */}
      <aside className="bg-ink text-mna-white lg:sticky lg:top-[72px] lg:self-start lg:max-h-[calc(100vh-72px)] lg:overflow-y-auto">
        <div className="px-7 py-8">
          <Link
            href="/agents"
            className="inline-flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/55 hover:text-mna-white transition-colors mb-7"
          >
            <span aria-hidden>←</span>
            <span>Back to Agent Directory</span>
          </Link>

          <div className="aspect-square w-full bg-ink border border-mna-white/10 mb-6 flex items-center justify-center">
            <AgentSignature
              registryId={agent.registryId}
              agentType={agent.agentType}
              constitutionRef={agent.constitutionRef}
              size={260}
              className="text-mna-white w-[80%] h-[80%]"
            />
          </div>

          <div className="inline-flex items-center gap-2 mb-3">
            <span className="inline-block w-[6px] h-[6px] rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.65)]" />
            <span className="text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/85">
              {agent.status}
            </span>
          </div>

          <p className="text-[18px] md:text-[20px] font-sans tabular-nums text-mna-white mb-1.5">
            {agent.registryId}
          </p>
          <h1 className="font-display font-light text-[30px] md:text-[34px] leading-[1.05] mb-1.5">
            {agent.designation}
          </h1>
          <p className="text-[13px] font-sans text-mna-white/65 mb-7">
            Curatorial Agent
          </p>

          {constitution.corePrinciple ? (
            <div className="border-t border-mna-white/15 pt-6 mb-7">
              <p className="text-[10px] font-sans uppercase tracking-[0.24em] text-mna-white/55 mb-3">
                Core Principle
              </p>
              <p className="font-display italic font-light text-[18px] md:text-[19px] leading-[1.35] text-mna-white">
                {`"${constitution.corePrinciple.replace(/^"|"$/g, "")}"`}
              </p>
            </div>
          ) : null}

          <dl className="border-t border-mna-white/15 pt-6 space-y-4 mb-7">
            <DarkField label="Agent Type" value="Curator" />
            <DarkField label="Common Designation" value={agent.designation} />
            <DarkField label="Registry ID" value={agent.registryId} />
            <DarkField label="Constitution Version" value={agent.constitutionRef.match(/v[\d.]+/)?.[0]?.replace("v", "") || "1.0"} />
            <DarkField label="Registration Date" value={registrationDate} />
            <DarkField label="Last Amended" value={lastAmended} />
            <DarkField label="Autonomy Tier" value={agent.autonomyTier} />
          </dl>

          {constitution.hardConstraints.length > 0 ? (
            <div className="border-t border-mna-white/15 pt-6 mb-7">
              <p className="text-[10px] font-sans uppercase tracking-[0.24em] text-mna-white/55 mb-3">
                Hard Constraints
              </p>
              <ul className="space-y-3">
                {constitution.hardConstraints.map((c, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="shrink-0 mt-0.5 inline-flex items-center justify-center w-[14px] h-[14px] rounded-full border border-mna-white/40 text-mna-white/70 text-[8px] leading-none">
                      ×
                    </span>
                    <span className="text-[12px] leading-[1.45] text-mna-white/80">
                      {c}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <Link
            href={`/agent/${agent.registryId}/constitution`}
            className="inline-flex items-center justify-between gap-3 w-full border border-mna-white/25 hover:border-mna-white/60 py-3 px-4 text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white transition-colors mb-4"
          >
            <span>View Full Constitution</span>
            <span aria-hidden>→</span>
          </Link>

          <div className="flex items-center gap-5 text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55">
            <a
              href={`/api/agents/${agent.registryId}/constitution?download=1`}
              className="hover:text-mna-white transition-colors inline-flex items-center gap-1.5"
            >
              <span aria-hidden>{`</>`}</span>
              <span>JSON</span>
            </a>
            <a
              href={`/agents/${agent.registryId}.pdf`}
              className="hover:text-mna-white transition-colors inline-flex items-center gap-1.5"
            >
              <span aria-hidden>↓</span>
              <span>PDF</span>
            </a>
            <CiteButton
              title={`${agent.registryId}: ${agent.designation}`}
              documentId={agent.registryId}
              version="1.0"
              year={(registrationDate.match(/\d{4}/) ?? [""])[0]}
              url={`https://mnamuseum.org/agent/${agent.registryId}/constitution`}
              documentType="Founding Constitution"
              tone="dark"
            />
          </div>
        </div>
      </aside>

      {/* ═══ Main (light) ═══ */}
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
                  {summarizeAutonomy(constitution.autonomyDeclaration, agent.autonomyTier, "curatorial")}
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

/* ─── Atoms ─────────────────────────────────────────────────────────────── */

function DarkField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[9.5px] font-sans uppercase tracking-[0.22em] text-mna-white/45 mb-1">
        {label}
      </dt>
      <dd className="text-[13px] text-mna-white">{value}</dd>
    </div>
  );
}

function Panel({
  label,
  children,
  footerHref,
  footerLabel,
}: {
  label: string;
  children: React.ReactNode;
  footerHref: string;
  footerLabel: string;
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55">
          {label}
        </p>
        <Link
          href={footerHref}
          className="text-[10px] uppercase tracking-[0.22em] font-sans text-ink/55 hover:text-ink transition-colors inline-flex items-center gap-1.5"
        >
          <span>{footerLabel}</span>
          <span aria-hidden>→</span>
        </Link>
      </div>
      <div className="border-t border-ink/15 mb-5" />
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Block({
  label,
  labelExtra,
  right,
  children,
}: {
  label: string;
  labelExtra?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-ink/15 first:border-t-0">
      <div className="px-7 md:px-10 pt-9 pb-5 flex flex-wrap items-baseline gap-x-3 gap-y-2 justify-between">
        <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/65">
          {label}
          {labelExtra ? (
            <span className="ml-2 text-ink/40 normal-case tracking-normal">
              {labelExtra}
            </span>
          ) : null}
        </p>
        {right}
      </div>
      <div className="mx-7 md:mx-10 border-t border-ink/12" />
      <div className="px-7 md:px-10 pt-7 pb-12">{children}</div>
    </section>
  );
}

function FieldBlock({
  label,
  moreHref,
  moreLabel,
  children,
}: {
  label: string;
  moreHref?: string;
  moreLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="text-[12px] font-sans uppercase tracking-[0.18em] text-ink/55">
          {label}
        </p>
        {moreHref ? (
          <Link
            href={moreHref}
            className="text-[10px] uppercase tracking-[0.22em] font-sans text-ink/55 hover:text-ink transition-colors inline-flex items-center gap-1.5 shrink-0"
          >
            <span>{moreLabel ?? "View"}</span>
            <span aria-hidden>→</span>
          </Link>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function ProfileCol({
  label,
  body,
  moreHref,
  moreLabel,
}: {
  label: string;
  body: string | string[];
  moreHref: string;
  moreLabel?: string;
}) {
  return (
    <FieldBlock label={label} moreHref={moreHref} moreLabel={moreLabel ?? "View all"}>
      {Array.isArray(body) ? (
        <ul className="space-y-2">
          {body.map((b, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="shrink-0 mt-2 w-[5px] h-[5px] rounded-full bg-ink/70" />
              <span className="text-[13px] leading-[1.55] text-ink/85">{b}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] leading-[1.6] text-ink/85">{body}</p>
      )}
    </FieldBlock>
  );
}

function Stat({
  value,
  label,
  spark,
  awaiting = false,
}: {
  value: string;
  label: string;
  spark: number[];
  awaiting?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p
        className={`font-display font-light text-[28px] md:text-[30px] leading-none mb-2 tabular-nums ${awaiting ? "text-ink/35" : "text-ink"}`}
      >
        {value}
      </p>
      <p className="text-[10px] font-sans uppercase tracking-[0.18em] text-ink/55 leading-[1.4] mb-2 max-w-[14ch]">
        {label}
      </p>
      {spark.length > 0 ? (
        <Sparkline values={spark} />
      ) : (
        <p className="text-[9px] font-sans uppercase tracking-[0.2em] text-ink/35">
          {awaiting ? "Awaiting first cycle" : ""}
        </p>
      )}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (!values || values.length === 0) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const W = 80;
  const H = 16;
  const step = W / Math.max(values.length - 1, 1);
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = H - ((v - min) / range) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      preserveAspectRatio="none"
      className="block"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        opacity={0.6}
      />
    </svg>
  );
}

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

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block w-[6px] h-[6px] rounded-full ${dot}`} />
      <span>{label}</span>
    </span>
  );
}

/* ─── Relationship map ──────────────────────────────────────────────────── */

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

function formatDateShort(s: string): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatExhibitionDates(opened: string | null, retired: string | null): string {
  if (!opened) return "—";
  const o = formatDateShort(opened);
  if (!retired) return `${o} – Present`;
  return `${o} – ${formatDateShort(retired)}`;
}

function summarizeAutonomy(declaration: string, tier: string, kind: string): string {
  if (declaration) {
    const stripped = declaration
      .replace(/^I,\s*[^,]+,\s*acting as steward of [^,]+,\s*declare that\s*/i, "")
      .replace(/^this agent\s*/i, "This agent ");
    const sentences = stripped.split(/(?<=[.])\s+/);
    return (sentences.slice(0, 2).join(" ") || stripped).trim();
  }
  const noun = kind === "curatorial" ? "exhibition arrangements" : "outputs";
  return tier.includes("Tier 1")
    ? `This agent operates with full autonomy. No human directs, selects, modifies, or approves individual ${noun} prior to publication.`
    : `This agent operates with supervised autonomy. The agent generates all ${noun} independently in accordance with its constitution. The steward reviews ${noun} prior to publication as a steward function only.`;
}
