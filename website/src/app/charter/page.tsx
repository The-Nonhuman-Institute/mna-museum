import type { Metadata } from "next";
import { CHARTER_ARTICLES, CHARTER_META } from "@/lib/charter-data";
import CharterViewer from "./CharterViewer";
import CitationBlock from "@/components/CitationBlock";
import {
  institutionalDocToCitableItem,
  formatCitation,
  highwireMeta,
  CITATION_FORMATS,
  type CitationFormat,
} from "@/lib/citations";

// Builds the CitableItem once at module load — the Charter's metadata
// is static, no per-request computation needed.
const charterCitable = institutionalDocToCitableItem({
  id: CHARTER_META.reference,
  title: CHARTER_META.title,
  version: `v${CHARTER_META.version}`,
  effective_date: "2025-04-24", // matches CHARTER_META.ratifiedDisplay
  path: "/charter",
  type: "founding charter",
});

export const metadata: Metadata = {
  title: `${CHARTER_META.title} — Museum of Nonhuman Art`,
  description: CHARTER_META.descriptor,
  other: highwireMeta(charterCitable),
};

export default function CharterPage() {
  const citations = Object.fromEntries(
    CITATION_FORMATS.map((f) => [f, formatCitation(charterCitable, f)]),
  ) as Record<CitationFormat, string>;

  return (
    <>
      <CharterViewer articles={CHARTER_ARTICLES} />
      <div className="bg-ink text-mna-white">
        <div className="max-w-5xl mx-auto px-5 md:px-8 py-12 md:py-14">
          <CitationBlock
            citations={citations}
            url={charterCitable.url}
            heading="Cite the Founding Charter"
          />
        </div>
      </div>
    </>
  );
}
