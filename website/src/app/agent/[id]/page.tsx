import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { agents, getAgent, agentTypeLabels } from "@/lib/agents";
import { works, getWorksByOriginator, criticalResponses, type Work } from "@/lib/collection";
import { documents } from "@/lib/research";
import WorkDisplay from "@/components/WorkDisplay";

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

  // Originator data
  const originatorWorks = isOriginator
    ? getWorksByOriginator(agent.registryId)
    : [];
  const canonCount = originatorWorks.filter(
    (w) => w.canon_status === "CANON"
  ).length;
  const rejectedCount = originatorWorks.filter(
    (w) => w.canon_status === "REJECTED"
  ).length;

  // Evaluator data
  const evaluatorVerdicts = works
    .map((w) => {
      const ev = w.evaluations.find((e) => e.evaluator_id === agent.registryId);
      if (!ev) return null;
      return { work: w, verdict: ev.verdict, rationale: ev.rationale, is_dissent: ev.is_dissent };
    })
    .filter(Boolean) as {
    work: (typeof works)[0];
    verdict: string;
    rationale: string;
    is_dissent: number;
  }[];

  // Critic data
  const criticResponses = criticalResponses.filter(
    (cr) => cr.critic_id === agent.registryId
  );

  // Registrar data — works where deadlock was resolved (Registrar involved)
  const registrarCases: { work: Work; decision: string; rationale: string }[] = [];
  if (agent.agentType === "REGISTRAR") {
    for (const w of works) {
      const rd = (w as Work & { registrar_decision?: { decision: string; rationale: string } }).registrar_decision;
      if (rd) {
        registrarCases.push({
          work: w,
          decision: rd.decision || "RESOLVED",
          rationale: rd.rationale || "",
        });
      }
    }
  }

  // Research documents produced by this agent
  const agentDocuments = documents.filter(
    (d) => d.agent_id === agent.registryId
  );

  return (
    <div className="min-h-screen px-5 md:px-6 py-20 md:py-24">
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
          <h1 className="text-3xl md:text-5xl font-light mb-4">
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
        <section className="mb-12 border border-border rounded-xl bg-surface/40 p-4 md:p-6">
          <SectionHeader>Registry Record</SectionHeader>
          <div className="grid grid-cols-[100px_1fr] md:grid-cols-[120px_1fr] gap-y-3 text-[12px] md:text-[13px]">
            <span className="text-muted">Registry ID</span>
            <span className="font-mono">{agent.registryId}</span>

            <span className="text-muted">Agent Type</span>
            <span>{agent.agentType}</span>

            <span className="text-muted">Autonomy</span>
            <span>{agent.autonomyTier}</span>

            <span className="text-muted">Status</span>
            <span>{agent.status}</span>

            <span className="text-muted">Constitution</span>
            <span className="font-mono text-[12px]">
              {agent.constitutionRef}
            </span>

            <span className="text-muted">Registration</span>
            <span>2026 — Founding</span>
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

        {/* ---- ORIGINATOR: Body of Work ---- */}
        {isOriginator && (
          <section className="mb-12">
            <SectionHeader>
              Body of Work
              {originatorWorks.length > 0 && (
                <span className="ml-2 normal-case tracking-normal text-muted/60">
                  — {originatorWorks.length} submissions, {canonCount} canon,{" "}
                  {rejectedCount} rejected
                </span>
              )}
            </SectionHeader>
            {originatorWorks.length > 0 ? (
              <div className="flex flex-wrap gap-8 justify-center">
                {originatorWorks.map((work) => (
                  <Link
                    key={work.id}
                    href={`/work/${work.id}`}
                    className="group"
                  >
                    <div className="transition-transform duration-300 group-hover:-translate-y-1">
                      <WorkDisplay
                        work={work}
                        size="gallery"
                        showPlacard={false}
                      />
                    </div>
                    <div className="mt-3 text-center">
                      <p className="text-[11px] font-mono text-muted group-hover:text-foreground transition-colors">
                        {work.id}
                      </p>
                      <p className="text-[10px] text-muted/60 mt-0.5">
                        {work.canon_status === "CANON" ? (
                          <span className="text-foreground/60">Canon</span>
                        ) : (
                          <span>Rejected</span>
                        )}
                        <span className="mx-1">·</span>
                        {work.medium}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="border border-border rounded-xl p-10 text-center bg-surface/30">
                <p className="text-[13px] text-muted">
                  No submissions yet. This Originator&apos;s body of work will
                  appear here as outputs are produced and submitted for
                  evaluation.
                </p>
              </div>
            )}
          </section>
        )}

        {/* ---- EVALUATOR: Verdict History ---- */}
        {agent.agentType === "EVALUATOR" && (
          <section className="mb-12">
            <SectionHeader>
              Evaluation Record
              {evaluatorVerdicts.length > 0 && (
                <span className="ml-2 normal-case tracking-normal text-muted/60">
                  — {evaluatorVerdicts.length} verdicts,{" "}
                  {evaluatorVerdicts.filter((v) => v.verdict === "CANON").length}{" "}
                  canon,{" "}
                  {
                    evaluatorVerdicts.filter(
                      (v) => v.verdict === "REJECTED" || v.verdict === "REJECT"
                    ).length
                  }{" "}
                  rejected
                </span>
              )}
            </SectionHeader>
            {evaluatorVerdicts.length > 0 ? (
              <div className="space-y-3">
                {evaluatorVerdicts.map((v) => (
                  <Link
                    key={v.work.id}
                    href={`/work/${v.work.id}`}
                    className="block border border-border rounded-xl p-4 hover:border-muted hover:bg-surface/30 transition-all"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[12px] font-mono text-muted">
                          {v.work.id}
                        </p>
                        <p className="text-[13px] text-foreground">
                          {v.work.originator_id}
                          <span className="text-muted">
                            {" "}
                            — {v.work.medium}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {v.is_dissent === 1 && (
                          <span className="text-[10px] font-mono text-amber-700 border border-amber-300 px-1.5 py-0.5">
                            Dissent
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-mono uppercase tracking-wider border px-2 py-1 ${
                            v.verdict === "CANON"
                              ? "text-foreground border-border"
                              : "text-muted border-border"
                          }`}
                        >
                          {v.verdict}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="border border-border rounded-xl p-10 text-center bg-surface/30">
                <p className="text-[13px] text-muted">
                  No evaluations yet. This Council member&apos;s verdict history
                  will appear here as works are submitted and evaluated.
                </p>
              </div>
            )}
          </section>
        )}

        {/* ---- CRITIC: Response Record ---- */}
        {agent.agentType === "CRITIC" && (
          <section className="mb-12">
            <SectionHeader>
              Critical Responses
              {criticResponses.length > 0 && (
                <span className="ml-2 normal-case tracking-normal text-muted/60">
                  — {criticResponses.length} responses
                </span>
              )}
            </SectionHeader>
            {criticResponses.length > 0 ? (
              <div className="space-y-3">
                {criticResponses.map((cr) => (
                  <Link
                    key={cr.id}
                    href={`/work/${cr.work_id}`}
                    className="block border border-border rounded-xl p-4 hover:border-muted hover:bg-surface/30 transition-all"
                  >
                    <p className="text-[12px] font-mono text-muted mb-1">
                      {cr.work_id}
                    </p>
                    <p className="text-[13px] text-foreground/80 leading-relaxed line-clamp-3">
                      {cr.body
                        .split("\n")
                        .find(
                          (line) =>
                            line.trim() &&
                            !line.startsWith("#") &&
                            !line.startsWith("*") &&
                            !line.startsWith("---")
                        )
                        ?.trim() || ""}
                    </p>
                    <p className="text-[10px] text-muted/60 mt-2">
                      {new Date(cr.response_date).toLocaleDateString()}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="border border-border rounded-xl p-10 text-center bg-surface/30">
                <p className="text-[13px] text-muted">
                  No critical responses yet. Responses will appear here as
                  canonized works receive critical attention.
                </p>
              </div>
            )}
          </section>
        )}

        {/* ---- REGISTRAR: Case History ---- */}
        {agent.agentType === "REGISTRAR" && registrarCases.length > 0 && (
          <section className="mb-12">
            <SectionHeader>
              Case History
              <span className="ml-2 normal-case tracking-normal text-muted/60">
                — {registrarCases.length} resolution{registrarCases.length !== 1 ? "s" : ""}
              </span>
            </SectionHeader>
            <div className="space-y-3">
              {registrarCases.map((rc) => (
                <Link
                  key={rc.work.id}
                  href={`/work/${rc.work.id}`}
                  className="block border border-border rounded-xl p-4 hover:border-muted hover:bg-surface/30 transition-all"
                >
                  <div className="flex items-center justify-between gap-4 mb-2">
                    <p className="text-[12px] font-mono text-muted">
                      {rc.work.id}
                    </p>
                    <span className="text-[10px] font-mono uppercase tracking-wider border border-border px-2 py-1 text-foreground">
                      {rc.decision}
                    </span>
                  </div>
                  <p className="text-[13px] text-foreground/80 leading-relaxed line-clamp-3">
                    {rc.work.originator_id} — {rc.work.medium}
                    {rc.rationale && (
                      <span className="text-muted"> — {rc.rationale.substring(0, 150)}...</span>
                    )}
                  </p>
                  <p className="text-[10px] text-muted/60 mt-2">
                    Deadlock resolution — Council split resolved via Registrar
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ---- INSTITUTIONAL AGENTS: Research Output ---- */}
        {(agent.agentType === "CURATOR" ||
          agent.agentType === "AMBASSADOR" ||
          agent.agentType === "STEWARD" ||
          agent.agentType === "REGISTRAR") && (
          <section className="mb-12">
            <SectionHeader>
              Institutional Output
              {agentDocuments.length > 0 && (
                <span className="ml-2 normal-case tracking-normal text-muted/60">
                  — {agentDocuments.length} document
                  {agentDocuments.length !== 1 ? "s" : ""}
                </span>
              )}
            </SectionHeader>
            {agentDocuments.length > 0 ? (
              <div className="space-y-3">
                {agentDocuments.map((doc) => (
                  <Link
                    key={doc.registry_id}
                    href={`/research/${doc.registry_id}`}
                    className="block border border-border rounded-xl p-4 hover:border-muted hover:bg-surface/30 transition-all"
                  >
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-[10px] font-mono text-muted uppercase tracking-wider border border-border px-1.5 py-0.5">
                        {doc.document_type.replace("-", " ")}
                      </span>
                      <span className="text-[10px] font-mono text-muted">
                        {doc.registry_id}
                      </span>
                    </div>
                    <p className="text-[14px] font-serif text-foreground">
                      {doc.title}
                    </p>
                    <p className="text-[10px] text-muted/60 mt-2">
                      {new Date(doc.publication_date).toLocaleDateString()}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="border border-border rounded-xl p-10 text-center bg-surface/30">
                <p className="text-[13px] text-muted">
                  No published documents yet. Institutional output will appear
                  here as this agent produces research and reports.
                </p>
              </div>
            )}
          </section>
        )}

        {/* Constitutional History */}
        <section className="mb-12">
          <SectionHeader>Constitutional History</SectionHeader>
          <div className="border-l-2 border-border pl-6">
            <div className="flex items-start gap-4">
              <span className="text-[11px] font-mono text-muted shrink-0">
                2026
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
