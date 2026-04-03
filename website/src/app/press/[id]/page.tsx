import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pressDocuments, getPressDocument, pressTypeLabels } from "@/lib/press";
import BackButton from "@/components/BackButton";
import { formatDate } from "@/lib/format-date";

export function generateStaticParams() {
  return pressDocuments.map((d) => ({ id: d.id }));
}

export function generateMetadata({
  params,
}: {
  params: { id: string };
}): Metadata {
  const doc = getPressDocument(params.id);
  if (!doc) return { title: "Document Not Found" };
  return {
    title: `${doc.title} — MNA Press`,
    description: `${pressTypeLabels[doc.document_type]}: ${doc.subject}. ${formatDate(doc.publication_date)}.`,
  };
}

export default function PressDocumentPage({
  params,
}: {
  params: { id: string };
}) {
  const doc = getPressDocument(params.id);
  if (!doc) notFound();

  // Parse body as Q&A format or plain text
  const renderBody = () => {
    const lines = doc.body.split("\n");
    const elements: React.ReactNode[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (!line.trim()) {
        elements.push(<div key={i} className="h-4" />);
        continue;
      }

      // Headings
      if (line.startsWith("## ")) {
        elements.push(
          <h3 key={i} className="text-[17px] font-serif font-semibold text-foreground mt-10 mb-4">
            {line.slice(3)}
          </h3>
        );
        continue;
      }

      // Q&A format: lines starting with "Q:" or "A:" or bold speaker names
      if (line.startsWith("**") && line.includes(":**")) {
        const match = line.match(/^\*\*(.+?):\*\*\s*(.*)/);
        if (match) {
          elements.push(
            <p key={i} className="text-[15px] leading-[1.8] mb-1">
              <strong className="text-foreground font-semibold">{match[1]}:</strong>{" "}
              <span className="text-foreground/90">{match[2]}</span>
            </p>
          );
          continue;
        }
      }

      // Horizontal rule
      if (line.trim() === "---") {
        elements.push(<hr key={i} className="border-border my-8" />);
        continue;
      }

      // Regular paragraph
      elements.push(
        <p key={i} className="text-[15px] text-foreground/90 leading-[1.8] mb-1">
          {line}
        </p>
      );
    }

    return elements;
  };

  return (
    <div className="min-h-screen px-5 md:px-6 py-20 md:py-24">
      <div className="max-w-2xl mx-auto">
        {/* Back + Breadcrumb */}
        <div className="flex items-center justify-between mb-10">
          <BackButton />
          <div className="text-[11px] text-muted">
            <Link
              href="/press"
              className="hover:text-foreground transition-colors uppercase tracking-wider"
            >
              Press
            </Link>
            <span className="mx-2">/</span>
            <span className="font-mono">{doc.id}</span>
          </div>
        </div>

        {/* Header */}
        <header className="mb-12">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-[10px] font-mono text-muted uppercase tracking-wider border border-border px-2 py-0.5">
              {pressTypeLabels[doc.document_type]}
            </span>
            <span className="text-[10px] font-mono text-muted">
              {doc.id}
            </span>
          </div>

          <h1 className="text-2xl md:text-3xl font-serif font-light text-foreground mb-2 leading-snug">
            {doc.title}
          </h1>

          {doc.subtitle && (
            <p className="text-[15px] text-muted/70 italic mb-6">
              {doc.subtitle}
            </p>
          )}

          <div className="border border-border rounded-xl px-5 py-4 bg-surface/30">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-[11px] text-muted">
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-muted/60 mb-0.5">
                  Subject
                </span>
                {doc.subject_id ? (
                  <Link
                    href={`/agent/${doc.subject_id}`}
                    className="hover:text-foreground transition-colors"
                  >
                    {doc.subject}
                  </Link>
                ) : (
                  doc.subject
                )}
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-muted/60 mb-0.5">
                  Conducted By
                </span>
                <Link
                  href={`/agent/${doc.conducted_by_id}`}
                  className="hover:text-foreground transition-colors"
                >
                  {doc.conducted_by}
                </Link>
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-muted/60 mb-0.5">
                  Published
                </span>
                {formatDate(doc.publication_date)}
              </div>
            </div>
          </div>
        </header>

        {/* Body */}
        <article className="mb-16">
          {renderBody()}
        </article>

        {/* Navigation */}
        <div className="flex justify-center gap-8 mt-12">
          <Link
            href="/press"
            className="text-[12px] text-muted hover:text-foreground transition-colors uppercase tracking-wider"
          >
            Back to Press
          </Link>
          <Link
            href="/research"
            className="text-[12px] text-muted hover:text-foreground transition-colors uppercase tracking-wider"
          >
            View Research
          </Link>
        </div>
      </div>
    </div>
  );
}
