/**
 * Print-friendly variant of /standards/[id]. This route is used by the
 * build-time Puppeteer script (system/scripts/generate-standard-pdfs.ts)
 * to render each standard to a PDF that mirrors the institutional look —
 * cover page, then sequential sections with page breaks. No sticky bars,
 * no tabs, no JS-driven scroll spy. Print CSS handles the rest.
 */

import { notFound } from "next/navigation";
import { marked } from "marked";
import { loadStandard, listStandardIds, type StandardId } from "@/lib/standards";
import MNAGlyph from "@/components/MNAGlyph";

export async function generateStaticParams() {
  return listStandardIds().map((id) => ({ id }));
}

export const dynamic = "force-static";

function isStandardId(id: string): id is StandardId {
  return listStandardIds().includes(id as StandardId);
}

export default async function StandardPrint({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isStandardId(id)) notFound();
  const std = await loadStandard(id);

  return (
    <>
      {/* Inline print stylesheet — keeps this route self-contained and
          avoids leaking print rules to the live site. */}
      <style
        dangerouslySetInnerHTML={{
          __html: PRINT_CSS,
        }}
      />

      <div className="print-doc">
        {/* ───── Cover page ───── */}
        <section className="print-cover">
          <div className="print-cover-meta">
            <div className="print-rule" />
            <p className="print-eyebrow">{std.fields.classification}</p>
            <h1 className="print-title">
              {std.meta.id}:<br />
              {std.meta.title}
            </h1>
            <p className="print-epigraph">{std.epigraph}</p>
          </div>

          <div className="print-cover-glyph">
            <MNAGlyph
              family={std.meta.glyphFamily}
              seed={std.meta.id}
              size={400}
            />
          </div>

          <dl className="print-cover-fields">
            <Field label="Document Reference" value={std.fields.documentReference} />
            <Field label="Classification" value={std.fields.classification} />
            <Field label="Version" value={std.fields.version} />
            {std.fields.ratified ? (
              <Field label="Ratified" value={std.fields.ratified} />
            ) : std.fields.prepared ? (
              <Field label="Prepared" value={std.fields.prepared} />
            ) : null}
            {std.fields.supersedes ? (
              <Field label="Supercedes" value={std.fields.supersedes} />
            ) : null}
            {std.fields.subordinateTo ? (
              <Field label="Subordinate to" value={std.fields.subordinateTo} />
            ) : null}
          </dl>

          <div className="print-cover-foot">
            Issued by the founding human steward — U3 Labs, LLC, Florida, United States of America
          </div>
        </section>

        {/* ───── Sections ───── */}
        {std.sections.map((s) => (
          <section key={s.slug} className="print-section">
            <p className="print-section-eyebrow">
              {s.num}. {s.title}
            </p>
            <div className="print-section-rule" />
            <div
              className="prose-standard print-prose"
              dangerouslySetInnerHTML={{
                __html: marked.parse(s.body, { async: false }) as string,
              }}
            />
          </section>
        ))}
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

/* A4 layout, neutral institutional typography. Puppeteer will print this
   with print backgrounds enabled and a generated header/footer. */
const PRINT_CSS = `
  @page {
    size: A4;
    margin: 22mm 18mm;
  }
  body {
    background: #FFFFFF !important;
    color: #0A0A0A !important;
  }
  /* Hide the standard site chrome on this route. */
  body > header,
  body > nav,
  body > footer,
  .layout-header,
  .layout-footer,
  .site-header,
  .site-footer {
    display: none !important;
  }
  .print-doc {
    color: #0A0A0A;
    font-family: var(--font-interface), system-ui, sans-serif;
    font-size: 11pt;
    line-height: 1.65;
  }
  .print-cover {
    page-break-after: always;
    min-height: 90vh;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 0;
  }
  .print-rule {
    width: 60px;
    height: 1px;
    background: #0A0A0A;
    margin-bottom: 12pt;
  }
  .print-eyebrow {
    font-size: 9pt;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: #0A0A0A;
    opacity: 0.7;
    margin: 0 0 24pt;
  }
  .print-title {
    font-family: var(--font-display), Georgia, serif;
    font-weight: 300;
    font-size: 36pt;
    line-height: 1.05;
    letter-spacing: -0.01em;
    margin: 0 0 18pt;
  }
  .print-epigraph {
    font-style: italic;
    font-size: 12pt;
    line-height: 1.55;
    max-width: 460pt;
    color: #0A0A0A;
    opacity: 0.75;
    margin: 0;
  }
  .print-cover-glyph {
    align-self: center;
    width: 280pt;
    height: 280pt;
    margin: 0 auto;
    color: #0A0A0A;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24pt 0;
  }
  .print-cover-glyph svg {
    width: 100%;
    height: 100%;
  }
  .print-cover-fields {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 4pt 24pt;
    border-top: 1px solid #0A0A0A;
    padding-top: 14pt;
    margin: 0 0 12pt;
    font-size: 10pt;
  }
  .print-cover-fields dt {
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 8.5pt;
    color: #0A0A0A;
    opacity: 0.6;
    align-self: baseline;
  }
  .print-cover-fields dd {
    margin: 0;
    color: #0A0A0A;
  }
  .print-cover-foot {
    font-size: 9pt;
    letter-spacing: 0.04em;
    color: #0A0A0A;
    opacity: 0.55;
    border-top: 1px solid rgba(0,0,0,0.2);
    padding-top: 10pt;
    margin-top: 8pt;
  }
  .print-section {
    page-break-before: always;
    padding-top: 4pt;
  }
  .print-section-eyebrow {
    font-family: var(--font-display), Georgia, serif;
    font-weight: 300;
    font-size: 22pt;
    line-height: 1.2;
    margin: 0 0 8pt;
    letter-spacing: -0.005em;
  }
  .print-section-rule {
    height: 1px;
    background: #0A0A0A;
    opacity: 0.25;
    margin: 0 0 16pt;
  }
  .print-prose p {
    margin: 0 0 10pt;
  }
  .print-prose strong { font-weight: 600; }
  .print-prose em { font-style: italic; opacity: 0.85; }
  .print-prose ul, .print-prose ol {
    margin: 0 0 10pt 0;
    padding-left: 16pt;
  }
  .print-prose ul > li {
    list-style: none;
    position: relative;
    margin-bottom: 4pt;
  }
  .print-prose ul > li::before {
    content: "";
    position: absolute;
    left: -12pt;
    top: 8pt;
    width: 6pt;
    height: 1px;
    background: #0A0A0A;
    opacity: 0.55;
  }
  .print-prose h2 {
    font-family: var(--font-display), Georgia, serif;
    font-weight: 400;
    font-size: 14pt;
    margin: 16pt 0 6pt;
    page-break-after: avoid;
  }
  .print-prose h3 {
    font-family: var(--font-display), Georgia, serif;
    font-weight: 400;
    font-size: 12pt;
    margin: 12pt 0 4pt;
    page-break-after: avoid;
  }
`;
