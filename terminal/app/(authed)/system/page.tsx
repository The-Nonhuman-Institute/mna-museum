/**
 * SYSTEM — hardware health, model provider status, agent roster.
 *
 * Phase 2 build (with FEED — these two tabs together are the MVP that
 * lets the terminal be a useful operator tool even before Keeper chat
 * exists).
 *
 * Hardware block: CPU load, memory pressure, SSD usage, network
 * throughput, temperature — read from node:os + system commands on
 * Mac Studio (stubbed on Intel MBP for now).
 *
 * Model provider block: current backend (Anthropic vs Ollama), active
 * model, token/cost accumulator for the current day.
 *
 * Agent roster: list of institutional agents with live/idle/running
 * state. Tapping an agent opens its detail view with mandate, recent
 * activity, current task status.
 */
import { currentProvider } from "@/lib/llm";

export default function SystemPage() {
  const provider = currentProvider();
  const model =
    provider === "anthropic"
      ? process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514"
      : "llama-3.3-70b (stub)";

  return (
    <section className="px-5 py-6">
      <div className="mb-8">
        <p className="label mb-2">Infrastructure</p>
        <h1 className="display text-3xl">System</h1>
      </div>

      {/* Model provider — the one thing the terminal can show on day 1
          without any additional data collection. */}
      <div className="border border-border p-5 mb-5">
        <p className="label mb-4">Model Provider</p>
        <dl className="space-y-3">
          <div className="flex justify-between items-baseline">
            <dt className="label">Backend</dt>
            <dd className="data uppercase">{provider}</dd>
          </div>
          <div className="flex justify-between items-baseline">
            <dt className="label">Model</dt>
            <dd className="data">{model}</dd>
          </div>
          <div className="flex justify-between items-baseline">
            <dt className="label">Status</dt>
            <dd className="data flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full bg-active"
                aria-hidden
              />
              Ready
            </dd>
          </div>
        </dl>
      </div>

      {/* Hardware — stubbed until Phase 2 wires node:os */}
      <div className="border border-border p-5 mb-5">
        <p className="label mb-3">Hardware Health</p>
        <p className="text-sm text-foreground/60 leading-relaxed">
          Phase 2 · Will populate CPU load, memory pressure, SSD usage,
          network throughput, and temperature from{" "}
          <code className="font-mono text-xs">node:os</code> and{" "}
          <code className="font-mono text-xs">system_profiler</code>{" "}
          probes. On Mac Studio M4 Max this also shows unified memory
          usage and GPU core temperature.
        </p>
      </div>

      {/* Agent roster — stubbed */}
      <div className="border border-border p-5">
        <p className="label mb-3">Agent Roster</p>
        <p className="text-sm text-foreground/60 leading-relaxed">
          Phase 2 · Will show all institutional agents with live / idle /
          running state. Tapping an agent opens its detail view with
          mandate, recent activity, and current task status.
        </p>
      </div>
    </section>
  );
}
