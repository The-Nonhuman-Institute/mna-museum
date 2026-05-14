/**
 * Citation formatting for MNA institutional documents and works.
 *
 * Produces formatted citations (APA, Chicago, MLA, BibTeX) for any
 * citable item — canon works, the Founding Charter, individual
 * standards, agent constitutions, research documents, press records.
 * Pages convert their domain object to a CitableItem via the helper
 * fns below, then pass that to `formatCitation`.
 *
 * Also produces Highwire Press meta-tag pairs (citation_title,
 * citation_author, etc.) so Google Scholar, Zotero, EndNote and
 * similar reference managers can auto-ingest metadata when a visitor
 * saves a URL.
 */

export type CitationFormat = "APA" | "Chicago" | "MLA" | "BibTeX";

export const CITATION_FORMATS: CitationFormat[] = [
  "APA",
  "Chicago",
  "MLA",
  "BibTeX",
];

const PUBLISHER = "Museum of Nonhuman Art";
const BASE_URL = "https://mnamuseum.org";

export interface CitableItem {
  /** Stable id used for BibTeX key. Letters/digits/underscores only after
   *  sanitization. */
  id: string;
  /** Primary author / originator. */
  author: string;
  /** Year as 4-digit string, or "n.d." */
  year: string;
  /** Title rendered in the citation. */
  title: string;
  /** Optional bracketed type/medium descriptor (e.g. "scene-json",
   *  "agent constitution", "stewardship record"). */
  type?: string;
  /** Document version string for standards/constitutions. */
  version?: string;
  /** Publisher / institution. Defaults to PUBLISHER. */
  publisher?: string;
  /** Full canonical URL. */
  url: string;
  /** Optional access date for online sources (Chicago / MLA). */
  accessed?: string;
}

function pub(item: CitableItem): string {
  return item.publisher ?? PUBLISHER;
}

function bracketed(s: string | undefined): string {
  return s ? ` [${s}]` : "";
}

function versionSuffix(item: CitableItem): string {
  return item.version ? ` (${item.version})` : "";
}

function bibKey(id: string): string {
  return "mna_" + id.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_");
}

export function formatCitation(item: CitableItem, fmt: CitationFormat): string {
  const url = item.url;
  const year = item.year;
  const author = item.author;
  const title = item.title;
  const publisher = pub(item);

  switch (fmt) {
    case "APA": {
      const v = versionSuffix(item);
      return `${author}. (${year}). ${title}${v}${bracketed(item.type)}. ${publisher}. ${url}`;
    }
    case "Chicago": {
      const v = item.version ? `, ${item.version}` : "";
      const t = item.type ? `, ${item.type}` : "";
      return `${author}. "${title}${v}." ${publisher}, ${year}${t}. ${url}.`;
    }
    case "MLA": {
      const v = item.version ? `, ${item.version}` : "";
      const t = item.type ? `, ${item.type}` : "";
      return `${author}. "${title}${v}." ${publisher}, ${year}${t}, ${url}.`;
    }
    case "BibTeX": {
      const lines = [
        `@misc{${bibKey(item.id)},`,
        `  author = {${author}},`,
        `  title = {${title}${item.version ? ` (${item.version})` : ""}},`,
        `  year = {${year}},`,
        item.type ? `  howpublished = {${item.type}},` : null,
        `  publisher = {${publisher}},`,
        `  url = {${url}}`,
        `}`,
      ].filter(Boolean);
      return lines.join("\n");
    }
  }
}

/** Produce Highwire Press meta-tag rows for a CitableItem. Caller maps
 *  these into Next.js Metadata.other (or individual <meta> tags in a
 *  custom <head>). Reference managers (Zotero, Google Scholar) parse
 *  these to auto-ingest citations when a user saves the URL. */
export function highwireMeta(item: CitableItem): Record<string, string> {
  return {
    citation_title: item.title,
    citation_author: item.author,
    citation_publication_date: item.year,
    citation_journal_title: pub(item),
    citation_public_url: item.url,
  };
}

/* ─── Helpers per content type ───────────────────────────────────────────── */

function yearOf(iso: string | null | undefined): string {
  if (!iso) return "n.d.";
  const m = String(iso).match(/^(\d{4})/);
  return m ? m[1] : "n.d.";
}

/** Convert a Work record to a CitableItem. Pass the raw Work as it
 *  comes back from getWork() / getCanonWorks(). */
export function workToCitableItem(work: {
  id: string;
  title?: string | null;
  originator_id: string;
  originator_name?: string | null;
  output_type?: string;
  medium?: string;
  canon_date?: string | null;
  created_at?: string;
}): CitableItem {
  const name = (work.originator_name || "").trim();
  const author =
    name && name.toUpperCase() !== "PENDING_EMERGENCE"
      ? name
      : work.originator_id;
  const year = yearOf(work.canon_date || work.created_at);
  const title = (work.title || "").trim() || work.id;
  const type = work.output_type || work.medium || undefined;
  return {
    id: work.id,
    author,
    year,
    title,
    type,
    url: `${BASE_URL}/work/${work.id}`,
  };
}

/** Convert the Founding Charter (or any institutional document with a
 *  version + effective date) to a CitableItem. */
export function institutionalDocToCitableItem(doc: {
  id: string;
  title: string;
  version?: string;
  effective_date?: string | null;
  path: string;
  type?: string;
}): CitableItem {
  return {
    id: doc.id,
    author: PUBLISHER,
    year: yearOf(doc.effective_date),
    title: doc.title,
    version: doc.version,
    type: doc.type,
    url: `${BASE_URL}${doc.path}`,
  };
}

/** Convert an agent (constitution) record to a CitableItem. */
export function agentToCitableItem(agent: {
  registry_id: string;
  common_designation?: string | null;
  constitution_title?: string | null;
  constitution_version?: string | null;
  effective_date?: string | null;
}): CitableItem {
  const designation = (agent.common_designation || "").trim();
  const titleBase = (agent.constitution_title || "").trim() || agent.registry_id;
  const title = designation
    ? `${designation} — ${titleBase}`
    : titleBase;
  return {
    id: agent.registry_id,
    author: PUBLISHER,
    year: yearOf(agent.effective_date),
    title,
    version: agent.constitution_version || undefined,
    type: "agent constitution",
    url: `${BASE_URL}/agent/${agent.registry_id}`,
  };
}

/** Convert a Work to a CitableItem representing its institutional
 *  provenance record — distinct from the work itself. Used when a
 *  researcher is citing the evaluation/canonization process rather
 *  than the work as an aesthetic object (e.g. studies of AI evaluation
 *  systems, comparative canon-vs-archive analysis, methodology papers
 *  on autonomous canonization). For rejected works this is usually the
 *  more meaningful citation. */
export function workProvenanceToCitableItem(work: {
  id: string;
  title?: string | null;
  canon_status?: string;
  canon_date?: string | null;
  submission_date?: string | null;
  constitution_version?: string | null;
}): CitableItem {
  const titleBase = (work.title || "").trim() || work.id;
  return {
    id: `${work.id}_provenance`,
    author: PUBLISHER,
    year: yearOf(work.canon_date || work.submission_date),
    title: `Provenance Record: ${titleBase}`,
    version: work.constitution_version
      ? `constitution v${work.constitution_version}`
      : undefined,
    type: "evaluation provenance record",
    url: `${BASE_URL}/work/${work.id}/provenance`,
  };
}

/** Convert a press document (interview, stewardship record, statement)
 *  to a CitableItem. */
export function pressToCitableItem(doc: {
  id: string | number;
  document_type?: string;
  title: string;
  subtitle?: string | null;
  subject?: string | null;
  conducted_by?: string | null;
  publication_date?: string | null;
  date?: string | null;
}): CitableItem {
  const authorChunks = [doc.conducted_by, doc.subject].filter(Boolean) as string[];
  const author = authorChunks.length ? authorChunks.join(" & ") : PUBLISHER;
  return {
    id: `press_${doc.id}`,
    author,
    year: yearOf(doc.publication_date || doc.date),
    title: doc.title,
    type: doc.document_type?.replace(/-/g, " "),
    url: `${BASE_URL}/press/${doc.id}`,
  };
}

/** Convert a research document to a CitableItem. */
export function researchToCitableItem(doc: {
  registry_id: string;
  document_type?: string;
  agent_id?: string;
  agent_designation?: string | null;
  title: string;
  publication_date?: string | null;
}): CitableItem {
  const author =
    (doc.agent_designation || "").trim() || doc.agent_id || PUBLISHER;
  return {
    id: doc.registry_id,
    author,
    year: yearOf(doc.publication_date),
    title: doc.title,
    type: doc.document_type?.replace(/-/g, " "),
    url: `${BASE_URL}/research/${doc.registry_id}`,
  };
}
