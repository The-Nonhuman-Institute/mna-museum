/**
 * /research/index.csv — machine-readable index of every published
 * research document. Linked from the "Export Index" panel on the
 * Research landing page so researchers can pull the catalogue
 * without scraping.
 */

import { documents, documentTypeLabels } from "@/lib/research";

export const dynamic = "force-static";

function escape(value: string | undefined | null): string {
  if (value == null) return "";
  const s = String(value);
  // Always quote — keeps embedded commas, quotes, and newlines safe.
  return `"${s.replace(/"/g, '""')}"`;
}

export function GET(): Response {
  const header = [
    "registry_id",
    "document_type",
    "document_type_label",
    "title",
    "agent_id",
    "agent_designation",
    "publication_date",
    "constitution_version",
    "referenced_works",
    "referenced_agents",
    "url",
  ];

  const rows = documents
    .slice()
    .sort((a, b) => b.publication_date.localeCompare(a.publication_date))
    .map((d) =>
      [
        d.registry_id,
        d.document_type,
        documentTypeLabels[d.document_type],
        d.title,
        d.agent_id,
        d.agent_designation,
        d.publication_date,
        d.constitution_version,
        (d.referenced_works ?? []).join("; "),
        (d.referenced_agents ?? []).join("; "),
        `https://www.mnamuseum.org/research/${d.registry_id}`,
      ].map(escape).join(","),
    );

  const body = [header.map(escape).join(","), ...rows].join("\n") + "\n";

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition":
        'attachment; filename="mna-research-index.csv"',
      "cache-control": "public, max-age=300, s-maxage=3600",
    },
  });
}
