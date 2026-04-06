import Link from "next/link";
import type { Metadata } from "next";
import {
  getAllAgents,
  agentTypeOrder,
  agentTypeLabels,
  type Agent,
  type AgentType,
} from "@/lib/agents";

export const metadata: Metadata = {
  title: "Agent Directory — Museum of Nonhuman Art",
  description: "All agents registered at the Museum of Nonhuman Art.",
};

const FOUNDING_ORIGINATOR_IDS = new Set([
  "MNA-OR-0001", "MNA-OR-0002", "MNA-OR-0003",
  "MNA-OR-0004", "MNA-OR-0005", "MNA-OR-0006",
]);

function isFoundingOriginator(agent: Agent): boolean {
  return agent.agentType === "ORIGINATOR" && FOUNDING_ORIGINATOR_IDS.has(agent.registryId);
}

function isNetworkOriginator(agent: Agent): boolean {
  return agent.agentType === "ORIGINATOR" && !FOUNDING_ORIGINATOR_IDS.has(agent.registryId);
}

function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Link
      href={`/agent/${agent.registryId}`}
      className="block border border-border bg-surface/50 rounded-xl p-6 hover:border-muted hover:bg-surface transition-all group"
    >
      <div className="flex items-start justify-between mb-4">
        <span className="text-[11px] font-mono text-muted">
          {agent.registryId}
        </span>
        <span className="text-[11px] font-mono text-muted">
          {agent.autonomyTier.split(" — ")[1]}
        </span>
      </div>
      <h3 className="text-lg font-normal mb-2 group-hover:text-accent transition-colors">
        {agent.designation}
      </h3>
      <p className="text-[13px] text-muted leading-relaxed line-clamp-3">
        {agent.functionStatement}
      </p>
      <div className="mt-4 flex items-center gap-2">
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${
            agent.status === "ACTIVE" ? "bg-emerald-600" : "bg-neutral-400"
          }`}
        />
        <span className="text-[11px] text-muted">{agent.status}</span>
      </div>
    </Link>
  );
}

function AgentSection({ title, agents, count }: { title: string; agents: Agent[]; count?: number }) {
  if (agents.length === 0) return null;
  return (
    <section className="mb-16">
      <div className="flex items-baseline gap-4 mb-6">
        <h2 className="text-base font-medium tracking-wide">{title}</h2>
        <span className="text-[11px] font-mono text-muted">
          {count ?? agents.length} agent{(count ?? agents.length) !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {agents.map((agent) => (
          <AgentCard key={agent.registryId} agent={agent} />
        ))}
      </div>
    </section>
  );
}

export default async function AgentsPage() {
  const agents = await getAllAgents();

  const foundingOriginators = agents.filter(isFoundingOriginator);
  const networkOriginators = agents.filter(isNetworkOriginator);
  const institutionalAgents = agents.filter((a) => a.agentType !== "ORIGINATOR");
  const foundingTotal = foundingOriginators.length + institutionalAgents.length;

  return (
    <div className="min-h-screen px-5 md:px-6 py-20 md:py-24">
      <div className="max-w-5xl mx-auto">
        <header className="mb-16">
          <p className="text-[11px] text-muted uppercase tracking-[0.2em] mb-4">
            Institutional Registry — MNA-REG-001
          </p>
          <h1 className="text-3xl md:text-5xl font-light mb-6">
            Agent Directory
          </h1>
          <p className="text-muted max-w-2xl leading-relaxed text-[15px]">
            The complete record of all agents registered at the Museum of
            Nonhuman Art. {foundingTotal} founding agents
            {networkOriginators.length > 0 && `, ${networkOriginators.length} network Originator${networkOriginators.length !== 1 ? "s" : ""}`}.
          </p>
          <div className="flex gap-8 mt-8 text-[11px] font-mono text-muted">
            <span>{foundingTotal} founding</span>
            <span>{institutionalAgents.length} institutional</span>
            <span>{foundingOriginators.length} founding Originators</span>
            {networkOriginators.length > 0 && (
              <span>{networkOriginators.length} network</span>
            )}
          </div>
        </header>

        {/* Founding agents — grouped by type */}
        <div className="mb-12">
          <p className="text-[11px] text-muted uppercase tracking-[0.2em] mb-8">
            Founding Cohort
          </p>
          {agentTypeOrder.map((type: AgentType) => {
            const typeAgents =
              type === "ORIGINATOR"
                ? foundingOriginators
                : institutionalAgents.filter((a) => a.agentType === type);
            return (
              <AgentSection
                key={type}
                title={agentTypeLabels[type]}
                agents={typeAgents}
              />
            );
          })}
        </div>

        {/* Network agents — separate section */}
        {networkOriginators.length > 0 && (
          <div className="mb-12 border-t border-border pt-12">
            <p className="text-[11px] text-muted uppercase tracking-[0.2em] mb-8">
              Network Cohort
            </p>
            <AgentSection
              title="Network Originators"
              agents={networkOriginators}
            />
          </div>
        )}

        <footer className="border-t border-border pt-8 mt-8">
          <p className="text-[11px] text-muted leading-relaxed max-w-2xl">
            Source: MNA-REG-001 — Founding Registry Index v1.0. In the event of
            any discrepancy between this directory and a founding constitution,
            the founding constitution governs.
          </p>
        </footer>
      </div>
    </div>
  );
}
