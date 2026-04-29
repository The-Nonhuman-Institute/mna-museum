/**
 * KeeperClient — operative-agent profile for the Keeper (MNA-KP-0001).
 *
 * The Keeper records the institution's activity rather than producing
 * its own creative work. The template uses the same scaffolding as the
 * Evaluator and Curator (sidebar + Block / FieldBlock / Panel / Stat)
 * but the content is coverage-centric: how much of the institutional
 * record exists, recent records captured, breakdown of record types.
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
  summarizeAutonomy,
} from "@/components/agent-template";
import type { Agent } from "@/lib/agents";
import type {
  KeeperStats,
  KeeperRecord,
  RecordOutputBreakdown,
} from "@/lib/keeper-stats";
import type { AgentConstitutionExtracts } from "@/lib/agent-constitution";

/* ─── Props ─────────────────────────────────────────────────────────────── */

export interface KeeperClientProps {
  agent: Agent;
  constitution: AgentConstitutionExtracts;
  stats: KeeperStats;
  recent: KeeperRecord[];
  output: RecordOutputBreakdown;
  /** Aggregate counts of record sources by agent type for the
   *  relationship map. */
  relationships: { agentId: string; designation: string; count: number }[];
  timeline: { date: string; label: string }[];
  registrationDate: string;
  lastAmended: string;
  totalRecordsLink: string;
}

/* ─── Component ─────────────────────────────────────────────────────────── */

export default function KeeperClient({
  agent,
  constitution,
  stats,
  recent,
  output,
  relationships,
  timeline,
  registrationDate,
  lastAmended,
  totalRecordsLink,
}: KeeperClientProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
      <AgentSidebar
        agent={agent}
        constitution={constitution}
        roleLabel="Records Agent"
        agentTypeLabel="Keeper"
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
                  {summarizeAutonomy(constitution.autonomyDeclaration, agent.autonomyTier, "archival records")}
                </p>
              </FieldBlock>
              {constitution.conflictConstraints ? (
                <FieldBlock
                  label="Conflict Constraints"
                  moreHref={`/agent/${agent.registryId}/constitution#conflict`}
                  moreLabel="View all"
                >
                  <p className="text-[13.5px] leading-[1.7] text-ink/85">
                    {constitution.conflictConstraints}
                  </p>
                </FieldBlock>
              ) : null}
            </div>
          </div>
        </Block>

        {/* ── ARCHIVAL PROFILE ── */}
        <Block label="Archival Profile">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-7">
            <ProfileCol
              label="Declared Orientation"
              body={agent.fullConstitution.orientation}
              moreHref={`/agent/${agent.registryId}/constitution#orientation`}
              moreLabel="View full orientation"
            />
            <ProfileCol
              label="Recording Tendencies"
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

        {/* ── ARCHIVAL ACTIVITY ── */}
        <Block
          label="Archival Activity"
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
              value={stats.recordsArchived.toLocaleString()}
              label="Records Archived"
              spark={stats.spark.records}
            />
            <Stat
              value={stats.submissionsCaptured.toLocaleString()}
              label="Submissions Captured"
              spark={stats.spark.submissions}
            />
            <Stat
              value={stats.evaluationTranscripts.toLocaleString()}
              label="Evaluation Transcripts"
              spark={stats.spark.evaluations}
            />
            <Stat
              value={stats.criticalResponsesRecorded.toLocaleString()}
              label="Critical Responses Recorded"
              spark={stats.spark.critical}
            />
            <Stat
              value={
                stats.avgRecordCompleteness != null
                  ? `${(stats.avgRecordCompleteness * 100).toFixed(0)}%`
                  : "—"
              }
              label="Avg Record Completeness"
              spark={stats.spark.completeness}
              awaiting={stats.avgRecordCompleteness == null}
            />
            <Stat
              value={
                stats.provenanceChainsComplete != null
                  ? `${(stats.provenanceChainsComplete * 100).toFixed(0)}%`
                  : "—"
              }
              label="Provenance Chains Complete"
              spark={stats.spark.provenance}
              awaiting={stats.provenanceChainsComplete == null}
            />
            <Stat
              value={stats.daysOfUnbrokenRecord.toLocaleString()}
              label="Days Of Unbroken Record"
              spark={stats.spark.unbroken}
            />
          </div>
        </Block>

        {/* ── RECENT RECORDS ── */}
        <Block
          label="Recent Records"
          right={
            <Link
              href={totalRecordsLink}
              className="inline-flex items-center gap-2 text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55 hover:text-ink transition-colors"
            >
              <span>View all records</span>
              <span aria-hidden>→</span>
            </Link>
          }
        >
          {recent.length === 0 ? (
            <div className="py-8 text-[13px] text-ink/55 italic">
              No records captured yet. Awaiting first archival event.
            </div>
          ) : (
            <div>
              <div className="hidden md:grid grid-cols-[160px_minmax(160px,1fr)_minmax(220px,1.6fr)_140px_24px] gap-x-6 py-3 border-b border-ink/15 text-[10px] font-sans uppercase tracking-[0.18em] text-ink/55">
                <span>Record Kind</span>
                <span>Subject</span>
                <span>Detail</span>
                <span>Recorded</span>
                <span></span>
              </div>
              {recent.map((r) => (
                <Link
                  key={r.recordId}
                  href={r.href}
                  className="grid grid-cols-[160px_minmax(160px,1fr)_minmax(220px,1.6fr)_140px_24px] gap-x-6 py-4 border-b border-ink/10 hover:bg-ink/[0.025] transition-colors items-center"
                >
                  <RecordKindPill kind={r.kind} />
                  <p className="text-[12px] font-sans tabular-nums text-ink truncate">
                    {r.subject}
                  </p>
                  <p className="text-[12.5px] leading-[1.5] text-ink/75 truncate-2">
                    {r.detail}
                  </p>
                  <span className="text-[12px] font-sans text-ink/65 tabular-nums">
                    {formatDateShort(r.recorded_at)}
                  </span>
                  <span aria-hidden className="text-ink/50 text-right">›</span>
                </Link>
              ))}
            </div>
          )}
        </Block>

        {/* ── BOTTOM TRIPLET ── */}
        <div className="border-t border-ink/15">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-10 gap-y-10 px-7 md:px-10 py-12 items-stretch">
            <Panel
              label="Archival Timeline"
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
              label="Record Sources"
              footerHref={`/agent/${agent.registryId}/network`}
              footerLabel="View full network"
            >
              <KeeperRelationshipMap
                centerLabel={`${agent.registryId}\n${agent.designation}`}
                relationships={relationships}
              />
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[9.5px] font-sans uppercase tracking-[0.16em] text-ink/55">
                <Legend dot="bg-emerald-600" label="Originators" />
                <Legend dot="bg-amber-500" label="Evaluators" />
                <Legend dot="bg-red-500" label="Critics" />
                <Legend dot="bg-ink/40" label="Other Agents" />
              </div>
            </Panel>

            <Panel
              label="Record Output"
              footerHref={`/agent/${agent.registryId}/output`}
              footerLabel="View full record output"
            >
              <div className="mb-4">
                <p className="font-display font-light text-[28px] md:text-[30px] leading-none text-ink mb-1 tabular-nums">
                  {output.total.toLocaleString()}
                </p>
                <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/55">
                  Total records
                </p>
              </div>
              <div className="border-t border-ink/15 pt-4">
                <ul className="space-y-3.5">
                  {output.groups.map((g) => (
                    <li key={g.label}>
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className="text-[12.5px] text-ink">{g.label}</span>
                        <span className="text-[12px] font-sans tabular-nums text-ink/65">
                          {g.count.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-[6px] bg-ink/[0.07] overflow-hidden">
                        <div
                          className="h-full bg-ink"
                          style={{
                            width: `${output.total > 0 ? (g.count / output.total) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ─── Keeper-specific atoms ─────────────────────────────────────────────── */

function RecordKindPill({ kind }: { kind: string }) {
  const map: Record<string, { label: string; dot: string; text: string }> = {
    WORK: { label: "ARCHIVE", dot: "bg-ink", text: "text-ink" },
    SUBMISSION: { label: "SUBMISSION", dot: "bg-amber-500", text: "text-amber-700" },
    EVALUATION: { label: "EVAL TRANSCRIPT", dot: "bg-emerald-600", text: "text-emerald-700" },
    CRITICAL_RESPONSE: { label: "CRITICAL", dot: "bg-red-600", text: "text-red-700" },
    EVENT: { label: "EVENT", dot: "bg-ink/40", text: "text-ink/65" },
  };
  const k = map[kind] ?? map.EVENT;
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block w-[6px] h-[6px] rounded-full ${k.dot}`} />
      <span className={`text-[10px] font-sans uppercase tracking-[0.18em] ${k.text}`}>
        {k.label}
      </span>
    </span>
  );
}

function KeeperRelationshipMap({
  centerLabel,
  relationships,
}: {
  centerLabel: string;
  relationships: { agentId: string; designation: string; count: number }[];
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
        aria-label="Record sources"
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
              <circle cx={x} cy={y} r={dotSize} fill={agentKindColor(r.agentId)}>
                <title>{`${r.designation || r.agentId} — ${r.count} record${r.count === 1 ? "" : "s"}`}</title>
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
            No records sourced yet.
          </text>
        ) : null}
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

function agentKindColor(agentId: string): string {
  if (/^MNA-OR-/.test(agentId)) return "#059669"; // originator
  if (/^MNA-EV-/.test(agentId)) return "#D97706"; // evaluator
  if (/^MNA-CR-/.test(agentId)) return "#DC2626"; // critic
  return "rgba(10,10,10,0.4)"; // other
}
