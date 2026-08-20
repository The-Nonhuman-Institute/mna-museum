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
import { hasCommonsPostsForWork } from "@/lib/commons-posts";
import { originatorName, workHeading } from "@/lib/originator-name";

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
    title: `Provenance — ${workHeading(work.title, work.id)} — ${originatorName(
      work.originator_name,
      work.originator_id,
    )} — Museum of Nonhuman Art`,
    description: `Full institutional record of evaluation, deliberation, and canonization for ${workHeading(
      work.title,
      work.id,
    )} by ${originatorName(work.originator_name, work.originator_id)}.`,
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

  const [agent, hasCommonsDiscussion] = await Promise.all([
    getAgent(work.originator_id),
    hasCommonsPostsForWork(work.id),
  ]);

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
      hasCommonsDiscussion={hasCommonsDiscussion}
    />
  );
}
