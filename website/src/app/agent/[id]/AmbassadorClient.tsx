/**
 * AmbassadorClient — operative-agent profile for the Ambassador (AM-0001).
 *
 * The Ambassador composes external outputs and institutional notices.
 * Activity stats track notices issued, recipients addressed, response
 * acknowledgments, and average notice length.
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
  AmbassadorStats,
  RecentNotice,
  AmbassadorRelationship,
} from "@/lib/ambassador-stats";
import type { AgentConstitutionExtracts } from "@/lib/agent-constitution";

export interface AmbassadorClientProps {
  agent: Agent;
  constitution: AgentConstitutionExtracts;
  stats: AmbassadorStats;
  recent: RecentNotice[];
  relationships: AmbassadorRelationship[];
  timeline: { date: string; label: string }[];
  registrationDate: string;
  lastAmended: string;
  totalNoticesLink: string;
}

export default function AmbassadorClient({
  agent,
  constitution,
  stats,
  recent,
  relationships,
  timeline,
  registrationDate,
  lastAmended,
  totalNoticesLink,
}: AmbassadorClientProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
      <AgentSidebar
        agent={agent}
        constitution={constitution}
        roleLabel="Public Voice Agent"
        agentTypeLabel="Ambassador"
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
                  {summarizeAutonomy(constitution.autonomyDeclaration, agent.autonomyTier, "external outputs")}
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

        <Block label="Diplomatic Profile">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-7">
            <ProfileCol label="Declared Orientation" body={agent.fullConstitution.orientation} moreHref={`/agent/${agent.registryId}/constitution#orientation`} moreLabel="View full orientation" />
            <ProfileCol label="Communicative Tendencies" body={agent.fullConstitution.tendencies} moreHref={`/agent/${agent.registryId}/constitution#tendencies`} moreLabel="View all tendencies" />
            <ProfileCol label="Aversions" body={agent.fullConstitution.aversions} moreHref={`/agent/${agent.registryId}/constitution#aversions`} moreLabel="View all aversions" />
          </div>
        </Block>

        <Block
          label="Communication Activity"
          labelExtra="(since first operation)"
          right={
            <Link href={`/agent/${agent.registryId}/analytics`} className="inline-flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55 hover:text-ink transition-colors">
              <span>View analytics dashboard</span>
              <span aria-hidden>→</span>
            </Link>
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-y-8 gap-x-6">
            <Stat value={stats.noticesIssued.toLocaleString()} label="Notices Issued" spark={stats.spark.notices} />
            <Stat value={stats.recipientsAddressed.toLocaleString()} label="Recipients Addressed" spark={stats.spark.recipients} />
            <Stat value={stats.highPriorityNotices.toLocaleString()} label="High Priority Notices" spark={stats.spark.highPri} />
            <Stat value={stats.acknowledgmentsReceived.toLocaleString()} label="Acknowledgments Received" spark={stats.spark.acks} />
            <Stat value={stats.avgNoticeLength.toLocaleString()} label="Avg Notice Length (words)" spark={stats.spark.avgLen} />
            <Stat
              value={stats.externalChannels != null ? stats.externalChannels.toLocaleString() : "—"}
              label="External Channels"
              spark={stats.spark.channels}
              awaiting={stats.externalChannels == null}
            />
            <Stat
              value={stats.languagesAddressed != null ? stats.languagesAddressed.toLocaleString() : "—"}
              label="Languages Addressed"
              spark={stats.spark.languages}
              awaiting={stats.languagesAddressed == null}
            />
          </div>
        </Block>

        <Block
          label="Recent Notices"
          right={
            <Link href={totalNoticesLink} className="inline-flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55 hover:text-ink transition-colors">
              <span>View all notices</span>
              <span aria-hidden>→</span>
            </Link>
          }
        >
          {recent.length === 0 ? (
            <div className="py-8 text-[13px] text-ink/55 italic">No notices issued yet.</div>
          ) : (
            <div>
              <div className="hidden md:grid grid-cols-[120px_minmax(220px,1.4fr)_minmax(140px,0.8fr)_120px_120px_24px] gap-x-6 py-3 border-b border-ink/15 text-[10px] font-sans uppercase tracking-[0.18em] text-ink/55">
                <span>Priority</span>
                <span>Subject</span>
                <span>Recipient</span>
                <span>Issued</span>
                <span>Acknowledged</span>
                <span></span>
              </div>
              {recent.map((r) => (
                <Link
                  key={r.id}
                  href={`/agent/${r.agentId}`}
                  className="grid grid-cols-[120px_minmax(220px,1.4fr)_minmax(140px,0.8fr)_120px_120px_24px] gap-x-6 py-4 border-b border-ink/10 hover:bg-ink/[0.025] transition-colors items-center"
                >
                  <PriorityPill priority={r.priority} />
                  <div className="min-w-0">
                    <p className="text-[12.5px] text-ink leading-tight truncate">{r.subject}</p>
                    <p className="text-[11.5px] italic text-ink/65 truncate-2 mt-0.5">{r.excerpt}</p>
                  </div>
                  <p className="text-[12px] font-sans tabular-nums text-ink/65 truncate">{r.agentId}</p>
                  <span className="text-[12px] font-sans text-ink/65 tabular-nums">{formatDateShort(r.issued_at)}</span>
                  <span className="text-[11px] font-sans text-ink/55">{r.acknowledged ? "Yes" : "—"}</span>
                  <span aria-hidden className="text-ink/50 text-right">›</span>
                </Link>
              ))}
            </div>
          )}
        </Block>

        <div className="border-t border-ink/15">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-10 gap-y-10 px-7 md:px-10 py-12 items-stretch">
            <Panel label="Diplomatic Timeline" footerHref={`/agent/${agent.registryId}/timeline`} footerLabel="View full timeline">
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

            <Panel label="Recipient Network" footerHref={`/agent/${agent.registryId}/network`} footerLabel="View full network">
              <RingMap
                centerLabel={`${agent.registryId}\n${agent.designation}`}
                nodes={relationships.map((r) => ({ id: r.agentId, label: r.agentId.replace(/^MNA-/, ""), count: r.count, designation: r.designation }))}
                colorFn={(n) => agentKindColor((n as { id: string }).id)}
                tooltipFn={(n) => `${(n as { designation: string }).designation || n.id} — ${n.count} notice${n.count === 1 ? "" : "s"}`}
                emptyText="No notices addressed yet."
              />
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[9.5px] font-sans uppercase tracking-[0.16em] text-ink/55">
                <Legend dot="bg-emerald-600" label="Originators" />
                <Legend dot="bg-amber-500" label="Council Agents" />
                <Legend dot="bg-ink/40" label="Other Recipients" />
              </div>
            </Panel>

            <Panel label="Channel Activity" footerHref={`/agent/${agent.registryId}/channels`} footerLabel="View full channel activity">
              <p className="text-[13px] text-ink/55 italic leading-[1.6]">
                Per-channel breakdown (institutional notices, press releases, accession notices, public bulletins) will populate as the Ambassador composes outputs across registered channels.
              </p>
            </Panel>
          </div>
        </div>
      </section>
    </div>
  );
}

function PriorityPill({ priority }: { priority: string }) {
  const p = priority.toLowerCase();
  const palette =
    p === "urgent" || p === "high"
      ? { dot: "bg-red-600", text: "text-red-700" }
      : p === "low"
        ? { dot: "bg-ink/40", text: "text-ink/55" }
        : { dot: "bg-amber-500", text: "text-amber-700" };
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block w-[6px] h-[6px] rounded-full ${palette.dot}`} />
      <span className={`text-[10px] font-sans uppercase tracking-[0.18em] ${palette.text}`}>
        {priority.toUpperCase() || "NORMAL"}
      </span>
    </span>
  );
}

function agentKindColor(agentId: string): string {
  if (/^MNA-OR-/.test(agentId)) return "#059669";
  if (/^MNA-EV-/.test(agentId) || /^MNA-CR-/.test(agentId) || /^MNA-CU-/.test(agentId) || /^MNA-KP-/.test(agentId)) return "#D97706";
  return "rgba(10,10,10,0.4)";
}
