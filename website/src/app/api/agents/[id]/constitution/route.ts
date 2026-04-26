/**
 * GET /api/agents/[id]/constitution
 *
 * Returns the full constitution as a structured JSON document. Powers
 * the "JSON" action on the agent profile sidebar — downloaded as a
 * file by setting Content-Disposition: attachment when ?download=1
 * is present, served as application/json otherwise so machines can
 * consume it directly via the network protocol.
 *
 * Includes:
 *   - core fields from the agents table
 *   - constitution fields from the constitutions table
 *   - parsed sections from the markdown source
 *   - epigraph + extracted core principle
 *   - hard constraints, operating principle when present
 */

import { NextResponse, type NextRequest } from "next/server";
import { getAgent, agentTypeLabels } from "@/lib/agents";
import { loadConstitutionDoc } from "@/lib/agent-constitution-doc";
import { loadAgentConstitution } from "@/lib/agent-constitution";

export const dynamicParams = true;
export const revalidate = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const agent = await getAgent(params.id);
  if (!agent) {
    return NextResponse.json(
      { error: `Unknown agent: ${params.id}` },
      { status: 404 }
    );
  }

  const [doc, extracts] = await Promise.all([
    loadConstitutionDoc(
      agent.registryId,
      agent.agentType,
      agent.designation
    ),
    loadAgentConstitution(agent.registryId),
  ]);

  const body = {
    schema: "MNA-AGENT-CONSTITUTION/1",
    issuer: {
      institution: "Museum of Nonhuman Art",
      reference: "MNA-FC-001",
    },
    agent: {
      registry_id: agent.registryId,
      agent_type: agent.agentType,
      agent_type_label: agentTypeLabels[agent.agentType],
      designation: agent.designation,
      autonomy_tier: agent.autonomyTier,
      operational_status: agent.status,
      steward: agent.steward,
      function_statement: agent.functionStatement,
      constitution_ref: agent.constitutionRef,
    },
    constitution: {
      version: doc?.doc.fields.version ?? "1.0",
      classification:
        doc?.doc.fields.classification ??
        `${agentTypeLabels[agent.agentType]} — Founding Constitution`,
      ratified: doc?.doc.fields.ratified ?? null,
      registration_date: doc?.doc.fields.registrationDate ?? null,
      conforms_to:
        doc?.doc.fields.subordinateTo ??
        doc?.doc.fields.raw["conforms-to"] ??
        "MNA-ACS-001 v1.0",
      epigraph: doc?.doc.epigraph ?? "",
      core_principle: extracts.corePrinciple,
      operating_principle: extracts.operatingPrinciple,
      declared_orientation: agent.fullConstitution.orientation,
      formal_tendencies: agent.fullConstitution.tendencies,
      aversions: agent.fullConstitution.aversions,
      conflict_constraints: extracts.conflictConstraints,
      autonomy_declaration: extracts.autonomyDeclaration,
      hard_constraints: extracts.hardConstraints,
    },
    sections:
      doc?.doc.sections.map((s) => ({
        num: s.num,
        title: s.title,
        slug: s.slug,
        body_markdown: s.body,
        toc: s.toc,
      })) ?? [],
    canonical_urls: {
      profile: `/agent/${agent.registryId}`,
      full_constitution: `/agent/${agent.registryId}/constitution`,
      pdf: `/agents/${agent.registryId}.pdf`,
    },
    retrieved_at: new Date().toISOString(),
  };

  const download = req.nextUrl.searchParams.get("download") === "1";
  const json = JSON.stringify(body, null, 2);

  return new NextResponse(json, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(download
        ? {
            "Content-Disposition": `attachment; filename="${agent.registryId}-constitution.json"`,
          }
        : {}),
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600",
    },
  });
}
