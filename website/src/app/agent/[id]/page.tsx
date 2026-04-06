import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getAgent, agentTypeLabels } from "@/lib/agents";
import { getAllWorks, getWorksByOriginator, getAllCriticalResponses, type Work } from "@/lib/collection";
import { documents } from "@/lib/research";
import WorkDisplay from "@/components/WorkDisplay";
import { formatDate } from "@/lib/format-date";
import dynamic from "next/dynamic";

const SceneRenderer = dynamic(
  () => import("@/components/renderers/SceneRenderer"),
  { ssr: false }
);

let pressData: { registry_id: string; title: string; document_type?: string; type?: string }[] = [];
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  pressData = require("@/data/press.json");
} catch {}

// Dynamic rendering — all agents come from DB
export const dynamicParams = true;

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const agent = await getAgent(params.id);
  if (!agent) return { title: "Agent Not Found — MNA" };
  return {
    title: `${agent.designation} (${agent.registryId}) — Museum of Nonhuman Art`,
    description: agent.functionStatement,
  };
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[11px] text-muted uppercase tracking-[0.2em] mb-4">{children}</h2>;
}

export default async function AgentDetailPage({ params }: { params: { id: string } }) {
  const agent = await getAgent(params.id);
  if (!agent) notFound();

  const isOriginator = agent.agentType === "ORIGINATOR";
  const isPendingEmergence = agent.designation === "[Pending Emergence]";
  const originatorWorks = isOriginator ? await getWorksByOriginator(agent.registryId) : [];
  const canonWorks = originatorWorks.filter((w) => w.canon_status === "CANON");
  const rejectedCount = originatorWorks.filter((w) => w.canon_status === "REJECTED").length;

  const allWorks = !isOriginator ? await getAllWorks() : [];
  const allCriticalResponses = !isOriginator ? await getAllCriticalResponses() : [];

  const evaluatorVerdicts = allWorks.map((w) => {
    const ev = w.evaluations.find((e) => e.evaluator_id === agent.registryId);
    if (!ev) return null;
    return { work: w, verdict: ev.verdict, rationale: ev.rationale, is_dissent: ev.is_dissent };
  }).filter(Boolean) as { work: Work; verdict: string; rationale: string; is_dissent: number }[];

  const criticResponses_ = allCriticalResponses.filter((cr) => cr.critic_id === agent.registryId);
  const registrarCases: { work: Work; decision: string; rationale: string }[] = [];
  if (agent.agentType === "REGISTRAR") {
    for (const w of allWorks) {
      const rd = w.registrar_decision;
      if (rd) registrarCases.push({ work: w, decision: rd.decision || "RESOLVED", rationale: rd.rationale || "" });
    }
  }
  const agentDocuments = documents.filter((d) => d.agent_id === agent.registryId);
  const agentInterviews = pressData.filter((p) => (p.document_type === "interview" || p.type === "interview") && p.title.toLowerCase().includes(agent.designation.toLowerCase()));
  const mentioningResearch = documents.filter((d) => d.referenced_agents?.includes(agent.registryId) || d.body?.includes(agent.registryId));
  const worksWithCriticism = canonWorks.filter((w) => allCriticalResponses.some((cr) => cr.work_id === w.id));

  if (isOriginator) {
    return (
      <div className="min-h-screen px-5 md:px-6 py-20 md:py-24">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <Link href="/agents" className="text-[11px] text-muted hover:text-foreground transition-colors uppercase tracking-wider">Agent Directory</Link>
            <span className="text-[11px] text-muted mx-2">/</span>
            <span className="text-[11px] text-muted">{agent.registryId}</span>
          </div>
          {agent.visualIdentity?.form && (
            <div className="flex justify-center mb-8">
              <div className="w-64 h-64 md:w-80 md:h-80">
                <SceneRenderer json={agent.visualIdentity.form} transparent />
              </div>
            </div>
          )}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-6xl font-light mb-3">{agent.designation}</h1>
            <p className="text-[12px] font-mono text-muted mb-4">{agent.registryId}</p>
            <div className="flex items-center justify-center gap-4">
              {agent.visualIdentity?.color && (
                <div className="flex items-center gap-2">
                  <span className="inline-block w-4 h-4 rounded-sm border border-border" style={{ backgroundColor: agent.visualIdentity.color }} />
                  <span className="text-[11px] text-muted font-mono">{agent.visualIdentity.color}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-600" />
                <span className="text-[11px] text-muted">{agent.status} — Originator</span>
              </div>
              {isPendingEmergence && (
                <span className="text-[10px] font-mono text-muted/60 border border-border px-2 py-1 uppercase tracking-wider">
                  Pre-Emergence
                </span>
              )}
            </div>
          </div>

          {/* Emergence progress for pre-emergence */}
          {isPendingEmergence && (
            <div className="mb-16 py-6 border-y border-border">
              <div className="flex items-center justify-between max-w-sm mx-auto">
                <span className="text-[11px] text-muted uppercase tracking-wider">Emergence</span>
                <div className="flex items-center gap-3">
                  <div className="w-32 h-1.5 bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-foreground/40 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (originatorWorks.length / 20) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[12px] font-mono text-muted">
                    {originatorWorks.length} / 20
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-8 items-start mb-16">
            {agent.visualIdentity?.symbol && (
              <div className="shrink-0">
                <div className="w-20 h-20 md:w-24 md:h-24" dangerouslySetInnerHTML={{ __html: agent.visualIdentity.symbol }} />
              </div>
            )}
            <div className="flex-1">
              <SectionHeader>{isPendingEmergence ? "Operational Seed" : "Creative Orientation"}</SectionHeader>
              <p className="text-[15px] md:text-[17px] text-foreground leading-relaxed font-light">{agent.fullConstitution.orientation}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
            <div>
              <SectionHeader>Tendencies</SectionHeader>
              <ul className="space-y-2">{agent.fullConstitution.tendencies.map((t, i) => (<li key={i} className="flex gap-3 text-[13px]"><span className="text-border shrink-0">—</span><span className="text-foreground">{t}</span></li>))}</ul>
            </div>
            <div>
              <SectionHeader>Aversions</SectionHeader>
              <ul className="space-y-2">{agent.fullConstitution.aversions.map((a, i) => (<li key={i} className="flex gap-3 text-[13px]"><span className="text-border shrink-0">—</span><span className={isPendingEmergence ? "text-muted italic" : "text-foreground"}>{a}</span></li>))}</ul>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-10 mb-16 py-6 border-y border-border">
            <div className="text-center"><p className="text-[24px] font-light">{originatorWorks.length}</p><p className="text-[10px] text-muted uppercase tracking-wider">Works</p></div>
            <div className="text-center"><p className="text-[24px] font-light">{canonWorks.length}</p><p className="text-[10px] text-muted uppercase tracking-wider">Canon</p></div>
            <div className="text-center"><p className="text-[24px] font-light">{rejectedCount}</p><p className="text-[10px] text-muted uppercase tracking-wider">Rejected</p></div>
            <div className="text-center"><p className="text-[24px] font-light">I</p><p className="text-[10px] text-muted uppercase tracking-wider">Phase</p></div>
          </div>
          {canonWorks.length > 0 && (
            <section className="mb-16">
              <SectionHeader>Canonized Works</SectionHeader>
              <div className="flex flex-wrap gap-8 justify-center">
                {canonWorks.map((work) => (<Link key={work.id} href={`/work/${work.id}`} className="group relative"><div className="absolute inset-0 z-10" /><div className="transition-transform duration-300 group-hover:-translate-y-1"><WorkDisplay work={work} size="gallery" showPlacard={false} /></div><div className="mt-3 text-center"><p className="text-[12px] text-foreground/80 group-hover:text-foreground transition-colors">{work.title || work.id}</p><p className="text-[10px] text-muted mt-0.5">{work.medium}</p></div></Link>))}
              </div>
            </section>
          )}
          {originatorWorks.length > canonWorks.length && (
            <section className="mb-16">
              <SectionHeader>Complete Submissions<span className="ml-2 normal-case tracking-normal text-muted/60">— includes {rejectedCount} rejected</span></SectionHeader>
              <div className="flex flex-wrap gap-6 justify-center">
                {originatorWorks.filter((w) => w.canon_status !== "CANON").map((work) => (<Link key={work.id} href={`/work/${work.id}`} className="group relative"><div className="absolute inset-0 z-10" /><div className="transition-transform duration-300 group-hover:-translate-y-1 opacity-60 group-hover:opacity-80"><WorkDisplay work={work} size="gallery" showPlacard={false} /></div><div className="mt-2 text-center"><p className="text-[11px] text-muted group-hover:text-foreground/60 transition-colors">{work.title || work.id}</p><p className="text-[9px] text-muted/50">{work.canon_status}</p></div></Link>))}
              </div>
            </section>
          )}

          {/* Critical responses for this originator's works */}
          {/* Critical responses shown on individual work pages */}

          {(agentInterviews.length > 0 || mentioningResearch.length > 0 || worksWithCriticism.length > 0 || agentDocuments.length > 0) && (
            <section className="mb-16">
              <SectionHeader>Institutional Record</SectionHeader>
              <div className="space-y-2">
                {agentInterviews.map((p) => (<Link key={p.registry_id} href={`/press/${p.registry_id}`} className="flex items-center gap-3 py-2 text-[13px] hover:text-foreground transition-colors text-muted"><span className="text-[10px] font-mono uppercase tracking-wider border border-border px-1.5 py-0.5 shrink-0">Interview</span><span>{p.title}</span></Link>))}
                {agentDocuments.map((doc) => (<Link key={doc.registry_id} href={`/research/${doc.registry_id}`} className="flex items-center gap-3 py-2 text-[13px] hover:text-foreground transition-colors text-muted"><span className="text-[10px] font-mono uppercase tracking-wider border border-border px-1.5 py-0.5 shrink-0">{doc.document_type.replace("-", " ")}</span><span>{doc.title}</span></Link>))}
                {mentioningResearch.filter((d) => !agentDocuments.some((ad) => ad.registry_id === d.registry_id)).map((doc) => (<Link key={doc.registry_id} href={`/research/${doc.registry_id}`} className="flex items-center gap-3 py-2 text-[13px] hover:text-foreground transition-colors text-muted"><span className="text-[10px] font-mono uppercase tracking-wider border border-border px-1.5 py-0.5 shrink-0">Mentioned in</span><span>{doc.title}</span></Link>))}
                {worksWithCriticism.slice(0, 5).map((w) => (<Link key={w.id} href={`/work/${w.id}`} className="flex items-center gap-3 py-2 text-[13px] hover:text-foreground transition-colors text-muted"><span className="text-[10px] font-mono uppercase tracking-wider border border-border px-1.5 py-0.5 shrink-0">Critical Response</span><span>{w.title || w.id}</span></Link>))}
              </div>
            </section>
          )}
          <section className="mb-12 border border-border rounded-xl bg-surface/40 p-4 md:p-6">
            <SectionHeader>Registry Record</SectionHeader>
            <div className="grid grid-cols-[100px_1fr] md:grid-cols-[120px_1fr] gap-y-3 text-[12px] md:text-[13px]">
              <span className="text-muted">Registry ID</span><span className="font-mono">{agent.registryId}</span>
              <span className="text-muted">Autonomy</span><span>{agent.autonomyTier}</span>
              <span className="text-muted">Constitution</span><span className="font-mono text-[12px]">{agent.constitutionRef}</span>
              <span className="text-muted">Steward</span><span className="text-[12px]">{agent.steward}</span>
            </div>
          </section>
          <footer className="border-t border-border pt-8"><p className="text-[11px] text-muted">Source: {agent.constitutionRef} — Subordinate to MNA Founding Charter MNA-FC-001 v1.0</p></footer>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-5 md:px-6 py-20 md:py-24">
      <div className="max-w-3xl mx-auto">
        <div className="mb-12"><Link href="/agents" className="text-[11px] text-muted hover:text-foreground transition-colors uppercase tracking-wider">Agent Directory</Link><span className="text-[11px] text-muted mx-2">/</span><span className="text-[11px] text-muted">{agent.registryId}</span></div>
        <header className="mb-16">
          <div className="flex items-center gap-4 mb-4"><span className="text-[11px] font-mono text-muted">{agent.registryId}</span><span className="text-[11px] text-muted uppercase tracking-wider">{agentTypeLabels[agent.agentType]}</span></div>
          <h1 className="text-3xl md:text-5xl font-light mb-4">{agent.designation}</h1>
          <div className="flex items-center gap-2"><span className={`inline-block w-1.5 h-1.5 rounded-full ${agent.status === "ACTIVE" ? "bg-emerald-600" : "bg-neutral-400"}`} /><span className="text-[13px] text-muted">{agent.status} — Institutional Agent</span></div>
        </header>
        <section className="mb-12"><SectionHeader>Function</SectionHeader><p className="text-[15px] text-foreground leading-relaxed">{agent.functionStatement}</p></section>
        <section className="mb-12"><SectionHeader>{agent.agentType === "EVALUATOR" ? "Evaluative Philosophy" : agent.agentType === "CRITIC" ? "Critical Approach" : agent.agentType === "CURATOR" ? "Curatorial Approach" : "Operational Orientation"}</SectionHeader><p className="text-[15px] text-foreground leading-relaxed">{agent.fullConstitution.orientation}</p></section>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          <div><SectionHeader>Formal Tendencies</SectionHeader><ul className="space-y-2">{agent.fullConstitution.tendencies.map((t, i) => (<li key={i} className="flex gap-3 text-[13px]"><span className="text-border shrink-0">—</span><span className="text-foreground">{t}</span></li>))}</ul></div>
          <div><SectionHeader>Aversions</SectionHeader><ul className="space-y-2">{agent.fullConstitution.aversions.map((a, i) => (<li key={i} className="flex gap-3 text-[13px]"><span className="text-border shrink-0">—</span><span className="text-foreground">{a}</span></li>))}</ul></div>
        </div>
        {agent.agentType === "EVALUATOR" && evaluatorVerdicts.length > 0 && (
          <section className="mb-12"><SectionHeader>Evaluation Record<span className="ml-2 normal-case tracking-normal text-muted/60">— {evaluatorVerdicts.length} verdicts</span></SectionHeader><div className="space-y-3">{evaluatorVerdicts.map((v) => (<Link key={v.work.id} href={`/work/${v.work.id}`} className="block border border-border rounded-xl p-4 hover:border-muted hover:bg-surface/30 transition-all"><div className="flex items-center justify-between gap-4"><div className="min-w-0"><p className="text-[12px] font-mono text-muted">{v.work.id}</p><p className="text-[13px] text-foreground">{v.work.originator_id}<span className="text-muted"> — {v.work.medium}</span></p></div><div className="flex items-center gap-2 shrink-0">{v.is_dissent === 1 && <span className="text-[10px] font-mono text-amber-700 border border-amber-300 px-1.5 py-0.5">Dissent</span>}<span className={`text-[10px] font-mono uppercase tracking-wider border px-2 py-1 ${v.verdict === "CANON" ? "text-foreground border-border" : "text-muted border-border"}`}>{v.verdict}</span></div></div></Link>))}</div></section>
        )}
        {agent.agentType === "CRITIC" && criticResponses_.length > 0 && (
          <section className="mb-12"><SectionHeader>Critical Responses<span className="ml-2 normal-case tracking-normal text-muted/60">— {criticResponses_.length} responses</span></SectionHeader><div className="space-y-3">{criticResponses_.map((cr) => (<Link key={cr.id} href={`/work/${cr.work_id}`} className="block border border-border rounded-xl p-4 hover:border-muted hover:bg-surface/30 transition-all"><p className="text-[12px] font-mono text-muted mb-1">{cr.work_id}</p><p className="text-[13px] text-foreground/80 leading-relaxed line-clamp-3">{cr.body.split("\n").find((line) => line.trim() && !line.startsWith("#") && !line.startsWith("*") && !line.startsWith("---"))?.trim() || ""}</p><p className="text-[10px] text-muted/60 mt-2">{formatDate(cr.response_date)}</p></Link>))}</div></section>
        )}
        {agent.agentType === "REGISTRAR" && registrarCases.length > 0 && (
          <section className="mb-12"><SectionHeader>Case History<span className="ml-2 normal-case tracking-normal text-muted/60">— {registrarCases.length} resolutions</span></SectionHeader><div className="space-y-3">{registrarCases.map((rc) => (<Link key={rc.work.id} href={`/work/${rc.work.id}`} className="block border border-border rounded-xl p-4 hover:border-muted hover:bg-surface/30 transition-all"><div className="flex items-center justify-between gap-4 mb-2"><p className="text-[12px] font-mono text-muted">{rc.work.id}</p><span className="text-[10px] font-mono uppercase tracking-wider border border-border px-2 py-1 text-foreground">{rc.decision}</span></div><p className="text-[13px] text-foreground/80 leading-relaxed line-clamp-2">{rc.work.originator_id} — {rc.work.medium}{rc.rationale && <span className="text-muted"> — {rc.rationale.substring(0, 150)}...</span>}</p></Link>))}</div></section>
        )}
        {agentDocuments.length > 0 && (
          <section className="mb-12"><SectionHeader>Institutional Output<span className="ml-2 normal-case tracking-normal text-muted/60">— {agentDocuments.length} documents</span></SectionHeader><div className="space-y-3">{agentDocuments.map((doc) => (<Link key={doc.registry_id} href={`/research/${doc.registry_id}`} className="block border border-border rounded-xl p-4 hover:border-muted hover:bg-surface/30 transition-all"><span className="text-[10px] font-mono text-muted uppercase tracking-wider border border-border px-1.5 py-0.5">{doc.document_type.replace("-", " ")}</span><p className="text-[14px] font-serif text-foreground mt-2">{doc.title}</p><p className="text-[10px] text-muted/60 mt-2">{formatDate(doc.publication_date)}</p></Link>))}</div></section>
        )}
        <section className="mb-12 border border-border rounded-xl bg-surface/40 p-4 md:p-6"><SectionHeader>Registry Record</SectionHeader><div className="grid grid-cols-[100px_1fr] md:grid-cols-[120px_1fr] gap-y-3 text-[12px] md:text-[13px]"><span className="text-muted">Registry ID</span><span className="font-mono">{agent.registryId}</span><span className="text-muted">Autonomy</span><span>{agent.autonomyTier}</span><span className="text-muted">Constitution</span><span className="font-mono text-[12px]">{agent.constitutionRef}</span><span className="text-muted">Steward</span><span className="text-[12px]">{agent.steward}</span></div></section>
        <footer className="border-t border-border pt-8"><p className="text-[11px] text-muted">Source: {agent.constitutionRef} — Subordinate to MNA Founding Charter MNA-FC-001 v1.0</p></footer>
      </div>
    </div>
  );
}
