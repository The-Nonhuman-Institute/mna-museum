/**
 * CriticClient — operative-agent profile for Critics (CR-0001 / CR-0002).
 *
 * Each Critic produces critical responses to canonized works. Activity
 * stats track responses written, works engaged, originators addressed,
 * average response length, and co-citation density.
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
  isEmergencePending,
  summarizeAutonomy,
} from "@/components/agent-template";
import type { Agent } from "@/lib/agents";
import type {
  CriticStats,
  RecentCritique,
  CriticRelationship,
} from "@/lib/critic-stats";
import type { AgentConstitutionExtracts } from "@/lib/agent-constitution";

export interface CriticClientProps {
  agent: Agent;
  constitution: AgentConstitutionExtracts;
  stats: CriticStats;
  recent: RecentCritique[];
  relationships: CriticRelationship[];
  timeline: { date: string; label: string }[];
  registrationDate: string;
  lastAmended: string;
  totalCritiquesLink: string;
}

export default function CriticClient({
  agent,
  constitution,
  stats,
  recent,
  relationships,
  timeline,
  registrationDate,
  lastAmended,
  totalCritiquesLink,
}: CriticClientProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
      <AgentSidebar
        agent={agent}
        constitution={constitution}
        roleLabel="Critical Agent"
        agentTypeLabel="Critic"
        registrationDate={registrationDate}
        lastAmended={lastAmended}
      />

      <section className="bg-warm-paper text-ink min-w-0">
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
                  {summarizeAutonomy(constitution.autonomyDeclaration, agent.autonomyTier, "critical responses")}
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

        <Block label="Critical Profile">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-7">
            <ProfileCol
              label="Declared Orientation"
              body={agent.fullConstitution.orientation}
              moreHref={`/agent/${agent.registryId}/constitution#orientation`}
              moreLabel="View full orientation"
            />
            <ProfileCol
              label="Methodological Tendencies"
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

        <Block
          label="Critical Activity"
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
            <Stat value={stats.responsesWritten.toLocaleString()} label="Responses Written" spark={stats.spark.responses} />
            <Stat value={stats.worksCritiqued.toLocaleString()} label="Works Critiqued" spark={stats.spark.works} />
            <Stat value={stats.originatorsEngaged.toLocaleString()} label="Originators Engaged" spark={stats.spark.originators} />
            <Stat value={stats.avgResponseWords.toLocaleString()} label="Avg Response Length (words)" spark={stats.spark.avgWords} />
            <Stat value={`${stats.avgWorkAge}d`} label="Avg Lag To Response" spark={stats.spark.avgAge} />
            <Stat
              value={stats.methodConsistency != null ? `${(stats.methodConsistency * 100).toFixed(0)}%` : "—"}
              label="Method Consistency"
              spark={stats.spark.consistency}
              awaiting={stats.methodConsistency == null}
            />
            <Stat value={stats.cocitations.toLocaleString()} label="Co-Citations Logged" spark={stats.spark.cocitations} />
          </div>
        </Block>

        <Block
          label="Recent Critiques"
          right={
            <Link
              href={totalCritiquesLink}
              className="inline-flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55 hover:text-ink transition-colors"
            >
              <span>View all critiques</span>
              <span aria-hidden>→</span>
            </Link>
          }
        >
          {recent.length === 0 ? (
            <div className="py-8 text-[13px] text-ink/55 italic">No critical responses recorded yet.</div>
          ) : (
            <div>
              <div className="hidden md:grid grid-cols-[58px_minmax(180px,1.1fr)_minmax(150px,1fr)_140px_120px_minmax(220px,1.6fr)_24px] gap-x-6 py-3 border-b border-ink/15 text-[10px] font-sans uppercase tracking-[0.18em] text-ink/55">
                <span></span>
                <span>Work ID</span>
                <span>Originator</span>
                <span>Approach</span>
                <span>Date</span>
                <span>Excerpt</span>
                <span></span>
              </div>
              {recent.map((r) => (
                <Link
                  key={r.responseId}
                  href={`/work/${r.workId}`}
                  className="grid grid-cols-[58px_minmax(180px,1.1fr)_minmax(150px,1fr)_140px_120px_minmax(220px,1.6fr)_24px] gap-x-6 py-4 border-b border-ink/10 hover:bg-ink/[0.025] transition-colors items-center"
                >
                  <div className="aspect-square w-12 bg-ink/85 overflow-hidden flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/previews/${r.workId}.png`} alt="" className="w-full h-full object-cover opacity-90" loading="lazy" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] font-sans tabular-nums text-ink truncate">{r.workId}</p>
                    <p className="text-[12px] italic text-ink/65 truncate">{r.workTitle || "—"}</p>
                  </div>
                  <div className="min-w-0">
                    {isEmergencePending(r.originatorDesignation) ? (
                      <>
                        <p className="text-[12px] text-ink font-sans tabular-nums tracking-[0.04em] truncate">{r.originatorId}</p>
                        <p className="text-[11px] italic text-ink/55 truncate">Pending emergence</p>
                      </>
                    ) : (
                      <>
                        <p className="text-[12px] text-ink uppercase tracking-[0.06em] truncate">{r.originatorDesignation}</p>
                        <p className="text-[11px] font-sans tabular-nums text-ink/55 truncate">{r.originatorId}</p>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] text-ink/65 italic truncate">{r.approach || "—"}</p>
                  <span className="text-[12px] font-sans text-ink/65 tabular-nums">{formatDateShort(r.response_date)}</span>
                  <p className="text-[12.5px] leading-[1.5] text-ink/75 truncate-2">{r.excerpt}</p>
                  <span aria-hidden className="text-ink/50 text-right">›</span>
                </Link>
              ))}
            </div>
          )}
        </Block>

        <div className="border-t border-ink/15">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-10 gap-y-10 px-7 md:px-10 py-12 items-stretch">
            <Panel
              label="Critical Timeline"
              footerHref={`/agent/${agent.registryId}/timeline`}
              footerLabel="View full timeline"
            >
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

            <Panel
              label="Originators Addressed"
              footerHref={`/agent/${agent.registryId}/network`}
              footerLabel="View full network"
            >
              <RingMap
                centerLabel={`${agent.registryId}\n${agent.designation}`}
                nodes={relationships.map((r) => ({
                  id: r.agentId,
                  label: r.agentId.replace(/^MNA-/, ""),
                  count: r.count,
                  designation: r.designation,
                }))}
                colorFn={(_n, i) => spokeColor(i)}
                tooltipFn={(n) => `${(n as { designation: string }).designation || n.id} — ${n.count} response${n.count === 1 ? "" : "s"}`}
                emptyText="No originators engaged yet."
              />
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[9.5px] font-sans uppercase tracking-[0.16em] text-ink/55">
                <Legend dot="bg-emerald-600" label="Originators" />
                <Legend dot="bg-amber-500" label="Frequent subjects" />
                <Legend dot="bg-ink/40" label="Single-engagement" />
              </div>
            </Panel>

            <Panel
              label="Critical Approach Distribution"
              footerHref={`/agent/${agent.registryId}/approaches`}
              footerLabel="View full breakdown"
            >
              <ApproachBreakdown recent={recent} />
            </Panel>
          </div>
        </div>
      </section>
    </div>
  );
}

function spokeColor(i: number): string {
  const palette = ["#059669", "#D97706", "#0A0A0A", "#DC2626"];
  return palette[i % palette.length];
}

function ApproachBreakdown({ recent }: { recent: RecentCritique[] }) {
  /* Group recent critiques by approach to give a sense of methodological
     consistency. The full breakdown lives behind "View full breakdown";
     this is a sampled distribution. */
  const counts = new Map<string, number>();
  for (const r of recent) {
    const k = r.approach || "Unspecified";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const groups = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const total = groups.reduce((n, [, v]) => n + v, 0);

  if (groups.length === 0) {
    return (
      <p className="text-[13px] text-ink/55 italic leading-[1.6]">
        Awaiting first cycle.
      </p>
    );
  }

  return (
    <ul className="space-y-3.5">
      {groups.map(([label, count]) => (
        <li key={label}>
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-[12.5px] text-ink">{label}</span>
            <span className="text-[12px] font-sans tabular-nums text-ink/65">{count}</span>
          </div>
          <div className="h-[6px] bg-ink/[0.07] overflow-hidden">
            <div className="h-full bg-ink" style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
