/**
 * Research data layer — reads from static JSON exported alongside collection data.
 */

import researchData from "@/data/research.json";

export interface ResearchDocument {
  registry_id: string;
  document_type: "corpus-study" | "critical-essay" | "stewardship-record" | "institutional-report";
  agent_id: string;
  agent_designation: string;
  title: string;
  publication_date: string;
  constitution_version: string;
  body: string;
  referenced_works?: string[];
  referenced_agents?: string[];
  status: "published" | "draft";
}

export const documents = (researchData as ResearchDocument[]).filter(
  (d) => d.status === "published"
);

export function getDocument(id: string): ResearchDocument | undefined {
  return documents.find((d) => d.registry_id === id);
}

export function getDocumentsByType(type: ResearchDocument["document_type"]): ResearchDocument[] {
  return documents.filter((d) => d.document_type === type);
}

export function getDocumentsByAgent(agentId: string): ResearchDocument[] {
  return documents.filter((d) => d.agent_id === agentId);
}

export const documentTypeLabels: Record<ResearchDocument["document_type"], string> = {
  "corpus-study": "Corpus Study",
  "critical-essay": "Critical Essay",
  "stewardship-record": "Stewardship Record",
  "institutional-report": "Institutional Report",
};
