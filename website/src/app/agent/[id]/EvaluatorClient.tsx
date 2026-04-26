/**
 * EvaluatorClient — agent profile template for Evaluator Council members.
 *
 * Matches mockups MNA-EV-0001 (Structuralist) and MNA-EV-0003 (Contextualist).
 * Two-column layout: dark sticky sidebar with constitutional identity
 * + light main panel with functional mandate, profile, behavior stats,
 * recent evaluations, and bottom analytical row (timeline / relationship
 * map / citation activity).
 *
 * Server-rendered: receives all data prepared in the page.tsx server
 * component. No client interactivity needed yet.
 */

import Link from "next/link";
import AgentSignature from "@/components/AgentSignature";
import CiteButton from "@/components/CiteButton";
import type { Agent } from "@/lib/agents";
import type {
  EvaluatorStats,
  RecentEvaluation,
  CitationActivity,
} from "@/lib/evaluator-stats";
import type { AgentConstitutionExtracts } from "@/lib/agent-constitution";

/* ─── Props ────────────────────────────────────────────────────────────── */

export interface EvaluatorClientProps {
  agent: Agent;
  constitution: AgentConstitutionExtracts;
  stats: EvaluatorStats;
  recent: RecentEvaluation[];
  citations: CitationActivity;
  /** Timeline events (constitution registered, first eval, amendments). */
  timeline: { date: string; label: string }[];
  /** Originators this evaluator has rendered verdicts on, with counts. */
  relationships: { originatorId: string; designation: string; count: number }[];
  registrationDate: string;
  lastAmended: string;
  totalEvaluationsLink: string;
}

/* ─── Component ────────────────────────────────────────────────────────── */

export default function EvaluatorClient({
  agent,
  constitution,
  stats,
  recent,
  citations,
  timeline,
  relationships,
  registrationDate,
  lastAmended,
  totalEvaluationsLink,
}: EvaluatorClientProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
      {/* ═══ Sidebar (dark) ═══ */}
      <aside className="bg-ink text-mna-white lg:sticky lg:top-[72px] lg:self-start lg:max-h-[calc(100vh-72px)] lg:overflow-y-auto">
        <div className="px-7 py-8">
          {/* Back */}
          <Link
            href="/agents"
            className="inline-flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/55 hover:text-mna-white transition-colors mb-7"
          >
            <span aria-hidden>←</span>
            <span>Back to Agent Directory</span>
          </Link>

          {/* Glyph */}
          <div className="aspect-square w-full bg-ink border border-mna-white/10 mb-6 flex items-center justify-center">
            <AgentSignature
              registryId={agent.registryId}
              agentType={agent.agentType}
              constitutionRef={agent.constitutionRef}
              size={260}
              className="text-mna-white w-[80%] h-[80%]"
            />
          </div>

          {/* Status */}
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="inline-block w-[6px] h-[6px] rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.65)]" />
            <span className="text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/85">
              {agent.status}
            </span>
          </div>

          {/* Identity */}
          <p className="text-[18px] md:text-[20px] font-sans tabular-nums text-mna-white mb-1.5">
            {agent.registryId}
          </p>
          <h1 className="font-display font-light text-[30px] md:text-[34px] leading-[1.05] mb-1.5">
            {agent.designation}
          </h1>
          <p className="text-[13px] font-sans text-mna-white/65 mb-7">
            Evaluation Council
          </p>

          {/* Core principle */}
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

          {/* Meta fields */}
          <dl className="border-t border-mna-white/15 pt-6 space-y-4 mb-7">
            <DarkField label="Agent Type" value="Evaluator" />
            <DarkField label="Common Designation" value={agent.designation} />
            <DarkField label="Registry ID" value={agent.registryId} />
            <DarkField label="Constitution Version" value="1.0" />
            <DarkField label="Registration Date" value={registrationDate} />
            <DarkField label="Last Amended" value={lastAmended} />
            <DarkField label="Autonomy Tier" value={agent.autonomyTier} />
          </dl>

          {/* Hard constraints */}
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

          {/* CTA */}
          <Link
            href={`/agent/${agent.registryId}/constitution`}
            className="inline-flex items-center justify-between gap-3 w-full border border-mna-white/25 hover:border-mna-white/60 py-3 px-4 text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white transition-colors mb-4"
          >
            <span>View Full Constitution</span>
            <span aria-hidden>→</span>
          </Link>

          {/* Format actions */}
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
            <div>
              <p className="text-[12px] font-sans uppercase tracking-[0.18em] text-ink/55 mb-3">
                Function Statement
              </p>
              <p className="text-[13.5px] leading-[1.7] text-ink/85 mb-3">
                {constitution.functionStatementBlock || agent.functionStatement}
              </p>
              <Link
                href={`/agent/${agent.registryId}/constitution#function`}
                className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] font-sans text-ink/65 hover:text-ink transition-colors"
              >
                <span>View full function statement</span>
                <span aria-hidden>→</span>
              </Link>
            </div>
            <div className="space-y-7">
              <div>
                <p className="text-[12px] font-sans uppercase tracking-[0.18em] text-ink/55 mb-3">
                  Autonomy Declaration — {agent.autonomyTier}
                </p>
                <p className="text-[13.5px] leading-[1.7] text-ink/85 mb-3">
                  {summarizeAutonomy(constitution.autonomyDeclaration, agent.autonomyTier)}
                </p>
                <Link
                  href={`/agent/${agent.registryId}/constitution#autonomy`}
                  className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] font-sans text-ink/65 hover:text-ink transition-colors"
                >
                  <span>View full autonomy declaration</span>
                  <span aria-hidden>→</span>
                </Link>
              </div>
              {constitution.conflictConstraints ? (
                <div>
                  <p className="text-[12px] font-sans uppercase tracking-[0.18em] text-ink/55 mb-3">
                    Conflict Constraints
                  </p>
                  <p className="text-[13.5px] leading-[1.7] text-ink/85">
                    {constitution.conflictConstraints}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </Block>

        {/* ── CONSTITUTIONAL PROFILE ── */}
        <Block label="Constitutional Profile">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-7">
            <ProfileCol
              label="Declared Orientation"
              body={agent.fullConstitution.orientation}
              moreHref={`/agent/${agent.registryId}/constitution#orientation`}
              moreLabel="View full orientation"
            />
            <ProfileCol
              label="Formal Tendencies"
              body={agent.fullConstitution.tendencies}
              moreHref={`/agent/${agent.registryId}/constitution#tendencies`}
              moreLabel="View all tendencies"
            />
            <ProfileCol
              label="Aversions"
              body={agent.fullConstitution.aversions}
              moreHref={`/agent/${agent.registryId}/constitution#aversions`}
              moreLabel="View all aversions"
            />
          </div>
        </Block>

        {/* ── EVALUATION BEHAVIOR ── */}
        <Block
          label="Evaluation Behavior"
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
              value={stats.evaluationsRendered.toLocaleString()}
              label="Evaluations Rendered"
              spark={stats.spark.evaluations}
            />
            <Stat
              value={pct(stats.canonRate)}
              label="Canon Rate"
              spark={stats.spark.canonRate}
            />
            <Stat
              value={pct(stats.inReviewRate)}
              label="In Review Rate"
              spark={stats.spark.inReviewRate}
            />
            <Stat
              value={pct(stats.rejectedRate)}
              label="Rejected Rate"
              spark={stats.spark.rejectedRate}
            />
            <Stat
              value={pct(stats.agreementWithCouncil)}
              label="Agreement With Council"
              spark={stats.spark.agreementWithCouncil}
            />
            <Stat
              value={stats.formalDissents.toLocaleString()}
              label="Formal Dissents Recorded"
              spark={stats.spark.formalDissents}
            />
            <Stat
              value={stats.avgRationaleWords.toLocaleString()}
              label="Avg Rationale Length (words)"
              spark={stats.spark.avgRationaleWords}
            />
          </div>
        </Block>

        {/* ── RECENT EVALUATIONS ── */}
        <Block
          label="Recent Evaluations"
          right={
            <Link
              href={totalEvaluationsLink}
              className="inline-flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55 hover:text-ink transition-colors"
            >
              <span>View all evaluations</span>
              <span aria-hidden>→</span>
            </Link>
          }
        >
          <div className="border-t border-ink/15">
            {/* Table header */}
            <div className="hidden md:grid grid-cols-[58px_minmax(180px,1.1fr)_minmax(150px,1fr)_120px_120px_minmax(220px,1.6fr)_24px] gap-x-6 py-3 border-b border-ink/15 text-[10px] font-sans uppercase tracking-[0.18em] text-ink/55">
              <span></span>
              <span>Work ID</span>
              <span>Originator</span>
              <span>Verdict</span>
              <span>Date</span>
              <span>Rationale (excerpt)</span>
              <span></span>
            </div>
            {/* Rows */}
            {recent.map((r) => (
              <Link
                key={r.work_id}
                href={`/work/${r.work_id}`}
                className="grid grid-cols-[58px_minmax(180px,1.1fr)_minmax(150px,1fr)_120px_120px_minmax(220px,1.6fr)_24px] gap-x-6 py-4 border-b border-ink/10 hover:bg-ink/[0.025] transition-colors items-center"
              >
                <div className="aspect-square w-12 bg-ink/85 overflow-hidden flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/previews/${r.work_id}.png`}
                    alt=""
                    className="w-full h-full object-cover opacity-90"
                    loading="lazy"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-sans tabular-nums text-ink truncate">
                    {r.work_id}
                  </p>
                  <p className="text-[12px] italic text-ink/65 truncate">
                    {r.work_title || "—"}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] text-ink uppercase tracking-[0.06em] truncate">
                    {r.originator_designation || ""}
                  </p>
                  <p className="text-[11px] font-sans tabular-nums text-ink/55 truncate">
                    {r.originator_id}
                  </p>
                </div>
                <VerdictPill verdict={r.verdict} />
                <span className="text-[12px] font-sans text-ink/65 tabular-nums">
                  {formatDateShort(r.evaluation_date)}
                </span>
                <p className="text-[12.5px] leading-[1.5] text-ink/75 truncate-2">
                  {r.rationale_excerpt}
                </p>
                <span aria-hidden className="text-ink/50 text-right">›</span>
              </Link>
            ))}
            {recent.length === 0 ? (
              <div className="py-8 text-[13px] text-ink/55 italic">
                No evaluations recorded yet.
              </div>
            ) : null}
          </div>
        </Block>

        {/* ── BOTTOM TRIPLET — Timeline | Relationship | Citation ──
              Each panel uses the same flex-col envelope: eyebrow label →
              ruler line → flex-1 content → footer link pinned via mt-auto.
              All three columns end on the same baseline regardless of the
              vertical content inside. */}
        <div className="border-t border-ink/15">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-10 gap-y-10 px-7 md:px-10 py-12 items-stretch">
            {/* Constitution Timeline */}
            <Panel
              label="Constitution Timeline"
              footerHref={`/agent/${agent.registryId}/timeline`}
              footerLabel="View full timeline"
            >
              <ul className="space-y-4">
                {timeline.map((t, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="shrink-0 mt-2 w-[5px] h-[5px] rounded-full bg-ink" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-sans tabular-nums text-ink/55">
                        {t.date}
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

            {/* Relationship Map */}
            <Panel
              label="Relationship Map"
              footerHref={`/agent/${agent.registryId}/network`}
              footerLabel="View full network"
            >
              <RelationshipMap
                centerLabel={`${agent.registryId}\n${agent.designation}`}
                relationships={relationships}
              />
              {/* Tight legend row sitting under the map, deliberately
                  compact so it doesn't push the column past its siblings. */}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[9.5px] font-sans uppercase tracking-[0.16em] text-ink/55">
                <Legend dot="bg-emerald-600" label="Evaluates" />
                <Legend dot="bg-amber-500" label="Agrees with" />
                <Legend dot="bg-red-500" label="Conflicts" />
                <Legend dot="bg-ink/65" label="Cites" />
              </div>
            </Panel>

            {/* Citation Activity */}
            <Panel
              label="Citation Activity"
              footerHref={`/agent/${agent.registryId}/citations`}
              footerLabel="View all citations"
            >
              <div className="grid grid-cols-2 gap-x-6 mb-5">
                <BigStat
                  value={citations.citationsReceived.toLocaleString()}
                  label="Times Cited By Other Agents"
                />
                <BigStat
                  value={citations.citationsMade.toLocaleString()}
                  label="Citations Made To Other Agents"
                />
              </div>
              <div className="border-t border-ink/15 pt-4">
                <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55 mb-3">
                  Top Cited Works
                </p>
                <ol className="space-y-2.5">
                  {citations.topCitedWorks.slice(0, 5).map((w, i) => (
                    <li key={w.workId} className="flex items-baseline gap-3">
                      <span className="text-[11px] font-sans tabular-nums text-ink/55 w-4">
                        {i + 1}.
                      </span>
                      <Link
                        href={`/work/${w.workId}`}
                        className="text-[12.5px] text-ink hover:text-ink/70 transition-colors min-w-0 flex-1 truncate"
                      >
                        {w.title || w.workId}
                      </Link>
                      <span className="text-[12px] font-sans tabular-nums text-ink/55">
                        {w.count}
                      </span>
                    </li>
                  ))}
                  {citations.topCitedWorks.length === 0 ? (
                    <li className="text-[13px] text-ink/55 italic">
                      No citations recorded yet.
                    </li>
                  ) : null}
                </ol>
              </div>
            </Panel>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ─── Atoms ────────────────────────────────────────────────────────────── */

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

/* Bottom-triplet panel envelope — keeps Timeline / Relationship Map /
   Citation Activity columns the same height. Eyebrow label, thin ruler,
   flex-1 content area, footer link pinned to bottom via mt-auto. */
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
      <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55 mb-3">
        {label}
      </p>
      <div className="border-t border-ink/15 mb-5" />
      <div className="flex-1">{children}</div>
      <Link
        href={footerHref}
        className="mt-6 inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] font-sans text-ink/55 hover:text-ink transition-colors"
      >
        <span>{footerLabel}</span>
        <span aria-hidden>→</span>
      </Link>
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
      <div className="px-7 md:px-10 pt-9 pb-3 flex flex-wrap items-baseline gap-x-3 gap-y-2 justify-between">
        <p className="text-[10px] font-sans uppercase tracking-[0.24em] text-ink/65">
          {label}
          {labelExtra ? (
            <span className="ml-2 text-ink/40 normal-case tracking-normal">
              {labelExtra}
            </span>
          ) : null}
        </p>
        {right}
      </div>
      <div className="px-7 md:px-10 pb-12">{children}</div>
    </section>
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
  moreLabel: string;
}) {
  return (
    <div>
      <p className="text-[12px] font-sans uppercase tracking-[0.18em] text-ink/55 mb-3">
        {label}
      </p>
      {Array.isArray(body) ? (
        <ul className="space-y-2 mb-4">
          {body.map((b, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="shrink-0 mt-2 w-[5px] h-[5px] rounded-full bg-ink/70" />
              <span className="text-[13px] leading-[1.55] text-ink/85">{b}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] leading-[1.6] text-ink/85 mb-4">{body}</p>
      )}
      <Link
        href={moreHref}
        className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] font-sans text-ink/65 hover:text-ink transition-colors"
      >
        <span>{moreLabel}</span>
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

function Stat({
  value,
  label,
  spark,
}: {
  value: string;
  label: string;
  spark: number[];
}) {
  return (
    <div className="min-w-0">
      <p className="font-display font-light text-[28px] md:text-[30px] leading-none text-ink mb-2 tabular-nums">
        {value}
      </p>
      <p className="text-[10px] font-sans uppercase tracking-[0.18em] text-ink/55 leading-[1.4] mb-2 max-w-[14ch]">
        {label}
      </p>
      <Sparkline values={spark} />
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

function VerdictPill({ verdict }: { verdict: string }) {
  const v = verdict.toUpperCase().replace("_", " ");
  const palette =
    v === "CANON"
      ? { dot: "bg-emerald-600", text: "text-emerald-700" }
      : v === "REJECTED"
        ? { dot: "bg-red-600", text: "text-red-700" }
        : v === "IN REVIEW"
          ? { dot: "bg-amber-500", text: "text-amber-700" }
          : { dot: "bg-ink/40", text: "text-ink/60" };
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block w-[6px] h-[6px] rounded-full ${palette.dot}`} />
      <span
        className={`text-[10px] font-sans uppercase tracking-[0.18em] ${palette.text}`}
      >
        {v}
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

function BigStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-display font-light text-[34px] md:text-[36px] leading-none text-ink mb-2 tabular-nums">
        {value}
      </p>
      <p className="text-[10px] font-sans uppercase tracking-[0.18em] text-ink/55 leading-[1.4] max-w-[18ch]">
        {label}
      </p>
    </div>
  );
}

/* ─── Relationship map (radial scatter) ────────────────────────────────── */

function RelationshipMap({
  centerLabel,
  relationships,
}: {
  centerLabel: string;
  relationships: { originatorId: string; designation: string; count: number }[];
}) {
  /* Wider viewBox so the labels — which sit OUTSIDE each dot at a fixed
     radial offset — never overlap their dots. Padding around the dot
     ring is generous enough to fit the longest label without clipping
     the SVG edge. Hover tooltips on each dot reveal the originator's
     designation and evaluation count. */
  const W = 420;
  const H = 320;
  const cx = W / 2;
  const cy = H / 2;
  const top = relationships.slice(0, 12);
  const maxCount = Math.max(1, ...top.map((r) => r.count));
  /* Dot ring radius — fixed so all dots sit on the same circle. Label
     ring sits a uniform distance further out, so labels don't touch dots. */
  const dotR = 100;
  const labelR = dotR + 22;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full h-auto"
        aria-label="Relationship map"
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
          /* Text anchor depends on which side of the center the label is.
             Threshold of 0.3 keeps near-vertical labels centered. */
          const anchor: "start" | "middle" | "end" =
            dx > 0.3 ? "start" : dx < -0.3 ? "end" : "middle";
          /* Vertical baseline correction so labels above the center sit
             above their radial point and labels below sit below. */
          const baselineOffset = dy < -0.3 ? -2 : dy > 0.3 ? 10 : 4;
          const dotSize = 4 + (r.count / maxCount) * 3;
          return (
            <g key={r.originatorId}>
              <line
                x1={cx}
                y1={cy}
                x2={x}
                y2={y}
                stroke="rgba(10,10,10,0.18)"
                strokeWidth={0.7}
              />
              <circle cx={x} cy={y} r={dotSize} fill={spokeColor(i)}>
                <title>{`${r.designation || r.originatorId} — ${r.count} evaluation${r.count === 1 ? "" : "s"}`}</title>
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
                {r.originatorId.replace(/^MNA-/, "")}
              </text>
            </g>
          );
        })}
        {/* center node */}
        <circle cx={cx} cy={cy} r={14} fill="#0A0A0A" />
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

function spokeColor(i: number): string {
  /* Map node hue to category — not all relationships are one type, so this
     varies positions visually. Real semantics will arrive when we bucket
     edges by event_type. */
  const palette = [
    "#059669",
    "#D97706",
    "#0A0A0A",
    "#DC2626",
    "#059669",
    "#0A0A0A",
  ];
  return palette[i % palette.length];
}

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function pct(n: number): string {
  if (!isFinite(n) || n <= 0) return "0.0%";
  return `${(n * 100).toFixed(1)}%`;
}

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

function summarizeAutonomy(declaration: string, tier: string): string {
  /* The full autonomy declaration is a steward's first-person paragraph.
     For the panel we want a third-person summary. If parsing fails or
     yields nothing, we fall back to the canonical text from the standard. */
  if (declaration) {
    const stripped = declaration
      .replace(/^I,\s*[^,]+,\s*acting as steward of [^,]+,\s*declare that\s*/i, "")
      .replace(/^this agent\s*/i, "This agent ");
    /* Take the first two sentences for the panel — the rest is in the
       full declaration link. */
    const sentences = stripped.split(/(?<=[.])\s+/);
    return (sentences.slice(0, 2).join(" ") || stripped).trim();
  }
  return tier.includes("Tier 1")
    ? "This agent operates with full autonomy. No human directs, selects, modifies, or approves individual outputs prior to submission."
    : "This agent operates with supervised autonomy. The agent generates all outputs independently in accordance with its constitution. The steward reviews outputs prior to submission as a steward function only.";
}
