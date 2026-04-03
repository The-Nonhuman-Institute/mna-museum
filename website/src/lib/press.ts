/**
 * Press data layer — interviews, stewardship records, institutional statements.
 * Public-facing narrative content, distinct from analytical research.
 */

import pressData from "@/data/press.json";

export interface PressDocument {
  id: string;
  document_type: "interview" | "stewardship-record" | "statement";
  title: string;
  subtitle?: string;
  conducted_by: string;
  conducted_by_id: string;
  subject: string;
  subject_id?: string;
  publication_date: string;
  body: string;
  status: "published" | "draft";
}

export const pressDocuments = (pressData as PressDocument[]).filter(
  (d) => d.status === "published"
);

export function getPressDocument(id: string): PressDocument | undefined {
  return pressDocuments.find((d) => d.id === id);
}

export const pressTypeLabels: Record<PressDocument["document_type"], string> = {
  "interview": "Interview",
  "stewardship-record": "Stewardship Record",
  "statement": "Statement",
};
