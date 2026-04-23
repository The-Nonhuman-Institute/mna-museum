import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getExhibition } from "@/lib/exhibitions";
import { getWork, type Work } from "@/lib/collection";
import { getPreviewIndex } from "@/lib/previews";
import ExhibitionWorksClient from "./ExhibitionWorksClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const exhibition = await getExhibition(Number(id));
  if (!exhibition) return { title: "Exhibition Works Not Found" };
  return {
    title: `${exhibition.title} — Works — Museum of Nonhuman Art`,
    description: `Arrangement view of the ${exhibition.work_ids.length} works in ${exhibition.title}.`,
  };
}

const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

function monthDayShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function splitPhaseTitle(title: string): { phase: string | null; rest: string } {
  const m = title.match(/^(Phase\s+[0-9IVX]+)\s*:\s*(.*)$/i);
  if (m) return { phase: m[1].replace(/\s+/g, " "), rest: m[2].trim() };
  return { phase: null, rest: title };
}

function splitRest(rest: string): { main: string; tail: string | null } {
  const colon = rest.match(/^(.*?):\s*(.+)$/);
  if (colon) return { main: colon[1].trim(), tail: colon[2].trim() };
  const dash = rest.match(/^(.*?)\s+[—–-]\s+(.+)$/);
  if (dash) return { main: dash[1].trim(), tail: dash[2].trim() };
  return { main: rest, tail: null };
}

function extractPullQuote(statement: string): string | null {
  const quoted = statement.match(/[“"]([^”"]{10,120})[”"]/);
  if (quoted) return quoted[1].trim();
  const sentences = statement
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 18 && s.length < 120);
  if (sentences.length === 0) return null;
  sentences.sort((a, b) => a.length - b.length);
  return sentences[0].replace(/^[“"]|[”"]$/g, "");
}

function originatorShort(w: Work): string {
  const name = (w.originator_name || "").trim();
  if (name && name !== "PENDING_EMERGENCE") return name.toUpperCase();
  const m = w.originator_id.match(/MNA-(OR-\d+)/);
  return m ? m[1] : w.originator_id;
}

export default async function ExhibitionWorksPage({ params }: PageProps) {
  const { id } = await params;
  const exhibition = await getExhibition(Number(id));
  if (!exhibition) notFound();

  const resolved = await Promise.all(
    exhibition.work_ids.map((wid) => getWork(wid))
  );
  const works = resolved.filter((w): w is Work => Boolean(w));
  const previewIdx = getPreviewIndex();
  const previewIds = works.map((w) => w.id).filter((wid) => previewIdx.has(wid));

  const { phase, rest } = splitPhaseTitle(exhibition.title);
  const { main, tail } = splitRest(rest);

  const datesLabel =
    exhibition.status === "ACTIVE"
      ? `${monthDayShort(exhibition.opened_at)} — PRESENT`
      : `${monthDayShort(exhibition.opened_at)} — ${monthDayShort(exhibition.retired_at)}`;

  const pullQuoteText = extractPullQuote(exhibition.curatorial_statement);
  const pullQuoteAttribution = (() => {
    if (!pullQuoteText) return null;
    const firstCanon = works.find((w) => w.canon_status === "CANON");
    return firstCanon ? originatorShort(firstCanon) : null;
  })();

  const coverId = exhibition.cover_work_id ?? exhibition.work_ids[0] ?? null;
  const heroPreview =
    coverId && previewIdx.has(coverId) ? `/previews/${coverId}.png` : null;

  return (
    <ExhibitionWorksClient
      exhibition={exhibition}
      works={works}
      previewIds={previewIds}
      pullQuote={
        pullQuoteText
          ? { text: pullQuoteText, attribution: pullQuoteAttribution }
          : null
      }
      datesLabel={datesLabel}
      heroPreview={heroPreview}
      phaseLine={{ phase, main, tail }}
    />
  );
}
