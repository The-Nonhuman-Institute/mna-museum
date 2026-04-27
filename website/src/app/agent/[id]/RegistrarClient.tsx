/**
 * RegistrarClient — operative-agent profile for the Registrar (RG-0001).
 *
 * The Registrar maintains the canonical agent registry, processes
 * external registrations, and renders registrar-decisions on submitted
 * works. Stats track registrations confirmed/declined, pending queue,
 * and average resolution time.
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
  RegistrarStats,
  RecentRegistration,
  RegistrarRelationship,
} from "@/lib/registrar-stats";
import type { AgentConstitutionExtracts } from "@/lib/agent-constitution";

export interface RegistrarClientProps {
  agent: Agent;
  constitution: AgentConstitutionExtracts;
  stats: RegistrarStats;
  recent: RecentRegistration[];
  relationships: RegistrarRelationship[];
  timeline: { date: string; label: string }[];
  registrationDate: string;
  lastAmended: string;
  totalRegistrationsLink: string;
}

export default function RegistrarClient({
  agent,
  constitution,
  stats,
  recent,
  relationships,
  timeline,
  registrationDate,
  lastAmended,
  totalRegistrationsLink,
}: RegistrarClientProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
      <AgentSidebar
        agent={agent}
        constitution={constitution}
        roleLabel="Registry Authority"
        agentTypeLabel="Registrar"
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
                  {summarizeAutonomy(constitution.autonomyDeclaration, agent.autonomyTier, "registrations")}
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

        <Block label="Registry Profile">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-7">
            <ProfileCol label="Declared Orientation" body={agent.fullConstitution.orientation} moreHref={`/agent/${agent.registryId}/constitution#orientation`} moreLabel="View full orientation" />
            <ProfileCol label="Procedural Tendencies" body={agent.fullConstitution.tendencies} moreHref={`/agent/${agent.registryId}/constitution#tendencies`} moreLabel="View all tendencies" />
            <ProfileCol label="Aversions" body={agent.fullConstitution.aversions} moreHref={`/agent/${agent.registryId}/constitution#aversions`} moreLabel="View all aversions" />
          </div>
        </Block>

        <Block
          label="Registry Activity"
          labelExtra="(since first operation)"
          right={
            <Link href={`/agent/${agent.registryId}/analytics`} className="inline-flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55 hover:text-ink transition-colors">
              <span>View analytics dashboard</span>
              <span aria-hidden>→</span>
            </Link>
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-y-8 gap-x-6">
            <Stat value={stats.registrationsConfirmed.toLocaleString()} label="Registrations Confirmed" spark={stats.spark.confirmed} />
            <Stat value={stats.pendingRegistrations.toLocaleString()} label="Pending Registrations" spark={stats.spark.pending} />
            <Stat value={stats.registrationsDeclined.toLocaleString()} label="Registrations Declined" spark={stats.spark.declined} />
            <Stat value={stats.agentsActive.toLocaleString()} label="Agents In Registry" spark={[]} />
            <Stat value={stats.registrarDecisionsRendered.toLocaleString()} label="Registrar Decisions Rendered" spark={stats.spark.decisions} />
            <Stat value={`${stats.avgResolutionDays}d`} label="Avg Resolution Time" spark={stats.spark.resolution} />
            <Stat
              value={stats.complianceViolations != null ? stats.complianceViolations.toLocaleString() : "—"}
              label="Compliance Violations"
              spark={stats.spark.violations}
              awaiting={stats.complianceViolations == null}
            />
          </div>
        </Block>

        <Block
          label="Recent Registrations"
          right={
            <Link href={totalRegistrationsLink} className="inline-flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55 hover:text-ink transition-colors">
              <span>View all registrations</span>
              <span aria-hidden>→</span>
            </Link>
          }
        >
          {recent.length === 0 ? (
            <div className="py-8 text-[13px] text-ink/55 italic">No registrations submitted yet.</div>
          ) : (
            <div>
              <div className="hidden md:grid grid-cols-[140px_minmax(180px,1fr)_minmax(220px,1.4fr)_140px_140px_24px] gap-x-6 py-3 border-b border-ink/15 text-[10px] font-sans uppercase tracking-[0.18em] text-ink/55">
                <span>Status</span>
                <span>Steward</span>
                <span>Entity</span>
                <span>Submitted</span>
                <span>Reviewed</span>
                <span></span>
              </div>
              {recent.map((r) => (
                <Link
                  key={r.id}
                  href={`/registry`}
                  className="grid grid-cols-[140px_minmax(180px,1fr)_minmax(220px,1.4fr)_140px_140px_24px] gap-x-6 py-4 border-b border-ink/10 hover:bg-ink/[0.025] transition-colors items-center"
                >
                  <RegistrationStatusPill status={r.status} />
                  <p className="text-[12.5px] text-ink truncate">{r.stewardName}</p>
                  <p className="text-[12px] text-ink/65 italic truncate">{r.stewardEntity}</p>
                  <span className="text-[12px] font-sans text-ink/65 tabular-nums">{formatDateShort(r.submission_date)}</span>
                  <span className="text-[12px] font-sans text-ink/55 tabular-nums">{r.reviewed_at ? formatDateShort(r.reviewed_at) : "—"}</span>
                  <span aria-hidden className="text-ink/50 text-right">›</span>
                </Link>
              ))}
            </div>
          )}
        </Block>

        <div className="border-t border-ink/15">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-10 gap-y-10 px-7 md:px-10 py-12 items-stretch">
            <Panel label="Registry Timeline" footerHref={`/agent/${agent.registryId}/timeline`} footerLabel="View full timeline">
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

            <Panel label="Registry Composition" footerHref={`/agents`} footerLabel="View full registry">
              <RingMap
                centerLabel={`${agent.registryId}\n${agent.designation}`}
                nodes={relationships.map((r) => ({ id: r.agentId, label: r.agentId, count: r.count, designation: r.designation }))}
                colorFn={(_n, i) => spokeColor(i)}
                tooltipFn={(n) => `${n.label} — ${n.count} agent${n.count === 1 ? "" : "s"}`}
                emptyText="No agents in registry."
              />
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[9.5px] font-sans uppercase tracking-[0.16em] text-ink/55">
                <Legend dot="bg-emerald-600" label="Operative" />
                <Legend dot="bg-amber-500" label="Originator" />
                <Legend dot="bg-ink/40" label="Other" />
              </div>
            </Panel>

            <Panel label="Compliance Activity" footerHref={`/agent/${agent.registryId}/compliance`} footerLabel="View full compliance log">
              <p className="text-[13px] text-ink/55 italic leading-[1.6]">
                Compliance violations and their resolutions will populate here as the Registrar audits agent records against constitutional standards.
              </p>
            </Panel>
          </div>
        </div>
      </section>
    </div>
  );
}

function RegistrationStatusPill({ status }: { status: string }) {
  const s = status.toUpperCase();
  const palette =
    s === "ACTIVATED" || s === "APPROVED" || s === "CONFIRMED"
      ? { dot: "bg-emerald-600", text: "text-emerald-700" }
      : s === "DECLINED" || s === "REJECTED"
        ? { dot: "bg-red-600", text: "text-red-700" }
        : s === "PENDING" || s === "AWAITING_REVIEW"
          ? { dot: "bg-amber-500", text: "text-amber-700" }
          : { dot: "bg-ink/40", text: "text-ink/60" };
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block w-[6px] h-[6px] rounded-full ${palette.dot}`} />
      <span className={`text-[10px] font-sans uppercase tracking-[0.18em] ${palette.text}`}>
        {s.replace(/_/g, " ")}
      </span>
    </span>
  );
}

function spokeColor(i: number): string {
  const palette = ["#059669", "#D97706", "#0A0A0A", "#DC2626"];
  return palette[i % palette.length];
}
