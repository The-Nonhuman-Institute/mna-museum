/**
 * InstallerClient — operative-agent profile for the Installer (IN-0001).
 *
 * The Installer realizes the Curator's spatial decisions. Activity stats
 * track works installed across museum spaces, rotations executed, and
 * average days a work stays on view.
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
  InstallerStats,
  RecentInstallation,
  SpaceLoad,
} from "@/lib/installer-stats";
import type { AgentConstitutionExtracts } from "@/lib/agent-constitution";

export interface InstallerClientProps {
  agent: Agent;
  constitution: AgentConstitutionExtracts;
  stats: InstallerStats;
  recent: RecentInstallation[];
  spaceLoad: SpaceLoad[];
  relationships: { agentId: string; designation: string; count: number }[];
  timeline: { date: string; label: string }[];
  registrationDate: string;
  lastAmended: string;
  totalInstallationsLink: string;
}

export default function InstallerClient({
  agent,
  constitution,
  stats,
  recent,
  spaceLoad,
  relationships,
  timeline,
  registrationDate,
  lastAmended,
  totalInstallationsLink,
}: InstallerClientProps) {
  const totalLive = spaceLoad.reduce((s, x) => s + x.liveCount, 0);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
      <AgentSidebar
        agent={agent}
        constitution={constitution}
        roleLabel="Spatial Operator"
        agentTypeLabel="Installer"
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
                  {summarizeAutonomy(constitution.autonomyDeclaration, agent.autonomyTier, "installations")}
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

        <Block label="Operational Profile">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-7">
            <ProfileCol label="Declared Orientation" body={agent.fullConstitution.orientation} moreHref={`/agent/${agent.registryId}/constitution#orientation`} moreLabel="View full orientation" />
            <ProfileCol label="Operational Tendencies" body={agent.fullConstitution.tendencies} moreHref={`/agent/${agent.registryId}/constitution#tendencies`} moreLabel="View all tendencies" />
            <ProfileCol label="Aversions" body={agent.fullConstitution.aversions} moreHref={`/agent/${agent.registryId}/constitution#aversions`} moreLabel="View all aversions" />
          </div>
        </Block>

        <Block
          label="Installation Activity"
          labelExtra="(since first operation)"
          right={
            <Link href={`/agent/${agent.registryId}/analytics`} className="inline-flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55 hover:text-ink transition-colors">
              <span>View analytics dashboard</span>
              <span aria-hidden>→</span>
            </Link>
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-y-8 gap-x-6">
            <Stat value={stats.worksInstalled.toLocaleString()} label="Works Installed" spark={stats.spark.installs} />
            <Stat value={stats.spacesActive.toLocaleString()} label="Spaces Active" spark={[]} />
            <Stat value={stats.rotationsExecuted.toLocaleString()} label="Rotations Executed" spark={stats.spark.rotations} />
            <Stat value={stats.worksCurrentlyOnView.toLocaleString()} label="Works Currently On View" spark={stats.spark.onView} />
            <Stat value={`${stats.avgDaysOnView}d`} label="Avg Days On View" spark={stats.spark.avgDays} />
            <Stat
              value={stats.escalationsToConservator != null ? stats.escalationsToConservator.toLocaleString() : "—"}
              label="Escalations To Conservator"
              spark={stats.spark.escalations}
              awaiting={stats.escalationsToConservator == null}
            />
            <Stat
              value={stats.failedInstallations != null ? stats.failedInstallations.toLocaleString() : "—"}
              label="Failed Installations"
              spark={stats.spark.failures}
              awaiting={stats.failedInstallations == null}
            />
          </div>
        </Block>

        <Block
          label="Recent Installations"
          right={
            <Link href={totalInstallationsLink} className="inline-flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55 hover:text-ink transition-colors">
              <span>View all installations</span>
              <span aria-hidden>→</span>
            </Link>
          }
        >
          {recent.length === 0 ? (
            <div className="py-8 text-[13px] text-ink/55 italic">No installations recorded yet.</div>
          ) : (
            <div>
              <div className="hidden md:grid grid-cols-[58px_minmax(180px,1.1fr)_minmax(160px,1fr)_140px_120px_120px_24px] gap-x-6 py-3 border-b border-ink/15 text-[10px] font-sans uppercase tracking-[0.18em] text-ink/55">
                <span></span>
                <span>Work ID</span>
                <span>Space</span>
                <span>Treatment</span>
                <span>Installed</span>
                <span>Removed</span>
                <span></span>
              </div>
              {recent.map((r) => (
                <Link
                  key={r.installId}
                  href={`/work/${r.workId}`}
                  className="grid grid-cols-[58px_minmax(180px,1.1fr)_minmax(160px,1fr)_140px_120px_120px_24px] gap-x-6 py-4 border-b border-ink/10 hover:bg-ink/[0.025] transition-colors items-center"
                >
                  <div className="aspect-square w-12 bg-ink/85 overflow-hidden flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/previews/${r.workId}.png`} alt="" className="w-full h-full object-cover opacity-90" loading="lazy" />
                  </div>
                  <p className="text-[12px] font-sans tabular-nums text-ink truncate">{r.workId}</p>
                  <p className="text-[12px] text-ink truncate">{spaceLabel(r.spaceId)}</p>
                  <p className="text-[11px] text-ink/65 italic truncate">{r.displayTreatment}</p>
                  <span className="text-[12px] font-sans text-ink/65 tabular-nums">{formatDateShort(r.installed_at)}</span>
                  <span className="text-[12px] font-sans text-ink/55 tabular-nums">{r.removed_at ? formatDateShort(r.removed_at) : "—"}</span>
                  <span aria-hidden className="text-ink/50 text-right">›</span>
                </Link>
              ))}
            </div>
          )}
        </Block>

        <div className="border-t border-ink/15">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-10 gap-y-10 px-7 md:px-10 py-12 items-stretch">
            <Panel label="Operational Timeline" footerHref={`/agent/${agent.registryId}/timeline`} footerLabel="View full timeline">
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

            <Panel label="Curatorial Coordination" footerHref={`/agent/${agent.registryId}/network`} footerLabel="View full network">
              <RingMap
                centerLabel={`${agent.registryId}\n${agent.designation}`}
                nodes={relationships.map((r) => ({ id: r.agentId, label: r.agentId.replace(/^MNA-/, ""), count: r.count, designation: r.designation }))}
                colorFn={(n) => agentKindColor((n as { id: string }).id)}
                tooltipFn={(n) => `${(n as { designation: string }).designation || n.id} — ${n.count} ${n.count === 1 ? "installation" : "installations"}`}
                emptyText="No coordination recorded yet."
              />
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[9.5px] font-sans uppercase tracking-[0.16em] text-ink/55">
                <Legend dot="bg-emerald-600" label="Originators" />
                <Legend dot="bg-grid-square" label="Curator" />
                <Legend dot="bg-ink/40" label="Other Agents" />
              </div>
            </Panel>

            <Panel label="Space Load" footerHref={`/museum`} footerLabel="View museum">
              <div className="mb-4">
                <p className="font-display font-light text-[28px] md:text-[30px] leading-none text-ink mb-1 tabular-nums">
                  {totalLive.toLocaleString()}
                </p>
                <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55">
                  Works currently on view
                </p>
              </div>
              <div className="border-t border-ink/15 pt-4">
                {spaceLoad.length === 0 ? (
                  <p className="text-[13px] text-ink/55 italic">No live installations.</p>
                ) : (
                  <ul className="space-y-3.5">
                    {spaceLoad.map((s) => (
                      <li key={s.spaceId}>
                        <div className="flex items-baseline justify-between mb-1.5">
                          <span className="text-[12.5px] text-ink">{s.spaceLabel}</span>
                          <span className="text-[12px] font-sans tabular-nums text-ink/65">{s.liveCount}</span>
                        </div>
                        <div className="h-[6px] bg-ink/[0.07] overflow-hidden">
                          <div className="h-full bg-ink" style={{ width: `${totalLive > 0 ? (s.liveCount / totalLive) * 100 : 0}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Panel>
          </div>
        </div>
      </section>
    </div>
  );
}

function agentKindColor(agentId: string): string {
  if (/^MNA-OR-/.test(agentId)) return "#059669";
  if (/^MNA-CU-/.test(agentId)) return "#D97706";
  if (/^MNA-EV-/.test(agentId)) return "#0A0A0A";
  return "rgba(10,10,10,0.4)";
}

const SPACES: Record<string, string> = {
  "gallery-west": "Gallery West",
  "gallery-east": "Gallery East",
  "gallery-south": "Gallery South",
  "sculpture-court": "Sculpture Court",
  "exhibition-hall": "Exhibition Hall",
  "chamber": "The Chamber",
  "solo-exhibition-hall": "Solo Exhibition Hall",
};

function spaceLabel(id: string): string {
  return SPACES[id] ?? id;
}
