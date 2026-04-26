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
  return {
    title: `${std.fields.documentReference}: ${std.meta.title} — Museum of Nonhuman Art`,
    description: std.epigraph || std.subtitle,
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

  return (
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
          ? { id: siblings.prev.id, title: siblings.prev.shortLabel }
          : null,
        next: siblings.next
          ? { id: siblings.next.id, title: siblings.next.shortLabel }
          : null,
      }}
    />
  );
}
