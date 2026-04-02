/**
 * Publish a research document to the website's research.json.
 * Automatically stamps the current date. No manual date entry.
 *
 * Usage:
 *   npx ts-node src/publish-research.ts <registry_id> <document_type> <agent_id> <agent_designation> <title> <body_file>
 *
 * Or import and call publishResearchDocument() programmatically.
 */

import fs from "fs";
import path from "path";

const RESEARCH_PATH = path.join(__dirname, "..", "..", "website", "src", "data", "research.json");

interface ResearchDocument {
  registry_id: string;
  document_type: string;
  agent_id: string;
  agent_designation: string;
  title: string;
  publication_date: string;
  constitution_version: string;
  body: string;
  referenced_works?: string[];
  referenced_agents?: string[];
  status: string;
}

export function publishResearchDocument(doc: Omit<ResearchDocument, "publication_date" | "status"> & {
  referenced_works?: string[];
  referenced_agents?: string[];
}): void {
  // Always use the current date — never hardcode
  const today = new Date().toISOString().split("T")[0];

  const existing: ResearchDocument[] = JSON.parse(fs.readFileSync(RESEARCH_PATH, "utf-8"));

  // Check for duplicate
  if (existing.find(d => d.registry_id === doc.registry_id)) {
    console.error(`[PUBLISH] ${doc.registry_id} already exists in research.json — skipping`);
    return;
  }

  const fullDoc: ResearchDocument = {
    ...doc,
    publication_date: today,
    status: "published",
  };

  existing.push(fullDoc);
  fs.writeFileSync(RESEARCH_PATH, JSON.stringify(existing, null, 2));
  console.log(`[PUBLISH] ${doc.registry_id} published (${today})`);
}
