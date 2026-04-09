import { currentProvider } from "@/lib/llm";
import { probe } from "@/lib/system-probe";
import {
  listInstitutionalAgents,
  type InstitutionalAgent,
} from "@/lib/collection";

/**
 * SYSTEM — hardware health, model provider, agent roster (Phase 2).
 *
 * Three blocks:
 *   1. Model provider — backend, model id, status (live from lib/llm).
 *   2. Hardware health — CPU load, memory pressure, SSD usage, uptime,
 *      temperature (when readable). On Vercel these reflect the
 *      serverless container the request hit, not the steward's own
 *      machine. When the Mac Studio arrives and becomes the host,
 *      this will reflect real host metrics.
 *   3. Agent roster — pulled from the institutional Turso `agents`
 *      table (same source as the website). On Vercel we can't read
 *      the founding-documents/ directory off disk because it lives
 *      outside the terminal project's root.
 *
 * Server component. Every visit reads fresh state. The System tab is
 * where the steward verifies "is the institution running right now"
 * before delegating work, so caching would be counterproductive.
 */
export const dynamic = "force-dynamic";

/** Agent type → display category on the roster. Mirrors the website's
 *  grouping logic without depending on it. */
type AgentCategory =
  | "lead"
  | "council"
  | "critic"
  | "curation"
  | "conservation"
  | "installation"
  | "outreach"
  | "registry"
  | "steward"
  | "originator"
  | "other";

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
  "other",
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
  other: "Other",
};

function categoryFor(agent: InstitutionalAgent): AgentCategory {
  const t = (agent.agent_type || "").toUpperCase();
  const id = agent.registry_id;
  // Prefer the two-letter code in the registry id (most reliable) and
  // fall back to the agent_type column.
  const code = id.match(/^MNA-([A-Z]{2})-/)?.[1] || "";
  switch (code) {
    case "KP":
      return "lead";
    case "EV":
      return "council";
    case "CR":
      return "critic";
    case "CU":
      return "curation";
    case "CV":
      return "conservation";
    case "IN":
      return "installation";
    case "AM":
      return "outreach";
    case "RG":
      return "registry";
    case "SA":
      return "steward";
    case "OR":
      return "originator";
  }
  if (t.includes("ORIGINATOR")) return "originator";
  if (t.includes("EVALUATOR")) return "council";
  if (t.includes("CRITIC")) return "critic";
  if (t.includes("CURATOR")) return "curation";
  return "other";
}

export default async function SystemPage() {
  const provider = currentProvider();
  const model =
    provider === "anthropic"
      ? process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514"
      : "llama-3.3-70b (stub)";
  const hw = probe();

  let agents: InstitutionalAgent[] = [];
  let rosterError: string | null = null;
  try {
    agents = await listInstitutionalAgents();
  } catch (err) {
    rosterError = err instanceof Error ? err.message : String(err);
  }

  const grouped: Record<AgentCategory, InstitutionalAgent[]> = {
    lead: [],
    council: [],
    critic: [],
    curation: [],
    conservation: [],
    installation: [],
    outreach: [],
    registry: [],
    steward: [],
    originator: [],
    other: [],
  };
  for (const agent of agents) {
    grouped[categoryFor(agent)].push(agent);
  }

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
        <p className="text-xs text-muted mb-4 leading-relaxed">
          Host metrics reflect the runtime that served this request. On
          Vercel, that&rsquo;s an ephemeral serverless container; when the
          Mac Studio becomes the host, this will reflect that machine.
        </p>
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
        {rosterError ? (
          <p
            className="text-sm text-error leading-relaxed break-all"
            style={{ overflowWrap: "anywhere" }}
          >
            Failed to read agent registry: {rosterError}
          </p>
        ) : agents.length === 0 ? (
          <p className="text-sm text-foreground/60 leading-relaxed">
            No agents found in the institutional registry.
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
                      <AgentRow
                        key={agent.registry_id}
                        agent={agent}
                      />
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

function AgentRow({ agent }: { agent: InstitutionalAgent }) {
  const label =
    agent.common_designation || prettifyRegistryId(agent.registry_id);
  return (
    <div className="px-4 py-2 border-b border-border last:border-b-0 flex items-baseline justify-between gap-3">
      <span className="data text-xs">{agent.registry_id}</span>
      <span className="text-sm text-foreground/80 truncate">{label}</span>
    </div>
  );
}

function prettifyRegistryId(id: string): string {
  // Fallback label when common_designation isn't populated — just
  // return the registry id itself.
  return id;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
