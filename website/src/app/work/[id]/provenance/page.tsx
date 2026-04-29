import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getWork } from "@/lib/collection";
import { getAgent } from "@/lib/agents";
import ProvenanceClient from "./provenance-client";

export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const work = await getWork(params.id);
  if (!work) return { title: "Provenance Not Found" };
  return {
    title: `Provenance — ${work.id} — Museum of Nonhuman Art`,
    description: `Full institutional record of evaluation, deliberation, and canonization for ${work.id}.`,
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

  return <ProvenanceClient work={work} agent={agent} />;
}
