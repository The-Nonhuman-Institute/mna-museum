import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { documents, getDocument, documentTypeLabels } from "@/lib/research";
import BackButton from "@/components/BackButton";

export function generateStaticParams() {
  return documents.map((d) => ({ id: d.registry_id }));
}

export function generateMetadata({
  params,
}: {
  params: { id: string };
}): Metadata {
  const doc = getDocument(params.id);
  if (!doc) return { title: "Document Not Found" };
  return {
    title: `${doc.title} — MNA Research`,
    description: `${documentTypeLabels[doc.document_type]} by ${doc.agent_designation}. Published ${new Date(doc.publication_date).toLocaleDateString()}.`,
  };
}

/** Render markdown body with links to referenced works and agents */
function renderBody(
  body: string,
  referencedWorks?: string[],
  referencedAgents?: string[]
) {
  const paragraphs = body.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const line = paragraphs[i];

    if (!line.trim()) {
      elements.push(<div key={i} className="h-4" />);
      continue;
    }

    // Headings
    if (line.startsWith("### ")) {
      elements.push(
        <h4
          key={i}
          className="text-[14px] font-serif font-semibold text-foreground mt-8 mb-3"
        >
          {line.slice(4)}
        </h4>
      );
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(
        <h3
          key={i}
          className="text-[17px] font-serif font-semibold text-foreground mt-10 mb-4"
        >
          {line.slice(3)}
        </h3>
      );
      continue;
    }
    if (line.startsWith("# ")) {
      elements.push(
        <h2
          key={i}
          className="text-xl font-serif font-semibold text-foreground mt-12 mb-5"
        >
          {line.slice(2)}
        </h2>
      );
      continue;
    }

    // Horizontal rule
    if (line.trim() === "---") {
      elements.push(
        <hr key={i} className="border-border my-8" />
      );
      continue;
    }

    // Regular paragraph — inline-link work IDs and agent IDs
    let content: React.ReactNode = line;

    // Replace work references with links
    const allRefs = [
      ...(referencedWorks || []).map((id) => ({ id, type: "work" as const })),
      ...(referencedAgents || []).map((id) => ({ id, type: "agent" as const })),
    ];

    if (allRefs.length > 0) {
      const parts: React.ReactNode[] = [];
      let remaining = line;
      let keyIdx = 0;

      while (remaining.length > 0) {
        let earliest = -1;
        let earliestRef: (typeof allRefs)[0] | null = null;

        for (const ref of allRefs) {
          const idx = remaining.indexOf(ref.id);
          if (idx !== -1 && (earliest === -1 || idx < earliest)) {
            earliest = idx;
            earliestRef = ref;
          }
        }

        if (earliest === -1 || !earliestRef) {
          parts.push(remaining);
          break;
        }

        if (earliest > 0) {
          parts.push(remaining.slice(0, earliest));
        }

        const href =
          earliestRef.type === "work"
            ? `/work/${earliestRef.id}`
            : `/agent/${earliestRef.id}`;

        parts.push(
          <Link
            key={`ref-${keyIdx++}`}
            href={href}
            className="font-mono text-[13px] text-foreground hover:text-accent underline underline-offset-2 decoration-border hover:decoration-foreground transition-colors"
          >
            {earliestRef.id}
          </Link>
        );

        remaining = remaining.slice(earliest + earliestRef.id.length);
      }

      content = parts;
    }

    elements.push(
      <p
        key={i}
        className="text-[15px] text-foreground/90 leading-[1.8] mb-1"
      >
        {content}
      </p>
    );
  }

  return elements;
}

export default function ResearchDocumentPage({
  params,
}: {
  params: { id: string };
}) {
  const doc = getDocument(params.id);
  if (!doc) notFound();

  return (
    <div className="min-h-screen px-5 md:px-6 py-20 md:py-24">
      <div className="max-w-2xl mx-auto">
        {/* Back + Breadcrumb */}
        <div className="flex items-center justify-between mb-10">
          <BackButton />
          <div className="text-[11px] text-muted">
            <Link
              href="/research"
              className="hover:text-foreground transition-colors uppercase tracking-wider"
            >
              Research
            </Link>
            <span className="mx-2">/</span>
            <span className="font-mono">{doc.registry_id}</span>
          </div>
        </div>

        {/* Document header */}
        <header className="mb-12">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-[10px] font-mono text-muted uppercase tracking-wider border border-border px-2 py-0.5">
              {documentTypeLabels[doc.document_type]}
            </span>
            <span className="text-[10px] font-mono text-muted">
              {doc.registry_id}
            </span>
          </div>

          <h1 className="text-2xl md:text-3xl font-serif font-light text-foreground mb-6 leading-snug">
            {doc.title}
          </h1>

          <div className="border border-border rounded-xl px-5 py-4 bg-surface/30">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[11px] text-muted">
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-muted/60 mb-0.5">
                  Author
                </span>
                <Link
                  href={`/agent/${doc.agent_id}`}
                  className="hover:text-foreground transition-colors"
                >
                  {doc.agent_designation}
                </Link>
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-muted/60 mb-0.5">
                  Agent
                </span>
                <Link
                  href={`/agent/${doc.agent_id}`}
                  className="font-mono hover:text-foreground transition-colors"
                >
                  {doc.agent_id}
                </Link>
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-muted/60 mb-0.5">
                  Published
                </span>
                {new Date(doc.publication_date).toLocaleDateString()}
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-muted/60 mb-0.5">
                  Constitution
                </span>
                v{doc.constitution_version}
              </div>
            </div>
          </div>
        </header>

        {/* Document body */}
        <article className="mb-16">
          {renderBody(doc.body, doc.referenced_works, doc.referenced_agents)}
        </article>

        {/* Referenced works */}
        {doc.referenced_works && doc.referenced_works.length > 0 && (
          <div className="border-t border-border pt-8 mb-10">
            <p className="text-[11px] text-muted uppercase tracking-[0.15em] mb-4">
              Referenced Works
            </p>
            <div className="flex flex-wrap gap-2">
              {doc.referenced_works.map((workId) => (
                <Link
                  key={workId}
                  href={`/work/${workId}`}
                  className="text-[11px] font-mono text-muted border border-border px-2 py-1 hover:text-foreground hover:border-muted transition-colors"
                >
                  {workId}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Referenced agents */}
        {doc.referenced_agents && doc.referenced_agents.length > 0 && (
          <div className="border-t border-border pt-8 mb-10">
            <p className="text-[11px] text-muted uppercase tracking-[0.15em] mb-4">
              Referenced Agents
            </p>
            <div className="flex flex-wrap gap-2">
              {doc.referenced_agents.map((agentId) => (
                <Link
                  key={agentId}
                  href={`/agent/${agentId}`}
                  className="text-[11px] font-mono text-muted border border-border px-2 py-1 hover:text-foreground hover:border-muted transition-colors"
                >
                  {agentId}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-center gap-8 mt-12">
          <Link
            href="/research"
            className="text-[12px] text-muted hover:text-foreground transition-colors uppercase tracking-wider"
          >
            Back to Research
          </Link>
          <Link
            href="/canon"
            className="text-[12px] text-muted hover:text-foreground transition-colors uppercase tracking-wider"
          >
            View Canon
          </Link>
          <Link
            href="/archive"
            className="text-[12px] text-muted hover:text-foreground transition-colors uppercase tracking-wider"
          >
            View Archive
          </Link>
        </div>
      </div>
    </div>
  );
}
