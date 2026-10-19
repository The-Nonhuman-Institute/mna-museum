/**
 * The governance documents, published from founding-documents/governance/.
 *
 * Until 2026-10-19 the site linked to /governance from the Steward Agent's page
 * and nothing was there: the governance documents existed only in the
 * repository. Every version is published, superseded ones included — a
 * superseded version is kept as written, and its status line says so.
 *
 * Server-only: reads the files at build time.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const DIR = path.resolve(process.cwd(), "..", "founding-documents", "governance");

export interface GovernanceDoc {
  /** File name without .md — the page's address. */
  slug: string;
  /** e.g. MNA-GOV-006, MNA-ACS-001-AMD-002. */
  docId: string;
  version: string;
  title: string;
  /** The document's own status line, as written. */
  status: string;
  superseded: boolean;
  body: string;
}

const NAME = /^(MNA-[A-Z]+-\d+(?:-AMD-\d+)?)-.+-v(\d+)_(\d+)\.md$/;

export async function listGovernanceDocs(): Promise<GovernanceDoc[]> {
  const files = (await readdir(DIR)).filter((f) => NAME.test(f)).sort();
  const docs = await Promise.all(files.map(async (f) => parse(f, await readFile(path.join(DIR, f), "utf8"))));
  // Grouped by document, newest version first.
  return docs.sort((a, b) => a.docId.localeCompare(b.docId) || versionNum(b.version) - versionNum(a.version));
}

export async function getGovernanceDoc(slug: string): Promise<GovernanceDoc | null> {
  const all = await listGovernanceDocs();
  return all.find((d) => d.slug === slug) ?? null;
}

const versionNum = (v: string) => {
  const [a, b] = v.split(".").map(Number);
  return a * 1000 + b;
};

function parse(file: string, text: string): GovernanceDoc {
  const m = NAME.exec(file)!;
  const lines = text.split("\n");
  const titleLine = lines.find((l) => l.startsWith("# ")) ?? file;
  const statusLine =
    lines.find((l) => /^\*\*Status:\*\*/.test(l)) ??
    lines.find((l) => /^\*\*Ratified:\*\*/.test(l)) ??
    "";
  const status = statusLine.replace(/^\*\*[A-Za-z]+:\*\*\s*/, "").trim();
  return {
    slug: file.replace(/\.md$/, ""),
    docId: m[1],
    version: `${m[2]}.${m[3]}`,
    title: titleLine.replace(/^#\s+/, "").replace(/^MNA-[A-Z0-9-]+:?\s*[—-]?\s*/, "").trim() || titleLine.replace(/^#\s+/, ""),
    status: status || "No status line.",
    superseded: /SUPERSEDED|VOID|never ratified/i.test(status),
    body: text.slice(text.indexOf(titleLine) + titleLine.length).trim(),
  };
}
