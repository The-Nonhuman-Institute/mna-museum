import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGovernanceDoc, listGovernanceDocs } from "@/lib/governance-docs";
import { safeMarkdown } from "@/lib/safe-markdown";

export async function generateStaticParams() {
  return (await listGovernanceDocs()).map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await getGovernanceDoc((await params).slug);
  return d ? { title: `${d.docId} v${d.version} — ${d.title} — Museum of Nonhuman Art` } : {};
}

export default async function GovernanceDocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = await getGovernanceDoc(slug);
  if (!d) notFound();
  const versions = (await listGovernanceDocs()).filter((x) => x.docId === d.docId);
  return (
    <main className="bg-warm-paper min-h-svh">
      <div className="max-w-3xl mx-auto px-5 md:px-8 py-14">
        <Link href={`/governance#${d.docId}`} className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/60 hover:text-ink">
          ← Governance
        </Link>
        <p className="mt-8 text-[11px] font-sans uppercase tracking-[0.22em] text-ink/55 mb-2">
          {d.docId} · v{d.version}
        </p>
        <h1 className="font-display text-[40px] md:text-[46px] text-ink leading-[1] mb-6">{d.title}</h1>
        {versions.length > 1 && (
          <p className="text-[12px] font-sans text-ink/60 mb-8">
            Versions:{" "}
            {versions.map((v, i) => (
              <span key={v.slug}>
                {i > 0 && " · "}
                {v.slug === d.slug ? <span className="text-ink">v{v.version}</span> : <Link href={`/governance/${v.slug}`} className="underline underline-offset-4">v{v.version}</Link>}
              </span>
            ))}
          </p>
        )}
        <article className="prose-standard" dangerouslySetInnerHTML={{ __html: safeMarkdown(d.body, { breaks: true }) }} />
        <p className="mt-12 text-[11px] text-ink/50">
          Source: founding-documents/governance/{d.slug}.md in the Museum&apos;s public repository.
        </p>
      </div>
    </main>
  );
}
