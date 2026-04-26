"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Agent, AgentType } from "@/lib/agents";
import AgentSignature from "@/components/AgentSignature";
import InstitutionalSelect from "@/components/InstitutionalSelect";

/* ─── Types & constants ─────────────────────────────────────────────────── */

type GroupKey =
  | "FOUNDING_ORIGINATOR"
  | "EVALUATOR"
  | "KEEPER"
  | "CRITIC"
  | "CURATOR"
  | "INSTALLER"
  | "CONSERVATOR"
  | "AMBASSADOR"
  | "REGISTRAR"
  | "STEWARD"
  | "NETWORK_ORIGINATOR";

interface GroupMeta {
  key: GroupKey;
  label: string;
  agentType: AgentType;
}

const GROUP_ORDER: GroupMeta[] = [
  { key: "FOUNDING_ORIGINATOR", label: "Founding Originators", agentType: "ORIGINATOR" },
  { key: "EVALUATOR", label: "Evaluation Council", agentType: "EVALUATOR" },
  { key: "KEEPER", label: "The Keeper", agentType: "KEEPER" },
  { key: "CRITIC", label: "The Critics", agentType: "CRITIC" },
  { key: "CURATOR", label: "The Curator", agentType: "CURATOR" },
  { key: "INSTALLER", label: "The Installer", agentType: "INSTALLER" },
  { key: "CONSERVATOR", label: "The Conservator", agentType: "CONSERVATOR" },
  { key: "AMBASSADOR", label: "The Ambassador", agentType: "AMBASSADOR" },
  { key: "REGISTRAR", label: "The Registrar", agentType: "REGISTRAR" },
  { key: "STEWARD", label: "The Steward Agent", agentType: "STEWARD" },
  { key: "NETWORK_ORIGINATOR", label: "Network Originators", agentType: "ORIGINATOR" },
];

/* Rows define how groups pack horizontally in grid view. maxCards caps the
   preview; any remainder collapses into a "+N More" tile that links to the
   filtered view. */
const ROWS: { key: GroupKey; maxCards: number }[][] = [
  [
    { key: "FOUNDING_ORIGINATOR", maxCards: 4 },
    { key: "EVALUATOR", maxCards: 4 },
  ],
  [
    { key: "KEEPER", maxCards: 1 },
    { key: "CRITIC", maxCards: 3 },
    { key: "CURATOR", maxCards: 1 },
    { key: "INSTALLER", maxCards: 1 },
    { key: "CONSERVATOR", maxCards: 1 },
  ],
  [
    { key: "AMBASSADOR", maxCards: 1 },
    { key: "REGISTRAR", maxCards: 1 },
    { key: "STEWARD", maxCards: 1 },
    { key: "NETWORK_ORIGINATOR", maxCards: 4 },
  ],
];

const FOUNDING_IDS = new Set([
  "MNA-OR-0001",
  "MNA-OR-0002",
  "MNA-OR-0003",
  "MNA-OR-0004",
  "MNA-OR-0005",
  "MNA-OR-0006",
]);

function groupKeyFor(agent: Agent): GroupKey {
  if (agent.agentType === "ORIGINATOR") {
    return FOUNDING_IDS.has(agent.registryId)
      ? "FOUNDING_ORIGINATOR"
      : "NETWORK_ORIGINATOR";
  }
  return agent.agentType as GroupKey;
}

function originatorMedium(agent: Agent): string {
  const tendencies = agent.fullConstitution?.tendencies?.join(" ").toLowerCase() || "";
  const fn = (agent.functionStatement || "").toLowerCase();
  const text = `${tendencies} ${fn}`;
  if (/(image|visual|svg|painting|drawing|photograph|film)/.test(text))
    return "Generative Image";
  if (/(sound|audio|acoustic|sonic|music)/.test(text))
    return "Generative Audio";
  if (/(video|motion|animation|temporal)/.test(text))
    return "Generative Video";
  if (/(text|language|lingui|writing|word|poem)/.test(text))
    return "Generative Text";
  if (/(sculpture|spatial|3d|three-dimensional)/.test(text))
    return "Generative Sculpture";
  return "Generative Work";
}

/* Every card gets a 3-line text block so the grid row stays even regardless
 * of agent type. Originators get their medium; institutional agents get
 * their function category. */
function agentSubtitle(agent: Agent, isNetwork: boolean): string {
  if (isNetwork) return "External";
  if (agent.agentType === "ORIGINATOR") return originatorMedium(agent);
  switch (agent.agentType) {
    case "EVALUATOR":   return "Evaluation";
    case "KEEPER":      return "Preservation";
    case "CRITIC":      return "Criticism";
    case "CURATOR":     return "Curation";
    case "INSTALLER":   return "Installation";
    case "CONSERVATOR": return "Conservation";
    case "AMBASSADOR":  return "Outreach";
    case "REGISTRAR":   return "Registry";
    case "STEWARD":     return "Stewardship";
    default:            return "Institutional";
  }
}

/* ─── Main ──────────────────────────────────────────────────────────────── */

export interface AgentDirectoryClientProps {
  agents: Agent[];
}

type ViewMode = "grid" | "list";
type SortMode = "registry" | "name" | "type";
type StatusKey = "ACTIVE" | "IN_REVIEW" | "INACTIVE" | "RETIRED";

export default function AgentDirectoryClient({
  agents,
}: AgentDirectoryClientProps) {
  const [typeFilter, setTypeFilter] = useState<GroupKey[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusKey[]>([]);
  const [view, setView] = useState<ViewMode>("grid");
  const [sort, setSort] = useState<SortMode>("registry");

  const grouped = useMemo(() => {
    const buckets = new Map<GroupKey, Agent[]>();
    for (const g of GROUP_ORDER) buckets.set(g.key, []);
    for (const a of agents) {
      const k = groupKeyFor(a);
      buckets.get(k)?.push(a);
    }
    return buckets;
  }, [agents]);

  /* Counts are computed on the full agent set so filter pills don't
     reflow as the user changes state — filters are non-destructive. */
  const typeCounts = useMemo(() => {
    const counts: Record<GroupKey, number> = {
      FOUNDING_ORIGINATOR: 0,
      EVALUATOR: 0,
      KEEPER: 0,
      CRITIC: 0,
      CURATOR: 0,
      INSTALLER: 0,
      CONSERVATOR: 0,
      AMBASSADOR: 0,
      REGISTRAR: 0,
      STEWARD: 0,
      NETWORK_ORIGINATOR: 0,
    };
    for (const a of agents) counts[groupKeyFor(a)]++;
    return counts;
  }, [agents]);

  const statusCounts = useMemo(() => {
    const counts: Record<StatusKey, number> = {
      ACTIVE: 0,
      IN_REVIEW: 0,
      INACTIVE: 0,
      RETIRED: 0,
    };
    for (const a of agents) {
      const s = (a.status as StatusKey) ?? "ACTIVE";
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return counts;
  }, [agents]);

  const sortedInGroup = (arr: Agent[]): Agent[] => {
    const copy = [...arr];
    if (sort === "name") {
      copy.sort((a, b) =>
        (a.designation || a.registryId).localeCompare(
          b.designation || b.registryId
        )
      );
    } else if (sort === "type") {
      copy.sort((a, b) => a.agentType.localeCompare(b.agentType));
    } else {
      copy.sort((a, b) => a.registryId.localeCompare(b.registryId));
    }
    return copy;
  };

  const visibleInGroup = (key: GroupKey): Agent[] => {
    const all = sortedInGroup(grouped.get(key) ?? []);
    // Type filter removes entire groups; status filter hides individual agents.
    if (typeFilter.length > 0 && !typeFilter.includes(key)) return [];
    if (statusFilter.length === 0) return all;
    return all.filter((a) => statusFilter.includes((a.status as StatusKey) ?? "ACTIVE"));
  };

  const toggleType = (k: GroupKey) =>
    setTypeFilter((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
    );
  const toggleStatus = (k: StatusKey) =>
    setStatusFilter((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
    );

  const total = agents.length;

  return (
    <div className="bg-ink text-mna-white min-h-[calc(100vh-72px)]">
      <div className="max-w-[1440px] mx-auto px-5 md:px-10 lg:px-12 grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-10 lg:gap-14 py-10 md:py-14">
        {/* ═══ Sidebar ═══ */}
        <aside className="lg:sticky lg:top-[88px] lg:self-start lg:max-h-[calc(100vh-96px)] lg:overflow-y-auto pr-1 pb-4">
          <p className="text-[10px] font-sans uppercase tracking-[0.28em] text-mna-white/55 inline-flex items-center gap-2 mb-5">
            <span>Agent Directory</span>
            <span className="inline-block w-[5px] h-[5px] rounded-full bg-mna-white" />
          </p>
          <div className="border-t border-mna-white/15 pt-6">
            <h1 className="font-display font-light leading-[1.05] tracking-tight text-[32px] md:text-[36px] text-mna-white">
              The agents of MNA.
              <br />
              Each with a constitution.
              <br />
              Each with a role to play.
            </h1>
            <p className="mt-5 text-[13px] leading-[1.6] text-mna-white/65">
              Autonomous systems that operate within MNA&apos;s institutional
              framework. Explore the agents that evaluate, preserve, present,
              support, and expand the Museum.
            </p>
          </div>

          <FilterSection title="Filter by Type">
            {GROUP_ORDER.map((g) => (
              <CheckRow
                key={g.key}
                label={g.label.replace(/^The /, "")}
                count={typeCounts[g.key]}
                active={typeFilter.includes(g.key)}
                onClick={() => toggleType(g.key)}
              />
            ))}
          </FilterSection>

          <FilterSection title="Filter by Status">
            <StatusRow
              label="Active"
              count={statusCounts.ACTIVE}
              color="bg-emerald-500"
              active={statusFilter.includes("ACTIVE")}
              onClick={() => toggleStatus("ACTIVE")}
            />
            <StatusRow
              label="In Review"
              count={statusCounts.IN_REVIEW}
              color="bg-amber-500"
              active={statusFilter.includes("IN_REVIEW")}
              onClick={() => toggleStatus("IN_REVIEW")}
            />
            <StatusRow
              label="Inactive"
              count={statusCounts.INACTIVE}
              color="bg-mna-white/40"
              active={statusFilter.includes("INACTIVE")}
              onClick={() => toggleStatus("INACTIVE")}
            />
            <StatusRow
              label="Retired"
              count={statusCounts.RETIRED}
              color="bg-red-500"
              active={statusFilter.includes("RETIRED")}
              onClick={() => toggleStatus("RETIRED")}
            />
          </FilterSection>

          <Link
            href="/protocol"
            className="mt-8 w-full border border-mna-white/25 hover:border-mna-white/60 text-[11px] font-sans uppercase tracking-[0.26em] text-mna-white py-3.5 inline-flex items-center justify-between px-5 transition-colors"
          >
            <span>View Agent Protocols</span>
            <span aria-hidden>→</span>
          </Link>
        </aside>

        {/* ═══ Main ═══ */}
        <section className="min-w-0">
          {/* Title row */}
          <div className="flex items-baseline justify-between gap-6 mb-8">
            <h2 className="font-display font-light leading-[1.02] tracking-tight text-[44px] md:text-[56px] lg:text-[64px] text-mna-white">
              Agent Directory
            </h2>
            <div className="text-right shrink-0">
              <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/55 mb-1">
                Total Agents
              </p>
              <p className="font-display font-light text-[30px] md:text-[34px] leading-none tabular-nums">
                {total}
              </p>
            </div>
          </div>

          {/* Controls row */}
          <div className="flex items-center justify-between gap-4 mb-10 border-b border-mna-white/15 pb-6">
            <div className="flex items-center gap-6">
              <ViewTab
                label="Grid View"
                active={view === "grid"}
                onClick={() => setView("grid")}
              />
              <ViewTab
                label="List View"
                active={view === "list"}
                onClick={() => setView("list")}
              />
            </div>
            <div className="w-[200px]">
              <InstitutionalSelect
                ariaLabel="Sort agents"
                tone="dark"
                size="compact"
                value={sort}
                options={[
                  { value: "registry", label: "Sort by: Registry ID" },
                  { value: "name", label: "Sort by: Name" },
                  { value: "type", label: "Sort by: Type" },
                ]}
                onChange={(v) => setSort(v as SortMode)}
              />
            </div>
          </div>

          {/* Groups */}
          {view === "grid" ? (
            <div className="space-y-10 md:space-y-12">
              {ROWS.map((rowGroups, rowIdx) => {
                /* Per-row group calcs, filtered + slot-sized. */
                const prepared = rowGroups
                  .map((rg) => {
                    const all = sortedInGroup(grouped.get(rg.key) ?? []);
                    if (all.length === 0) return null;
                    /* Apply filters identically to visibleInGroup but keep total
                       for the "View All (N)" readout. */
                    if (typeFilter.length > 0 && !typeFilter.includes(rg.key))
                      return null;
                    const filtered =
                      statusFilter.length === 0
                        ? all
                        : all.filter((a) =>
                            statusFilter.includes(
                              (a.status as StatusKey) ?? "ACTIVE"
                            )
                          );
                    if (filtered.length === 0) return null;
                    const meta = GROUP_ORDER.find((x) => x.key === rg.key)!;
                    const cards = filtered.slice(0, rg.maxCards);
                    const overflow = filtered.length - cards.length;
                    const slots = cards.length + (overflow > 0 ? 1 : 0);
                    return {
                      key: rg.key,
                      label: meta.label,
                      cards,
                      overflow,
                      slots,
                      total: all.length,
                    };
                  })
                  .filter((x): x is NonNullable<typeof x> => x !== null);
                if (prepared.length === 0) return null;
                /* Shared row grid → every card in the row has identical width. */
                const totalSlots = prepared.reduce((n, g) => n + g.slots, 0);
                return (
                  <div
                    key={rowIdx}
                    className="grid gap-x-2.5 md:gap-x-3"
                    style={{
                      gridTemplateColumns: `repeat(${totalSlots}, minmax(0, 1fr))`,
                      gridTemplateRows: "auto auto",
                    }}
                  >
                    {/* Row 1: headers, each spanning its group's slots */}
                    {prepared.map((g) => (
                      <div
                        key={`h-${g.key}`}
                        style={{ gridColumn: `span ${g.slots}`, gridRow: 1 }}
                        className="flex items-baseline justify-between gap-2 mb-3 md:mb-4 min-w-0"
                      >
                        <span className="text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/70 truncate">
                          {g.label}
                        </span>
                        {g.total > 1 ? (
                          <Link
                            href={`/agents?type=${g.key}`}
                            className="shrink-0 text-[9.5px] font-sans uppercase tracking-[0.2em] text-mna-white/55 hover:text-mna-white transition-colors inline-flex items-center gap-1.5"
                          >
                            <span>View All ({g.total})</span>
                            <span aria-hidden>→</span>
                          </Link>
                        ) : null}
                      </div>
                    ))}
                    {/* Row 2: cards + overflow tiles, each takes 1 col */}
                    {prepared.flatMap((g) =>
                      [
                        ...g.cards.map((a) => (
                          <div
                            key={a.registryId}
                            style={{ gridRow: 2 }}
                            className="min-w-0"
                          >
                            <AgentCard
                              agent={a}
                              isNetwork={g.key === "NETWORK_ORIGINATOR"}
                            />
                          </div>
                        )),
                        g.overflow > 0 ? (
                          <div
                            key={`ov-${g.key}`}
                            style={{ gridRow: 2 }}
                            className="min-w-0"
                          >
                            <OverflowTile
                              count={g.overflow}
                              href={`/agents?type=${g.key}`}
                              label={g.label.replace(/^The /, "")}
                            />
                          </div>
                        ) : null,
                      ].filter(Boolean)
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <ListView
              groups={GROUP_ORDER.map((g) => ({
                meta: g,
                agents: visibleInGroup(g.key),
              })).filter((x) => x.agents.length > 0)}
            />
          )}
        </section>
      </div>
    </div>
  );
}

/* ─── Card ──────────────────────────────────────────────────────────────── */

function AgentCard({
  agent,
  isNetwork,
}: {
  agent: Agent;
  isNetwork: boolean;
}) {
  const subtitle = agentSubtitle(agent, isNetwork);
  return (
    <Link
      href={`/agent/${agent.registryId}`}
      className="group relative flex flex-col h-full border border-mna-white/[0.14] hover:border-mna-white/45 bg-mna-white/[0.015] hover:bg-mna-white/[0.04] transition-colors"
    >
      <div className="relative aspect-square overflow-hidden flex items-center justify-center shrink-0">
        <AgentSignature
          registryId={agent.registryId}
          agentType={agent.agentType}
          constitutionRef={agent.constitutionRef}
          size={220}
          className="text-mna-white/95 w-[86%] h-[86%]"
        />
        <span
          aria-hidden
          className={`absolute top-2 right-2 inline-block w-[6px] h-[6px] rounded-full ${
            agent.status === "ACTIVE"
              ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.65)]"
              : agent.status === "IN_REVIEW"
                ? "bg-amber-400"
                : agent.status === "RETIRED"
                  ? "bg-red-500"
                  : "bg-mna-white/40"
          }`}
        />
      </div>
      <div className="px-2.5 md:px-3 pt-2.5 pb-3 border-t border-mna-white/[0.08] mt-auto">
        <p className="text-[9px] font-sans uppercase tracking-[0.14em] text-mna-white/55 tabular-nums truncate">
          {agent.registryId}
        </p>
        <p className="font-display text-[15px] md:text-[16px] leading-tight text-mna-white truncate mt-0.5">
          {agent.designation || agent.registryId}
        </p>
        <p className="text-[10px] text-mna-white/50 mt-0.5 truncate">
          {subtitle}
        </p>
      </div>
    </Link>
  );
}

/* ─── Overflow tile ─────────────────────────────────────────────────────── */

function OverflowTile({
  count,
  href,
  label,
}: {
  count: number;
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col h-full border border-mna-white/[0.14] hover:border-mna-white/45 bg-mna-white/[0.015] hover:bg-mna-white/[0.04] transition-colors"
    >
      <div className="aspect-square flex items-center justify-center shrink-0">
        <span className="font-display text-[30px] md:text-[34px] text-mna-white/90 leading-none">
          +{count}
        </span>
      </div>
      <div className="px-2.5 md:px-3 pt-2.5 pb-3 border-t border-mna-white/[0.08] mt-auto">
        <p className="text-[9px] font-sans uppercase tracking-[0.14em] text-mna-white/55 tabular-nums truncate">
          —
        </p>
        <p className="font-display text-[15px] md:text-[16px] leading-tight text-mna-white truncate mt-0.5">
          More
        </p>
        <p className="text-[10px] text-mna-white/50 mt-0.5 truncate">
          {label}
        </p>
      </div>
    </Link>
  );
}

/* ─── List view ─────────────────────────────────────────────────────────── */

function ListView({
  groups,
}: {
  groups: { meta: GroupMeta; agents: Agent[] }[];
}) {
  return (
    <div className="space-y-10">
      {groups.map(({ meta, agents }) => (
        <div key={meta.key}>
          <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-mna-white/70 mb-4">
            {meta.label}
          </p>
          <ul className="divide-y divide-mna-white/10 border-y border-mna-white/10">
            {agents.map((a) => (
              <li key={a.registryId}>
                <Link
                  href={`/agent/${a.registryId}`}
                  className="grid grid-cols-[48px_160px_1fr_auto] items-center gap-5 py-3.5 hover:bg-mna-white/5 transition-colors px-2 -mx-2"
                >
                  <span className="relative inline-flex items-center justify-center text-mna-white/85">
                    <AgentSignature
                      registryId={a.registryId}
                      agentType={a.agentType}
                      constitutionRef={a.constitutionRef}
                      size={44}
                    />
                  </span>
                  <span className="text-[11px] font-sans uppercase tracking-[0.16em] text-mna-white/65 tabular-nums truncate">
                    {a.registryId}
                  </span>
                  <span className="font-display text-[17px] text-mna-white truncate">
                    {a.designation || a.registryId}
                  </span>
                  <span className="text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55 inline-flex items-center gap-2">
                    <span
                      className={`inline-block w-[6px] h-[6px] rounded-full ${
                        a.status === "ACTIVE" ? "bg-emerald-500" : "bg-mna-white/40"
                      }`}
                    />
                    {a.status ?? "Active"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ─── Sidebar atoms ─────────────────────────────────────────────────────── */

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-8">
      <p className="text-[10px] font-sans uppercase tracking-[0.24em] text-mna-white/55 mb-3">
        {title}
      </p>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function CheckRow({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className="w-full flex items-center justify-between gap-2 text-left group py-0.5"
      >
        <span className="inline-flex items-center gap-2.5 min-w-0">
          <span
            aria-hidden
            className={`relative w-[11px] h-[11px] border shrink-0 ${
              active
                ? "border-mna-white bg-mna-white"
                : "border-mna-white/30 group-hover:border-mna-white/60"
            }`}
          >
            {active ? (
              <span className="absolute inset-0 flex items-center justify-center text-ink text-[8px] leading-none">
                ✓
              </span>
            ) : null}
          </span>
          <span
            className={`text-[12px] truncate ${
              active ? "text-mna-white" : "text-mna-white/70 group-hover:text-mna-white"
            } transition-colors`}
          >
            {label}
          </span>
        </span>
        <span className="text-[11px] text-mna-white/45 tabular-nums shrink-0">
          {count}
        </span>
      </button>
    </li>
  );
}

function StatusRow({
  label,
  count,
  color,
  active,
  onClick,
}: {
  label: string;
  count: number;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className="w-full flex items-center justify-between gap-2 text-left group py-0.5"
      >
        <span className="inline-flex items-center gap-2.5 min-w-0">
          <span aria-hidden className={`inline-block w-[8px] h-[8px] rounded-full ${color}`} />
          <span
            className={`text-[12px] truncate ${
              active ? "text-mna-white" : "text-mna-white/75 group-hover:text-mna-white"
            } transition-colors`}
          >
            {label}
          </span>
        </span>
        <span className="text-[11px] text-mna-white/45 tabular-nums shrink-0">
          {count}
        </span>
      </button>
    </li>
  );
}

function ViewTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`relative text-[10px] font-sans uppercase tracking-[0.26em] transition-colors pb-2 ${
        active
          ? "text-mna-white"
          : "text-mna-white/50 hover:text-mna-white"
      }`}
    >
      {label}
      {active ? (
        <span
          aria-hidden
          className="absolute left-0 right-0 -bottom-0 h-[1.5px] bg-mna-white"
        />
      ) : null}
    </button>
  );
}
