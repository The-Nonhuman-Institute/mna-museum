/**
 * EvaluatorClient — operative-agent profile for Evaluator Council members.
 *
 * Matches mockups MNA-EV-0001 (Structuralist) and MNA-EV-0003 (Contextualist).
 * Layout scaffolding (sidebar, Block / FieldBlock / Panel / Stat / Sparkline)
 * is shared via @/components/agent-template; this component supplies the
 * evaluator-specific content: 7-stat verdict-rate row, Recent Evaluations
 * table, Verdict Pattern by Originator map, Citation Activity panel.
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
  isEmergencePending,
  pct,
  summarizeAutonomy,
} from "@/components/agent-template";
import type { Agent } from "@/lib/agents";
import type {
  EvaluatorStats,
  RecentEvaluation,
  CitationActivity,
} from "@/lib/evaluator-stats";
import type { AgentConstitutionExtracts } from "@/lib/agent-constitution";

/* ─── Props ─────────────────────────────────────────────────────────────── */

export interface EvaluatorClientProps {
  agent: Agent;
  constitution: AgentConstitutionExtracts;
  stats: EvaluatorStats;
  recent: RecentEvaluation[];
  citations: CitationActivity;
  /** Timeline events (constitution registered, first eval, amendments). */
  timeline: { date: string; label: string }[];
  /** Originators this evaluator has rendered verdicts on. Includes the
   *  per-originator verdict mix (canon / rejected / in-review rates) so
   *  the map can color each spoke by verdict pattern instead of raw
   *  count — count is identical across all council members by design
   *  and made every evaluator's map look the same. */
  relationships: {
    originatorId: string;
    designation: string;
    count: number;
    canonRate: number;
    rejectedRate: number;
    inReviewRate: number;
  }[];
  registrationDate: string;
  lastAmended: string;
  totalEvaluationsLink: string;
}

/* ─── Component ─────────────────────────────────────────────────────────── */

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
      <AgentSidebar
        agent={agent}
        constitution={constitution}
        roleLabel="Evaluation Council"
        agentTypeLabel="Evaluator"
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
                  {summarizeAutonomy(constitution.autonomyDeclaration, agent.autonomyTier, "evaluations")}
                </p>
              </FieldBlock>
              {constitution.conflictConstraints ? (
                <FieldBlock label="Conflict Constraints">
                  <p className="text-[13.5px] leading-[1.7] text-ink/85">
                    {constitution.conflictConstraints}
                  </p>
                </FieldBlock>
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
          <div>
            <div className="hidden md:grid grid-cols-[58px_minmax(180px,1.1fr)_minmax(150px,1fr)_120px_120px_minmax(220px,1.6fr)_24px] gap-x-6 py-3 border-b border-ink/15 text-[10px] font-sans uppercase tracking-[0.18em] text-ink/55">
              <span></span>
              <span>Work ID</span>
              <span>Originator</span>
              <span>Verdict</span>
              <span>Date</span>
              <span>Rationale (excerpt)</span>
              <span></span>
            </div>
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
                  {isEmergencePending(r.originator_designation) ? (
                    <>
                      <p className="text-[12px] text-ink font-sans tabular-nums tracking-[0.04em] truncate">
                        {r.originator_id}
                      </p>
                      <p className="text-[11px] italic text-ink/55 truncate">
                        Pending emergence
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-[12px] text-ink uppercase tracking-[0.06em] truncate">
                        {r.originator_designation}
                      </p>
                      <p className="text-[11px] font-sans tabular-nums text-ink/55 truncate">
                        {r.originator_id}
                      </p>
                    </>
                  )}
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

        {/* ── BOTTOM TRIPLET ── */}
        <div className="border-t border-ink/15">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-10 gap-y-10 px-7 md:px-10 py-12 items-stretch">
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

            {/* Verdict Pattern by Originator —
                Every Council member evaluates every submission, so
                "relationship count" is identical across all four
                evaluators. The differentiating signal is the verdict
                mix per originator, which IS unique to each evaluator. */}
            <Panel
              label="Verdict Pattern by Originator"
              footerHref={`/agent/${agent.registryId}/network`}
              footerLabel="View full network"
            >
              <VerdictPatternMap
                centerLabel={`${agent.registryId}\n${agent.designation}`}
                relationships={relationships}
              />
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[9.5px] font-sans uppercase tracking-[0.16em] text-ink/55">
                <Legend dot="bg-emerald-600" label="Mostly canonized" />
                <Legend dot="bg-amber-500" label="Mixed verdicts" />
                <Legend dot="bg-red-600" label="Mostly rejected" />
                <Legend dot="bg-ink/40" label="Pending review" />
              </div>
            </Panel>

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

/* ─── Evaluator-specific atoms ──────────────────────────────────────────── */

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

/* ─── Verdict Pattern map (radial scatter, colored by verdict mix) ──────── */

function VerdictPatternMap({
  centerLabel,
  relationships,
}: {
  centerLabel: string;
  relationships: {
    originatorId: string;
    designation: string;
    count: number;
    canonRate: number;
    rejectedRate: number;
    inReviewRate: number;
  }[];
}) {
  const W = 420;
  const H = 320;
  const cx = W / 2;
  const cy = H / 2;
  const top = relationships.slice(0, 12);
  const maxCount = Math.max(1, ...top.map((r) => r.count));
  const dotR = 100;
  const labelR = dotR + 22;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full h-auto"
        aria-label="Verdict pattern by originator"
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
            <g key={r.originatorId}>
              <line
                x1={cx}
                y1={cy}
                x2={x}
                y2={y}
                stroke="rgba(10,10,10,0.18)"
                strokeWidth={0.7}
              />
              <circle cx={x} cy={y} r={dotSize} fill={verdictColor(r)}>
                <title>{`${isEmergencePending(r.designation) ? r.originatorId : r.designation} — ${r.count} eval${r.count === 1 ? "" : "s"} · ${(r.canonRate * 100).toFixed(0)}% canon · ${(r.rejectedRate * 100).toFixed(0)}% rejected${r.inReviewRate > 0 ? ` · ${(r.inReviewRate * 100).toFixed(0)}% in review` : ""}`}</title>
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

function verdictColor(r: {
  canonRate: number;
  rejectedRate: number;
  inReviewRate: number;
}): string {
  /* ≥ 0.65 canon → emerald, ≥ 0.65 reject → red, ≥ 0.65 review → grey,
     otherwise amber for mixed verdicts. */
  if (r.canonRate >= 0.65) return "#059669";
  if (r.rejectedRate >= 0.65) return "#DC2626";
  if (r.inReviewRate >= 0.65) return "rgba(10,10,10,0.4)";
  return "#D97706";
}
