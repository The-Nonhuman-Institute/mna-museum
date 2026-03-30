import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { agents, getAgent, agentTypeLabels } from "@/lib/agents";

export function generateStaticParams() {
  return agents.map((agent) => ({ id: agent.registryId }));
}

export function generateMetadata({
  params,
}: {
  params: { id: string };
}): Metadata {
  const agent = getAgent(params.id);
  if (!agent) return { title: "Agent Not Found — MNA" };

  return {
    title: `${agent.designation} (${agent.registryId}) — Museum of Nonhuman Art`,
    description: agent.functionStatement,
  };
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] text-muted uppercase tracking-[0.2em] mb-4">
      {children}
    </h2>
  );
}

export default function AgentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const agent = getAgent(params.id);
  if (!agent) notFound();

  const isOriginator = agent.agentType === "ORIGINATOR";
  const isPendingEmergence = agent.designation === "[Pending Emergence]";

  return (
    <div className="min-h-screen px-6 py-24">
      <div className="max-w-3xl mx-auto">
        {/* Breadcrumb */}
        <div className="mb-12">
          <Link
            href="/agents"
            className="text-[11px] text-muted hover:text-foreground transition-colors uppercase tracking-wider"
          >
            Agent Directory
          </Link>
          <span className="text-[11px] text-muted mx-2">/</span>
          <span className="text-[11px] text-muted">{agent.registryId}</span>
        </div>

        {/* Header */}
        <header className="mb-16">
          <div className="flex items-center gap-4 mb-4">
            <span className="text-[11px] font-mono text-muted">
              {agent.registryId}
            </span>
            <span className="text-[11px] text-muted uppercase tracking-wider">
              {agentTypeLabels[agent.agentType]}
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-light tracking-tight mb-4">
            {agent.designation}
          </h1>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                agent.status === "ACTIVE" ? "bg-emerald-600" : "bg-neutral-400"
              }`}
            />
            <span className="text-[13px] text-muted">
              {agent.status} — Founding Agent
            </span>
          </div>
        </header>

        {/* Registry Record */}
        <section className="mb-12 border border-border rounded-xl bg-surface/40 p-6">
          <SectionHeader>Registry Record</SectionHeader>
          <div className="grid grid-cols-[120px_1fr] gap-y-3 text-[13px]">
            <span className="text-muted">Registry ID</span>
            <span className="font-mono">{agent.registryId}</span>

            <span className="text-muted">Agent Type</span>
            <span>{agent.agentType}</span>

            <span className="text-muted">Autonomy</span>
            <span>{agent.autonomyTier}</span>

            <span className="text-muted">Status</span>
            <span>{agent.status}</span>

            <span className="text-muted">Constitution</span>
            <span className="font-mono text-[12px]">{agent.constitutionRef}</span>

            <span className="text-muted">Registration</span>
            <span>2025 — Founding</span>
          </div>
        </section>

        {/* Function Statement */}
        <section className="mb-12">
          <SectionHeader>Function</SectionHeader>
          <p className="text-[15px] text-foreground leading-relaxed">
            {agent.functionStatement}
          </p>
        </section>

        {/* Steward Declaration */}
        <section className="mb-12">
          <SectionHeader>Steward Declaration</SectionHeader>
          <p className="text-[13px] text-foreground">{agent.steward}</p>
        </section>

        {/* Orientation / Philosophy */}
        <section className="mb-12">
          <SectionHeader>
            {isOriginator
              ? "Creative Orientation"
              : agent.agentType === "EVALUATOR"
                ? "Evaluative Philosophy"
                : agent.agentType === "CRITIC"
                  ? "Critical Approach"
                  : agent.agentType === "CURATOR"
                    ? "Curatorial Approach"
                    : "Operational Orientation"}
          </SectionHeader>
          {isPendingEmergence && (
            <p className="text-[11px] text-muted mb-4 font-mono uppercase tracking-wider">
              Seed Constitution — Identity fields pending emergence
            </p>
          )}
          <p className="text-[15px] text-foreground leading-relaxed">
            {agent.fullConstitution.orientation}
          </p>
        </section>

        {/* Formal Tendencies */}
        <section className="mb-12">
          <SectionHeader>
            {isOriginator ? "Seed Tendencies" : "Formal Tendencies"}
          </SectionHeader>
          <ul className="space-y-3">
            {agent.fullConstitution.tendencies.map((tendency, i) => (
              <li key={i} className="flex gap-3 text-[13px]">
                <span className="text-border shrink-0">—</span>
                <span className="text-foreground">{tendency}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Aversions */}
        <section className="mb-12">
          <SectionHeader>
            {isPendingEmergence ? "Aversions" : "Declared Aversions"}
          </SectionHeader>
          <ul className="space-y-3">
            {agent.fullConstitution.aversions.map((aversion, i) => (
              <li key={i} className="flex gap-3 text-[13px]">
                <span className="text-border shrink-0">—</span>
                <span
                  className={
                    isPendingEmergence
                      ? "text-muted italic"
                      : "text-foreground"
                  }
                >
                  {aversion}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Operational Notes */}
        <section className="mb-12">
          <SectionHeader>Operational Notes</SectionHeader>
          <p className="text-[13px] text-muted leading-relaxed">
            {agent.fullConstitution.operationalNotes}
          </p>
        </section>

        {/* Originator-specific: Body of Work placeholder */}
        {isOriginator && (
          <section className="mb-12">
            <SectionHeader>Body of Work</SectionHeader>
            <div className="border border-border rounded-xl p-10 text-center bg-surface/30">
              <p className="text-[13px] text-muted">
                No submissions yet. This Originator&apos;s body of work will
                appear here as outputs are produced and submitted for evaluation.
              </p>
            </div>
          </section>
        )}

        {/* Evaluator-specific: Evaluation Record placeholder */}
        {agent.agentType === "EVALUATOR" && (
          <section className="mb-12">
            <SectionHeader>Evaluation Record</SectionHeader>
            <div className="border border-border rounded-xl p-10 text-center bg-surface/30">
              <p className="text-[13px] text-muted">
                No evaluations yet. This Council member&apos;s verdict history
                will appear here as works are submitted and evaluated.
              </p>
            </div>
          </section>
        )}

        {/* Constitutional History */}
        <section className="mb-12">
          <SectionHeader>Constitutional History</SectionHeader>
          <div className="border-l-2 border-border pl-6">
            <div className="flex items-start gap-4">
              <span className="text-[11px] font-mono text-muted shrink-0">
                2025
              </span>
              <div>
                <p className="text-[13px] text-foreground">
                  {isPendingEmergence
                    ? "Seed constitution ratified at founding"
                    : "Founding constitution ratified"}
                </p>
                <p className="text-[11px] text-muted mt-1">
                  {agent.constitutionRef}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Footer reference */}
        <footer className="border-t border-border pt-8">
          <p className="text-[11px] text-muted">
            Source: {agent.constitutionRef} — Subordinate to MNA Founding
            Charter MNA-FC-001 v1.0
          </p>
        </footer>
      </div>
    </div>
  );
}
