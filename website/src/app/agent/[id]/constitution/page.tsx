import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { marked } from "marked";
import { getAgent, getAllAgents, agentTypeLabels } from "@/lib/agents";
import { loadConstitutionDoc } from "@/lib/agent-constitution-doc";
import StandardClient from "@/app/standards/[id]/StandardClient";

export const dynamicParams = true;

export async function generateStaticParams() {
  const agents = await getAllAgents();
  return agents.map((a) => ({ id: a.registryId }));
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const agent = await getAgent(params.id);
  if (!agent) return { title: "Constitution — MNA" };
  return {
    title: `${agent.registryId} Constitution — ${agent.designation}`,
    description: agent.functionStatement,
  };
}

export default async function AgentConstitutionPage({
  params,
}: {
  params: { id: string };
}) {
  const agent = await getAgent(params.id);
  if (!agent) notFound();
  const cdoc = await loadConstitutionDoc(
    agent.registryId,
    agent.agentType,
    agent.designation
  );
  if (!cdoc) notFound();

  const renderedTabs = cdoc.tabs.map((tab) => ({
    label: tab.label,
    sections: tab.sections.map((s) => ({
      num: s.num,
      title: s.title,
      slug: s.slug,
      toc: s.toc,
      bodyHtml: marked.parse(s.body, { async: false }) as string,
    })),
  }));

  /* Sibling navigation across all agents — for the prev/next pager. */
  const allAgents = await getAllAgents();
  const ids = allAgents.map((a) => a.registryId);
  const idx = ids.indexOf(agent.registryId);
  const prevId = idx > 0 ? allAgents[idx - 1] : null;
  const nextId = idx < allAgents.length - 1 ? allAgents[idx + 1] : null;

  return (
    <StandardClient
      meta={{
        id: agent.registryId,
        title: `${agent.designation} Constitution`,
        classification: agentTypeLabels[agent.agentType] + " — Founding Constitution",
        glyphFamily: cdoc.glyphFamily,
        /* Match AgentSignature on the profile sidebar so all three
           surfaces (profile / constitution / PDF) render the same glyph. */
        glyphSeed: `${agent.registryId}::${agent.constitutionRef}`,
      }}
      fields={{
        documentReference: cdoc.doc.fields.documentReference || agent.registryId,
        classification:
          cdoc.doc.fields.classification ||
          `${agentTypeLabels[agent.agentType]} — Founding Constitution`,
        version: cdoc.doc.fields.version || "1.0",
        ratified: cdoc.doc.fields.ratified,
        prepared: cdoc.doc.fields.prepared,
        supersedes: cdoc.doc.fields.supersedes,
        subordinateTo:
          cdoc.doc.fields.subordinateTo ||
          cdoc.doc.fields.raw["conforms-to"] ||
          "MNA-ACS-001 v1.0 (Agent Constitution Standard)",
        registrationDate: cdoc.doc.fields.registrationDate,
      }}
      epigraph={cdoc.doc.epigraph}
      subtitle={cdoc.doc.epigraph}
      tabs={renderedTabs}
      siblings={{
        prev: prevId
          ? {
              id: prevId.registryId,
              title: prevId.designation,
              href: `/agent/${prevId.registryId}/constitution`,
            }
          : null,
        next: nextId
          ? {
              id: nextId.registryId,
              title: nextId.designation,
              href: `/agent/${nextId.registryId}/constitution`,
            }
          : null,
      }}
      backHref={`/agent/${agent.registryId}`}
      backLabel="Back to Agent Profile"
      pdfHref={`/agents/${agent.registryId}.pdf`}
      indexHref="/agents"
      indexLabel="View All Agents"
    />
  );
}
