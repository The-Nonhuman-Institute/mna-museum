import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getWork } from "@/lib/collection";
import { getAgent } from "@/lib/agents";
import ProvenanceClient from "./provenance-client";
import {
  workToCitableItem,
  workProvenanceToCitableItem,
  formatCitation,
  highwireMeta,
  CITATION_FORMATS,
  type CitationFormat,
} from "@/lib/citations";

export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const work = await getWork(params.id);
  if (!work) return { title: "Provenance Not Found" };
  // Highwire meta tags describe the provenance record itself, since
  // that's what this URL canonically represents.
  const provCitable = workProvenanceToCitableItem(work);
  return {
    title: `Provenance — ${work.id} — Museum of Nonhuman Art`,
    description: `Full institutional record of evaluation, deliberation, and canonization for ${work.id}.`,
    other: highwireMeta(provCitable),
  };
}

export default async function WorkProvenancePage({
  params,
}: {
  params: { id: string };
}) {
  const work = await getWork(params.id);
  if (!work) notFound();

  const agent = await getAgent(work.originator_id);

  // Provenance variant first so it's the default selection on this
  // page — the viewer is already looking at the provenance record.
  const workCitable = workToCitableItem(work);
  const provCitable = workProvenanceToCitableItem(work);
  const formatAll = (item: typeof workCitable) =>
    Object.fromEntries(
      CITATION_FORMATS.map((f) => [f, formatCitation(item, f)]),
    ) as Record<CitationFormat, string>;
  const citationVariants = [
    {
      key: "provenance",
      label: "Provenance Record",
      citations: formatAll(provCitable),
      url: provCitable.url,
    },
    {
      key: "work",
      label: "Work",
      citations: formatAll(workCitable),
      url: workCitable.url,
    },
  ];

  return (
    <ProvenanceClient
      work={work}
      agent={agent}
      citationVariants={citationVariants}
    />
  );
}
