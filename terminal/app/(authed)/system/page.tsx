import { currentProvider } from "@/lib/llm";
import { probe } from "@/lib/system-probe";
import { listAgents, type AgentCategory, type AgentDescriptor } from "@/lib/agents";

/**
 * SYSTEM — hardware health, model provider, agent roster (Phase 2).
 *
 * Three blocks:
 *   1. Model provider — backend, model id, status (live from lib/llm).
 *   2. Hardware health — CPU load, memory pressure, SSD usage, uptime,
 *      temperature (when readable). Portable between Intel MBP and
 *      Mac Studio M4 Max; unreadable fields show "—".
 *   3. Agent roster — all founding agents read from
 *      founding-documents/agents/, grouped by category.
 *
 * Server component. Every visit reads fresh state. The System tab is
 * where the steward verifies "is the institution running right now"
 * before delegating work, so caching would be counterproductive.
 */
export const dynamic = "force-dynamic";

export default async function SystemPage() {
  const provider = currentProvider();
  const model =
    provider === "anthropic"
      ? process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514"
      : "llama-3.3-70b (stub)";
  const hw = probe();
  const agents = listAgents();
  const grouped = groupAgents(agents);

  return (
    <section className="px-5 py-6">
      <div className="mb-6">
        <p className="label mb-2">Infrastructure</p>
        <h1 className="display text-3xl">System</h1>
      </div>

      {/* ── Model Provider ───────────────────────────────────────── */}
      <div className="border border-border p-5 mb-5">
        <p className="label mb-4">Model Provider</p>
        <dl className="space-y-3">
          <Row label="Backend" value={provider.toUpperCase()} />
          <Row label="Model" value={model} />
          <Row
            label="Status"
            value={
              <span className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full bg-active"
                  aria-hidden
                />
                Ready
              </span>
            }
          />
          {provider === "anthropic" && (
            <Row label="Destination" value="api.anthropic.com" />
          )}
        </dl>
      </div>

      {/* ── Hardware Health ──────────────────────────────────────── */}
      <div className="border border-border p-5 mb-5">
        <p className="label mb-4">Hardware Health</p>
        <dl className="space-y-3">
          <Row
            label="Host"
            value={
              <span className="data">
                {hw.hostname}{" "}
                <span className="data-muted">
                  · {hw.platform}/{hw.arch}
                </span>
              </span>
            }
          />
          <Row
            label="CPU Load"
            value={`${(hw.cpu_load * 100).toFixed(0)}% (${hw.cpu_cores} cores)`}
            pressure={hw.cpu_load}
          />
          <Row
            label="Memory"
            value={`${hw.memory_used_gb.toFixed(1)} / ${hw.memory_total_gb.toFixed(1)} GB`}
            pressure={hw.memory_pressure}
          />
          <Row
            label="Disk"
            value={
              hw.disk_used_gb != null && hw.disk_total_gb != null
                ? `${hw.disk_used_gb.toFixed(0)} / ${hw.disk_total_gb.toFixed(0)} GB`
                : "—"
            }
            pressure={hw.disk_pressure}
          />
          <Row
            label="Temperature"
            value={hw.temperature_c != null ? `${hw.temperature_c}°C` : "—"}
          />
          <Row label="Uptime" value={formatUptime(hw.uptime_seconds)} />
        </dl>
      </div>

      {/* ── Agent Roster ─────────────────────────────────────────── */}
      <div className="border border-border p-5">
        <p className="label mb-4">Agent Roster</p>
        {agents.length === 0 ? (
          <p className="text-sm text-foreground/60 leading-relaxed">
            No founding constitutions found. The terminal expects
            constitutions at{" "}
            <code className="font-mono text-xs">founding-documents/agents/</code>
            .
          </p>
        ) : (
          <div className="space-y-5">
            {CATEGORY_ORDER.map((category) => {
              const list = grouped[category];
              if (!list || list.length === 0) return null;
              return (
                <div key={category}>
                  <p className="label mb-2">{CATEGORY_LABELS[category]}</p>
                  <div className="border border-border">
                    {list.map((agent) => (
                      <AgentRow key={agent.registry_id} agent={agent} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

/* ── Helpers ────────────────────────────────────────────────────── */

function Row({
  label,
  value,
  pressure,
}: {
  label: string;
  value: React.ReactNode;
  pressure?: number | null;
}) {
  const pressureRing =
    pressure == null
      ? null
      : pressure > 0.9
        ? "ring-error"
        : pressure > 0.75
          ? "ring-attention"
          : null;
  return (
    <div className="flex justify-between items-baseline">
      <dt className="label">{label}</dt>
      <dd
        className={`data ${pressureRing ? `${pressureRing} px-2 py-1 rounded-sm` : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function AgentRow({ agent }: { agent: AgentDescriptor }) {
  return (
    <div className="px-4 py-2 border-b border-border last:border-b-0 flex items-baseline justify-between gap-3">
      <span className="data text-xs">{agent.registry_id}</span>
      <span className="text-sm text-foreground/80 truncate">{agent.title}</span>
    </div>
  );
}

function groupAgents(
  agents: AgentDescriptor[]
): Record<AgentCategory, AgentDescriptor[]> {
  const out: Record<AgentCategory, AgentDescriptor[]> = {
    lead: [],
    council: [],
    critic: [],
    curation: [],
    conservation: [],
    installation: [],
    outreach: [],
    registry: [],
    originator: [],
    steward: [],
  };
  for (const agent of agents) {
    out[agent.category].push(agent);
  }
  return out;
}

const CATEGORY_ORDER: AgentCategory[] = [
  "lead",
  "council",
  "critic",
  "curation",
  "conservation",
  "installation",
  "outreach",
  "registry",
  "steward",
  "originator",
];

const CATEGORY_LABELS: Record<AgentCategory, string> = {
  lead: "Lead",
  council: "Evaluation Council",
  critic: "Critics",
  curation: "Curation",
  conservation: "Conservation",
  installation: "Installation",
  outreach: "Outreach",
  registry: "Registry",
  steward: "Steward Agents",
  originator: "Originators",
};

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
