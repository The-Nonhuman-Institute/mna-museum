/**
 * ConservatorClient — operative-agent profile for the Conservator (CV-0001).
 *
 * The Conservator validates rendered integrity. Its render_status table
 * is empty until the validation pipeline runs, so most stats start as
 * zeros — they're real zeros, not placeholders.
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
  RingMap,
  formatDateShort,
  summarizeAutonomy,
} from "@/components/agent-template";
import type { Agent } from "@/lib/agents";
import type {
  ConservatorStats,
  RecentValidation,
  ConservatorRelationship,
} from "@/lib/conservator-stats";
import type { AgentConstitutionExtracts } from "@/lib/agent-constitution";

export interface ConservatorClientProps {
  agent: Agent;
  constitution: AgentConstitutionExtracts;
  stats: ConservatorStats;
  recent: RecentValidation[];
  relationships: ConservatorRelationship[];
  timeline: { date: string; label: string }[];
  registrationDate: string;
  lastAmended: string;
  totalValidationsLink: string;
}

export default function ConservatorClient({
  agent,
  constitution,
  stats,
  recent,
  relationships,
  timeline,
  registrationDate,
  lastAmended,
  totalValidationsLink,
}: ConservatorClientProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
      <AgentSidebar
        agent={agent}
        constitution={constitution}
        roleLabel="Render Integrity Agent"
        agentTypeLabel="Conservator"
        registrationDate={registrationDate}
        lastAmended={lastAmended}
      />

      <section className="bg-warm-paper text-ink min-w-0">
        <Block label="Functional Mandate">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-7">
            <FieldBlock label="Function Statement" moreHref={`/agent/${agent.registryId}/constitution#function`} moreLabel="View full">
              <p className="text-[13.5px] leading-[1.7] text-ink/85">
                {constitution.functionStatementBlock || agent.functionStatement}
              </p>
            </FieldBlock>
            <div className="space-y-7">
              <FieldBlock label={`Autonomy Declaration — ${agent.autonomyTier}`} moreHref={`/agent/${agent.registryId}/constitution#autonomy`} moreLabel="View full">
                <p className="text-[13.5px] leading-[1.7] text-ink/85">
                  {summarizeAutonomy(constitution.autonomyDeclaration, agent.autonomyTier, "validations")}
                </p>
              </FieldBlock>
              {constitution.conflictConstraints ? (
                <FieldBlock label="Conflict Constraints">
                  <p className="text-[13.5px] leading-[1.7] text-ink/85">{constitution.conflictConstraints}</p>
                </FieldBlock>
              ) : null}
            </div>
          </div>
        </Block>

        <Block label="Conservation Profile">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-7">
            <ProfileCol label="Declared Orientation" body={agent.fullConstitution.orientation} moreHref={`/agent/${agent.registryId}/constitution#orientation`} moreLabel="View full orientation" />
            <ProfileCol label="Validation Tendencies" body={agent.fullConstitution.tendencies} moreHref={`/agent/${agent.registryId}/constitution#tendencies`} moreLabel="View all tendencies" />
            <ProfileCol label="Aversions" body={agent.fullConstitution.aversions} moreHref={`/agent/${agent.registryId}/constitution#aversions`} moreLabel="View all aversions" />
          </div>
        </Block>

        <Block
          label="Conservation Activity"
          labelExtra="(since first operation)"
          right={
            <Link href={`/agent/${agent.registryId}/analytics`} className="inline-flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55 hover:text-ink transition-colors">
              <span>View analytics dashboard</span>
              <span aria-hidden>→</span>
            </Link>
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-y-8 gap-x-6">
            <Stat value={stats.worksUnderWatch.toLocaleString()} label="Works Under Watch" spark={[]} />
            <Stat value={stats.validationsRun.toLocaleString()} label="Validations Run" spark={stats.spark.validations} />
            <Stat value={stats.recoveriesApplied.toLocaleString()} label="Safe Recoveries Applied" spark={stats.spark.recoveries} />
            <Stat value={stats.flagsRaised.toLocaleString()} label="Flags Raised" spark={stats.spark.flags} />
            <Stat
              value={stats.averageUptime != null ? `${(stats.averageUptime * 100).toFixed(1)}%` : "—"}
              label="Average Uptime"
              spark={stats.spark.uptime}
              awaiting={stats.averageUptime == null}
            />
            <Stat value={stats.daysSinceLastIncident.toLocaleString()} label="Days Since Last Incident" spark={[]} />
            <Stat
              value={stats.contextCoverage != null ? `${(stats.contextCoverage * 100).toFixed(0)}%` : "—"}
              label="Context Coverage"
              spark={stats.spark.coverage}
              awaiting={stats.contextCoverage == null}
            />
          </div>
        </Block>

        <Block
          label="Recent Validations"
          right={
            <Link href={totalValidationsLink} className="inline-flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55 hover:text-ink transition-colors">
              <span>View all validations</span>
              <span aria-hidden>→</span>
            </Link>
          }
        >
          {recent.length === 0 ? (
            <div className="py-10 text-[13px] text-ink/55 italic leading-[1.6]">
              No validations recorded yet. The validation pipeline will populate this stream once the Conservator&rsquo;s first cycle runs.
            </div>
          ) : (
            <div>
              <div className="hidden md:grid grid-cols-[180px_minmax(180px,1fr)_140px_140px_minmax(220px,1.6fr)_24px] gap-x-6 py-3 border-b border-ink/15 text-[10px] font-sans uppercase tracking-[0.18em] text-ink/55">
                <span>Status</span>
                <span>Work ID</span>
                <span>Output Type</span>
                <span>Last Checked</span>
                <span>Detail</span>
                <span></span>
              </div>
              {recent.map((r) => (
                <Link
                  key={r.workId}
                  href={`/work/${r.workId}`}
                  className="grid grid-cols-[180px_minmax(180px,1fr)_140px_140px_minmax(220px,1.6fr)_24px] gap-x-6 py-4 border-b border-ink/10 hover:bg-ink/[0.025] transition-colors items-center"
                >
                  <ValidationStatusPill status={r.status} hasError={Boolean(r.errorMessage)} recovered={r.recoveryApplied === 1} />
                  <p className="text-[12px] font-sans tabular-nums text-ink truncate">{r.workId}</p>
                  <p className="text-[12px] text-ink/75 truncate">{r.outputType}</p>
                  <span className="text-[12px] font-sans text-ink/65 tabular-nums">{formatDateShort(r.last_checked)}</span>
                  <p className="text-[12.5px] leading-[1.5] text-ink/75 truncate-2">{r.errorMessage || "Render verified."}</p>
                  <span aria-hidden className="text-ink/50 text-right">›</span>
                </Link>
              ))}
            </div>
          )}
        </Block>

        <div className="border-t border-ink/15">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-10 gap-y-10 px-7 md:px-10 py-12 items-stretch">
            <Panel label="Conservation Timeline" footerHref={`/agent/${agent.registryId}/timeline`} footerLabel="View full timeline">
              <ul className="space-y-4">
                {timeline.map((t, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="shrink-0 mt-2 w-[5px] h-[5px] rounded-full bg-ink" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-sans tabular-nums text-ink/55">{formatDateShort(t.date)}</p>
                      <p className="text-[13px] text-ink leading-[1.45]">{t.label}</p>
                    </div>
                  </li>
                ))}
                {timeline.length === 0 ? <li className="text-[13px] text-ink/55 italic">No events recorded.</li> : null}
              </ul>
            </Panel>

            <Panel label="Watchlist Coverage" footerHref={`/agent/${agent.registryId}/network`} footerLabel="View full network">
              <RingMap
                centerLabel={`${agent.registryId}\n${agent.designation}`}
                nodes={relationships.map((r) => ({ id: r.agentId, label: r.agentId.replace(/^MNA-/, ""), count: r.count, designation: r.designation }))}
                colorFn={(_n, i) => spokeColor(i)}
                tooltipFn={(n) => `${(n as { designation: string }).designation || n.id} — ${n.count} validation${n.count === 1 ? "" : "s"}`}
                emptyText="No works validated yet."
              />
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[9.5px] font-sans uppercase tracking-[0.16em] text-ink/55">
                <Legend dot="bg-emerald-600" label="Stable" />
                <Legend dot="bg-amber-500" label="Recovered" />
                <Legend dot="bg-red-600" label="Flagged" />
              </div>
            </Panel>

            <Panel label="Output Type Coverage" footerHref={`/agent/${agent.registryId}/coverage`} footerLabel="View coverage report">
              <p className="text-[13px] text-ink/55 italic leading-[1.6]">
                Coverage breakdown by output type (svg, html-css, canvas-json, scene-json, audio-json) will populate as validation cycles record entries in render_status.
              </p>
            </Panel>
          </div>
        </div>
      </section>
    </div>
  );
}

function ValidationStatusPill({ status, hasError, recovered }: { status: string; hasError: boolean; recovered: boolean }) {
  const palette =
    hasError && !recovered
      ? { dot: "bg-red-600", text: "text-red-700", label: "FLAGGED" }
      : recovered
        ? { dot: "bg-amber-500", text: "text-amber-700", label: "RECOVERED" }
        : { dot: "bg-emerald-600", text: "text-emerald-700", label: status.toUpperCase() || "VERIFIED" };
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block w-[6px] h-[6px] rounded-full ${palette.dot}`} />
      <span className={`text-[10px] font-sans uppercase tracking-[0.18em] ${palette.text}`}>{palette.label}</span>
    </span>
  );
}

function spokeColor(i: number): string {
  const palette = ["#059669", "#D97706", "#DC2626"];
  return palette[i % palette.length];
}
