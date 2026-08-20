import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  loadStandard,
  listStandardIds,
  getSiblingIds,
  type StandardId,
} from "@/lib/standards";
import StandardClient from "./StandardClient";
import { marked } from "marked";
import CitationBlock from "@/components/CitationBlock";
import {
  institutionalDocToCitableItem,
  formatCitation,
  highwireMeta,
  CITATION_FORMATS,
  type CitationFormat,
} from "@/lib/citations";

export async function generateStaticParams() {
  return listStandardIds().map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!isStandardId(id)) return {};
  const std = await loadStandard(id);
  const citable = institutionalDocToCitableItem({
    id: std.fields.documentReference,
    title: std.meta.title,
    version: `v${std.fields.version}`,
    effective_date: std.fields.ratified ?? std.fields.registrationDate ?? null,
    path: `/standards/${id}`,
    type: "institutional standard",
  });
  return {
    title: `${std.fields.documentReference}: ${std.meta.title}`,
    description: std.epigraph || std.subtitle,
    other: highwireMeta(citable),
  };
}

function isStandardId(id: string): id is StandardId {
  return listStandardIds().includes(id as StandardId);
}

export default async function StandardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isStandardId(id)) notFound();
  const std = await loadStandard(id);
  const siblings = getSiblingIds(id);

  /* Render each section's markdown body to HTML once, server-side. */
  const renderedTabs = std.tabs.map((tab) => ({
    label: tab.label,
    sections: tab.sections.map((s) => ({
      num: s.num,
      title: s.title,
      slug: s.slug,
      toc: s.toc,
      bodyHtml: marked.parse(s.body, { async: false }) as string,
    })),
  }));

  const citable = institutionalDocToCitableItem({
    id: std.fields.documentReference,
    title: std.meta.title,
    version: `v${std.fields.version}`,
    effective_date: std.fields.ratified ?? std.fields.registrationDate ?? null,
    path: `/standards/${id}`,
    type: "institutional standard",
  });
  const citations = Object.fromEntries(
    CITATION_FORMATS.map((f) => [f, formatCitation(citable, f)]),
  ) as Record<CitationFormat, string>;

  return (
    <>
      <StandardClient
        meta={{
          id: std.meta.id,
          title: std.meta.title,
          classification: std.meta.classification,
          glyphFamily: std.meta.glyphFamily,
        }}
        fields={std.fields}
        epigraph={std.epigraph}
        subtitle={std.subtitle}
        tabs={renderedTabs}
        siblings={{
          prev: siblings.prev
            ? {
                id: siblings.prev.id,
                title: siblings.prev.shortLabel,
                href: `/standards/${siblings.prev.id}`,
              }
            : null,
          next: siblings.next
            ? {
                id: siblings.next.id,
                title: siblings.next.shortLabel,
                href: `/standards/${siblings.next.id}`,
              }
            : null,
        }}
      />
      <div className="bg-ink text-mna-white">
        <div className="max-w-5xl mx-auto px-5 md:px-8 py-12 md:py-14">
          <CitationBlock
            citations={citations}
            url={citable.url}
            heading="Cite this standard"
          />
        </div>
      </div>
    </>
  );
}
