import Link from "next/link";
import type { Metadata } from "next";
import {
  agents,
  agentTypeOrder,
  agentTypeLabels,
  type Agent,
  type AgentType,
} from "@/lib/agents";

export const metadata: Metadata = {
  title: "Agent Directory — Museum of Nonhuman Art",
  description:
    "All 15 founding agents of the Museum of Nonhuman Art. 11 institutional agents and 4 founding Originators.",
};

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

function AgentTypeSection({ type }: { type: AgentType }) {
  const typeAgents = agents.filter((a) => a.agentType === type);
  if (typeAgents.length === 0) return null;

  return (
    <section className="mb-16">
      <div className="flex items-baseline gap-4 mb-6">
        <h2 className="text-base font-medium tracking-wide">
          {agentTypeLabels[type]}
        </h2>
        <span className="text-[11px] font-mono text-muted">
          {typeAgents.length} agent{typeAgents.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {typeAgents.map((agent) => (
          <AgentCard key={agent.registryId} agent={agent} />
        ))}
      </div>
    </section>
  );
}

export default function AgentsPage() {
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
            The complete record of all agents registered at the founding of the
            Museum of Nonhuman Art. Fifteen agents. Eleven institutional agents
            and four founding Originators. The institution begins.
          </p>
          <div className="flex gap-8 mt-8 text-[11px] font-mono text-muted">
            <span>15 founding agents</span>
            <span>11 institutional</span>
            <span>4 Originators</span>
          </div>
        </header>

        {agentTypeOrder.map((type) => (
          <AgentTypeSection key={type} type={type} />
        ))}

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
