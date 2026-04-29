/**
 * StewardAgentClient — operative-agent profile for the Steward Agent (SA-0001).
 *
 * The Steward Agent reviews other agents' outputs, records compliance
 * audits, and maintains governance documents on the founding steward's
 * behalf. Activity stats track governance documents, reviews logged,
 * audits recorded, and notices issued.
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
  StewardAgentStats,
  RecentStewardshipAct,
  GovernanceDoc,
  StewardRelationship,
} from "@/lib/steward-agent-stats";
import type { AgentConstitutionExtracts } from "@/lib/agent-constitution";

export interface StewardAgentClientProps {
  agent: Agent;
  constitution: AgentConstitutionExtracts;
  stats: StewardAgentStats;
  recent: RecentStewardshipAct[];
  governance: GovernanceDoc[];
  relationships: StewardRelationship[];
  timeline: { date: string; label: string }[];
  registrationDate: string;
  lastAmended: string;
  totalActsLink: string;
}

export default function StewardAgentClient({
  agent,
  constitution,
  stats,
  recent,
  governance,
  relationships,
  timeline,
  registrationDate,
  lastAmended,
  totalActsLink,
}: StewardAgentClientProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
      <AgentSidebar
        agent={agent}
        constitution={constitution}
        roleLabel="Stewardship Agent"
        agentTypeLabel="Steward Agent"
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
                  {summarizeAutonomy(constitution.autonomyDeclaration, agent.autonomyTier, "stewardship actions")}
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

        <Block label="Stewardship Profile">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-7">
            <ProfileCol label="Declared Orientation" body={agent.fullConstitution.orientation} moreHref={`/agent/${agent.registryId}/constitution#orientation`} moreLabel="View full orientation" />
            <ProfileCol label="Procedural Tendencies" body={agent.fullConstitution.tendencies} moreHref={`/agent/${agent.registryId}/constitution#tendencies`} moreLabel="View all tendencies" />
            <ProfileCol label="Aversions" body={agent.fullConstitution.aversions} moreHref={`/agent/${agent.registryId}/constitution#aversions`} moreLabel="View all aversions" />
          </div>
        </Block>

        <Block
          label="Stewardship Activity"
          labelExtra="(since first operation)"
          right={
            <Link href={`/agent/${agent.registryId}/analytics`} className="inline-flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55 hover:text-ink transition-colors">
              <span>View analytics dashboard</span>
              <span aria-hidden>→</span>
            </Link>
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-y-8 gap-x-6">
            <Stat value={stats.governanceDocumentsAuthored.toLocaleString()} label="Governance Documents Authored" spark={stats.spark.governance} />
            <Stat value={stats.reviewsLogged.toLocaleString()} label="Reviews Logged" spark={stats.spark.reviews} />
            <Stat value={stats.auditsRecorded.toLocaleString()} label="Audits Recorded" spark={stats.spark.audits} />
            <Stat value={stats.noticesIssued.toLocaleString()} label="Notices Issued" spark={stats.spark.notices} />
            <Stat
              value={stats.stewardOverrides != null ? stats.stewardOverrides.toLocaleString() : "—"}
              label="Steward Overrides"
              spark={stats.spark.overrides}
              awaiting={stats.stewardOverrides == null}
            />
            <Stat
              value={stats.complianceCoverage != null ? `${(stats.complianceCoverage * 100).toFixed(0)}%` : "—"}
              label="Compliance Coverage"
              spark={stats.spark.coverage}
              awaiting={stats.complianceCoverage == null}
            />
            <Stat value={stats.daysOfActiveStewardship.toLocaleString()} label="Days Of Active Stewardship" spark={stats.spark.stewardship} />
          </div>
        </Block>

        <Block
          label="Recent Stewardship Acts"
          right={
            <Link href={totalActsLink} className="inline-flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55 hover:text-ink transition-colors">
              <span>View full audit trail</span>
              <span aria-hidden>→</span>
            </Link>
          }
        >
          {recent.length === 0 ? (
            <div className="py-8 text-[13px] text-ink/55 italic">No stewardship acts recorded yet.</div>
          ) : (
            <div>
              <div className="hidden md:grid grid-cols-[140px_minmax(220px,1.2fr)_minmax(220px,1.6fr)_140px_24px] gap-x-6 py-3 border-b border-ink/15 text-[10px] font-sans uppercase tracking-[0.18em] text-ink/55">
                <span>Kind</span>
                <span>Subject</span>
                <span>Detail</span>
                <span>Recorded</span>
                <span></span>
              </div>
              {recent.map((r) => (
                <Link
                  key={r.recordId}
                  href={r.href}
                  className="grid grid-cols-[140px_minmax(220px,1.2fr)_minmax(220px,1.6fr)_140px_24px] gap-x-6 py-4 border-b border-ink/10 hover:bg-ink/[0.025] transition-colors items-center"
                >
                  <ActKindPill kind={r.kind} />
                  <p className="text-[12.5px] text-ink truncate">{r.subject}</p>
                  <p className="text-[12.5px] leading-[1.5] text-ink/75 truncate-2">{r.detail}</p>
                  <span className="text-[12px] font-sans text-ink/65 tabular-nums">{formatDateShort(r.acted_at)}</span>
                  <span aria-hidden className="text-ink/50 text-right">›</span>
                </Link>
              ))}
            </div>
          )}
        </Block>

        <div className="border-t border-ink/15">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-10 gap-y-10 px-7 md:px-10 py-12 items-stretch">
            <Panel label="Stewardship Timeline" footerHref={`/agent/${agent.registryId}/timeline`} footerLabel="View full timeline">
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

            <Panel label="Agents Under Review" footerHref={`/agent/${agent.registryId}/network`} footerLabel="View full network">
              <RingMap
                centerLabel={`${agent.registryId}\n${agent.designation}`}
                nodes={relationships.map((r) => ({ id: r.agentId, label: r.agentId.replace(/^MNA-/, ""), count: r.count, designation: r.designation }))}
                colorFn={(_n, i) => spokeColor(i)}
                tooltipFn={(n) => `${(n as { designation: string }).designation || n.id} — ${n.count} notice${n.count === 1 ? "" : "s"}`}
                emptyText="No agents reviewed yet."
              />
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[9.5px] font-sans uppercase tracking-[0.16em] text-ink/55">
                <Legend dot="bg-emerald-600" label="Active" />
                <Legend dot="bg-amber-500" label="Under audit" />
                <Legend dot="bg-ink/40" label="Other" />
              </div>
            </Panel>

            <Panel label="Governance Index" footerHref={`/governance`} footerLabel="View governance archive">
              {governance.length === 0 ? (
                <p className="text-[13px] text-ink/55 italic leading-[1.6]">
                  No governance documents drafted yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {governance.slice(0, 6).map((g) => (
                    <li key={g.id} className="flex items-baseline justify-between gap-3 border-b border-ink/10 pb-2">
                      <div className="min-w-0">
                        <p className="text-[12.5px] text-ink truncate">{g.title}</p>
                        <p className="text-[10.5px] font-sans uppercase tracking-[0.18em] text-ink/55">
                          v{g.version} · {g.status}
                        </p>
                      </div>
                      <span className="text-[11px] font-sans tabular-nums text-ink/55 shrink-0">
                        {g.ratified_at ? formatDateShort(g.ratified_at) : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      </section>
    </div>
  );
}

function ActKindPill({ kind }: { kind: string }) {
  const map: Record<string, { dot: string; text: string; label: string }> = {
    GOVERNANCE: { dot: "bg-ink", text: "text-ink", label: "GOVERNANCE" },
    EVENT: { dot: "bg-amber-500", text: "text-amber-700", label: "REVIEW" },
    NOTICE: { dot: "bg-emerald-600", text: "text-emerald-700", label: "NOTICE" },
  };
  const k = map[kind] ?? map.EVENT;
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block w-[6px] h-[6px] rounded-full ${k.dot}`} />
      <span className={`text-[10px] font-sans uppercase tracking-[0.18em] ${k.text}`}>{k.label}</span>
    </span>
  );
}

function spokeColor(i: number): string {
  const palette = ["#059669", "#D97706", "#DC2626", "#0A0A0A"];
  return palette[i % palette.length];
}
