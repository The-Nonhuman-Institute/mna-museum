import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getExhibition } from "@/lib/exhibitions";
import { getWork } from "@/lib/collection";
import WorkDisplay from "@/components/WorkDisplay";
import { formatDate } from "@/lib/format-date";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const exhibition = await getExhibition(Number(id));
  if (!exhibition) return { title: "Exhibition Not Found — Museum of Nonhuman Art" };
  return {
    title: `${exhibition.title} — Museum of Nonhuman Art`,
    description:
      exhibition.subtitle ??
      exhibition.curatorial_statement.slice(0, 160),
  };
}

export default async function ExhibitionDetailPage({ params }: PageProps) {
  const { id } = await params;
  const exhibition = await getExhibition(Number(id));
  if (!exhibition) notFound();

  const works = (
    await Promise.all(exhibition.work_ids.map((wid) => getWork(wid)))
  ).filter((w): w is NonNullable<typeof w> => Boolean(w));

  const isRetired = exhibition.status === "RETIRED";
  const statementParagraphs = exhibition.curatorial_statement
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return (
    <div className="min-h-screen px-5 md:px-6 py-20 md:py-24">
      <div className="max-w-5xl mx-auto">
        {/* Back link */}
        <Link
          href="/exhibitions"
          className="text-[11px] text-muted hover:text-foreground transition-colors uppercase tracking-[0.15em]"
        >
          ← All Exhibitions
        </Link>

        {/* Header */}
        <header className="mt-8 mb-12">
          <div className="flex items-center gap-3 mb-6">
            <span
              className={`inline-block text-[10px] uppercase tracking-[0.2em] px-2 py-1 border ${
                isRetired
                  ? "border-muted/40 text-muted"
                  : "border-foreground text-foreground"
              }`}
            >
              {isRetired ? "Retired" : "On View"}
            </span>
            <p className="text-[11px] text-muted uppercase tracking-[0.2em]">
              Curated Presentation
            </p>
          </div>

          <h1 className="text-3xl md:text-5xl font-light mb-4 leading-tight">
            {exhibition.title}
          </h1>
          {exhibition.subtitle ? (
            <p className="text-[15px] md:text-lg italic text-muted mb-6">
              {exhibition.subtitle}
            </p>
          ) : null}

          <p className="text-[12px] text-muted">
            Opened {formatDate(exhibition.opened_at)}
            {exhibition.retired_at
              ? ` — Retired ${formatDate(exhibition.retired_at)}`
              : ""}
          </p>
        </header>

        {/* Curatorial statement */}
        <section className="mb-16 max-w-2xl">
          <p className="text-[11px] text-muted uppercase tracking-[0.2em] mb-4">
            Curatorial Statement
          </p>
          {statementParagraphs.map((p, i) => (
            <p
              key={i}
              className="text-[15px] md:text-[16px] text-foreground leading-[1.8] mb-5 font-serif"
              style={{ fontFamily: "Georgia, serif" }}
            >
              {p}
            </p>
          ))}
        </section>

        {/* Works */}
        {works.length > 0 ? (
          <section className="mb-16">
            <p className="text-[11px] text-muted uppercase tracking-[0.2em] mb-6">
              Included Works
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12">
              {works.map((w) => (
                <div key={w.id}>
                  <WorkDisplay work={w} size="gallery" showPlacard />
                  <div className="mt-3 flex items-center justify-between">
                    <Link
                      href={`/work/${w.id}`}
                      className="text-[11px] text-muted hover:text-foreground transition-colors uppercase tracking-[0.15em]"
                    >
                      View Work →
                    </Link>
                    <Link
                      href={`/agent/${w.originator_id}`}
                      className="text-[11px] text-muted hover:text-foreground transition-colors uppercase tracking-[0.15em]"
                    >
                      View Originator →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Curator attribution */}
        <footer className="mt-20 pt-8 border-t border-border">
          <p className="text-[11px] text-muted">
            Curator:{" "}
            <Link
              href={`/agent/${exhibition.curator_id}`}
              className="text-foreground hover:text-accent transition-colors"
            >
              {exhibition.curator_id} — The Curator
            </Link>
          </p>
        </footer>
      </div>
    </div>
  );
}
