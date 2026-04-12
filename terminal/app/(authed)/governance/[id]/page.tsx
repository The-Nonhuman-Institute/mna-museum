import { notFound } from "next/navigation";
import { getInstitutionalTurso } from "@/lib/institutional-turso";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ActionCard from "@/components/ActionCard";

export const dynamic = "force-dynamic";

export default async function GovernanceDocPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getInstitutionalTurso();

  const rows = await db.execute({
    sql: "SELECT id, title, version, status, body, drafted_at, ratified_at FROM governance_documents WHERE id = ?",
    args: [id],
  });
  if (rows.rows.length === 0) notFound();
  const doc = rows.rows[0];

  const isPending = doc.status === "pending";

  return (
    <section className="px-5 py-6 pb-32">
      <div className="mb-6">
        <p className="label mb-2">{String(doc.id)} · v{String(doc.version)}</p>
        <h1 className="display text-2xl mb-2">{String(doc.title)}</h1>
        <div className="flex gap-4">
          <span className={`label ${isPending ? "text-attention" : "text-active"}`}>
            {isPending ? "Pending Ratification" : "Ratified"}
          </span>
          <span className="data-muted">
            {isPending
              ? `Drafted ${String(doc.drafted_at || "").slice(0, 10)}`
              : `Ratified ${String(doc.ratified_at || "").slice(0, 10)}`}
          </span>
        </div>
      </div>

      {isPending && (
        <div className="mb-6">
          <ActionCard
            title="This document is awaiting your ratification"
            subtitle="Once ratified, it becomes binding institutional law."
            actions={[
              {
                label: "Ratify This Document",
                endpoint: "/api/actions/ratify-document",
                body: { document_id: id },
                variant: "primary",
              },
            ]}
            borderColor="attention"
          />
        </div>
      )}

      <div className="prose-institutional font-serif text-sm text-foreground/90 leading-relaxed">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h1 className="text-xl font-serif font-medium mt-8 mb-4 text-foreground">{children}</h1>,
            h2: ({ children }) => <h2 className="text-lg font-serif font-medium mt-8 mb-3 text-foreground">{children}</h2>,
            h3: ({ children }) => <h3 className="text-base font-serif font-medium mt-6 mb-2 text-foreground">{children}</h3>,
            p: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
            ul: ({ children }) => <ul className="mb-4 pl-5 list-disc space-y-1">{children}</ul>,
            ol: ({ children }) => <ol className="mb-4 pl-5 list-decimal space-y-1">{children}</ol>,
            li: ({ children }) => <li className="leading-relaxed">{children}</li>,
            strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
            em: ({ children }) => <em className="italic">{children}</em>,
            code: ({ children }) => <code className="font-mono text-xs bg-surface px-1 py-0.5 border border-border">{children}</code>,
            blockquote: ({ children }) => <blockquote className="border-l-2 border-border pl-4 my-4 text-foreground/70 italic">{children}</blockquote>,
            hr: () => <hr className="my-8 border-border" />,
            table: ({ children }) => <div className="overflow-x-auto my-4"><table className="text-xs border-collapse border border-border w-full">{children}</table></div>,
            th: ({ children }) => <th className="border border-border px-3 py-2 text-left font-medium text-muted uppercase tracking-wider text-[10px]">{children}</th>,
            td: ({ children }) => <td className="border border-border px-3 py-2">{children}</td>,
          }}
        >
          {doc.body as string}
        </ReactMarkdown>
      </div>
    </section>
  );
}
