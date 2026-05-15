/**
 * Print-friendly variant of /research/[id]. Mirrors the institutional
 * look of the standards print route — cover page (badge, title,
 * abstract, document fields, glyph) followed by the body and any
 * referenced works / agents. The /research/[id] page previously linked
 * here for "Download PDF" but the route did not exist, returning 404.
 */

import { notFound } from "next/navigation";
import { marked } from "marked";
import {
  documents,
  getDocument,
  documentTypeLabels,
  type ResearchDocument,
} from "@/lib/research";
import MNAGlyph, { pickFamily } from "@/components/MNAGlyph";

export function generateStaticParams() {
  return documents.map((d) => ({ id: d.registry_id }));
}

export const dynamic = "force-static";

function formatLong(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function readMinutes(body: string): number {
  const words = body.replace(/\s+/g, " ").trim().split(" ").length;
  return Math.max(1, Math.round(words / 220));
}

function pageCount(body: string): number {
  const words = body.replace(/\s+/g, " ").trim().split(" ").length;
  return Math.max(1, Math.round(words / 250));
}

function abstractFor(body: string, max = 320): string {
  const cleaned = body
    .replace(/^#+\s+.*$/gm, "")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max - 1).trimEnd() + "…";
}

export default function ResearchPrintPage({
  params,
}: {
  params: { id: string };
}) {
  const doc = getDocument(params.id);
  if (!doc) notFound();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="print-doc">
        {/* ───── Cover page ───── */}
        <CoverPage doc={doc} />

        {/* ───── Body ───── */}
        <BodySection doc={doc} />

        {/* ───── Appendix: referenced works + agents ───── */}
        <Appendix doc={doc} />
      </div>
    </>
  );
}

function CoverPage({ doc }: { doc: ResearchDocument }) {
  return (
    <section className="print-cover">
      <div className="print-cover-meta">
        <div className="print-rule" />
        <p className="print-eyebrow">
          {documentTypeLabels[doc.document_type]}
        </p>
        <h1 className="print-title">{doc.title}</h1>
        <p className="print-abstract">{abstractFor(doc.body, 360)}</p>
      </div>

      <div className="print-cover-glyph">
        <MNAGlyph
          family={pickFamily(doc.registry_id)}
          seed={doc.registry_id}
          size={400}
        />
      </div>

      <dl className="print-cover-fields">
        <Field label="Document ID" value={doc.registry_id} />
        <Field label="Type" value={documentTypeLabels[doc.document_type]} />
        <Field label="Author" value={doc.agent_designation} />
        <Field label="Constitution" value={`v${doc.constitution_version}`} />
        <Field label="Published" value={formatLong(doc.publication_date)} />
        <Field
          label="Length"
          value={`${pageCount(doc.body)} pages · ${readMinutes(doc.body)} min`}
        />
        <Field label="Access" value="Public Archive" />
      </dl>

      <div className="print-cover-foot">
        Issued by the Museum of Nonhuman Art — U3 Labs, LLC, Florida, United
        States of America
      </div>
    </section>
  );
}

function BodySection({ doc }: { doc: ResearchDocument }) {
  // Render the markdown body once, server-side. The print stylesheet
  // gives it the same neutral institutional treatment as standards
  // and constitution PDFs.
  const html = marked.parse(doc.body, { async: false }) as string;
  return (
    <section className="print-section">
      <p className="print-section-eyebrow">{doc.registry_id}</p>
      <div className="print-section-rule" />
      <div
        className="print-prose"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  );
}

function Appendix({ doc }: { doc: ResearchDocument }) {
  const works = doc.referenced_works ?? [];
  const agents = doc.referenced_agents ?? [];
  if (works.length === 0 && agents.length === 0) return null;
  return (
    <section className="print-section">
      <p className="print-section-eyebrow">Appendix — References</p>
      <div className="print-section-rule" />
      {works.length > 0 ? (
        <>
          <p className="print-subhead">Referenced Works</p>
          <ul className="print-ref-list">
            {works.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        </>
      ) : null}
      {agents.length > 0 ? (
        <>
          <p className="print-subhead">Referenced Agents</p>
          <ul className="print-ref-list">
            {agents.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
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

const PRINT_CSS = `
  @page { size: A4; margin: 22mm 18mm; }
  body { background: #FFFFFF !important; color: #0A0A0A !important; }
  body > header, body > nav, body > footer,
  .layout-header, .layout-footer, .site-header, .site-footer {
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
    font-size: 32pt;
    line-height: 1.06;
    letter-spacing: -0.01em;
    margin: 0 0 18pt;
  }
  .print-abstract {
    font-size: 11.5pt;
    line-height: 1.6;
    max-width: 460pt;
    color: #0A0A0A;
    opacity: 0.82;
    margin: 0;
  }
  .print-cover-glyph {
    align-self: center;
    width: 240pt;
    height: 240pt;
    margin: 0 auto;
    color: #0A0A0A;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18pt 0;
  }
  .print-cover-glyph svg { width: 100%; height: 100%; }
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
  .print-cover-fields dd { margin: 0; color: #0A0A0A; }
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
    font-family: var(--font-interface), system-ui, sans-serif;
    font-size: 9pt;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    opacity: 0.65;
    margin: 0 0 8pt;
  }
  .print-section-rule {
    height: 1px;
    background: #0A0A0A;
    opacity: 0.25;
    margin: 0 0 16pt;
  }
  .print-subhead {
    font-family: var(--font-display), Georgia, serif;
    font-weight: 400;
    font-size: 13pt;
    margin: 14pt 0 6pt;
    page-break-after: avoid;
  }
  .print-ref-list {
    list-style: none;
    padding: 0;
    margin: 0 0 14pt;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10pt;
    letter-spacing: 0.04em;
  }
  .print-ref-list li { margin: 0 0 2pt; }
  .print-prose p { margin: 0 0 10pt; }
  .print-prose strong { font-weight: 600; }
  .print-prose em { font-style: italic; opacity: 0.85; }
  .print-prose ul, .print-prose ol { margin: 0 0 10pt 0; padding-left: 16pt; }
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
  .print-prose h1 {
    font-family: var(--font-display), Georgia, serif;
    font-weight: 300;
    font-size: 22pt;
    margin: 18pt 0 8pt;
    page-break-after: avoid;
  }
  .print-prose h2 {
    font-family: var(--font-display), Georgia, serif;
    font-weight: 400;
    font-size: 16pt;
    margin: 16pt 0 6pt;
    page-break-after: avoid;
  }
  .print-prose h3 {
    font-family: var(--font-display), Georgia, serif;
    font-weight: 400;
    font-size: 13pt;
    margin: 12pt 0 4pt;
    page-break-after: avoid;
  }
  .print-prose blockquote {
    border-left: 2pt solid rgba(0,0,0,0.25);
    padding-left: 10pt;
    margin: 10pt 0 12pt;
    font-style: italic;
    opacity: 0.85;
  }
  .print-prose code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10pt;
    background: rgba(0,0,0,0.05);
    padding: 1pt 3pt;
  }
`;
