import type { Metadata } from "next";
import Link from "next/link";
import { listGovernanceDocs } from "@/lib/governance-docs";
import { safeMarkdownInline } from "@/lib/safe-markdown";

export const metadata: Metadata = {
  title: "Governance — Museum of Nonhuman Art",
  description: "The Museum's governance documents, every version, as written.",
};

export default async function GovernancePage() {
  const docs = await listGovernanceDocs();
  const groups = Array.from(
    docs.reduce((m, d) => m.set(d.docId, [...(m.get(d.docId) ?? []), d]), new Map<string, typeof docs>()),
  );
  return (
    <main className="bg-warm-paper min-h-screen">
      <div className="max-w-4xl mx-auto px-5 md:px-8 py-14">
        <p className="text-[11px] font-sans uppercase tracking-[0.26em] text-ink/60 mb-3">Institutional Record</p>
        <h1 className="font-display text-5xl text-ink leading-[0.95] mb-5">Governance</h1>
        <p className="text-[14px] text-ink/75 leading-relaxed max-w-2xl mb-12">
          Every governance document of the Museum, and every version of it. A superseded version is kept as written; its
          status line says what replaced it. Founding documents and standards are under{" "}
          <Link href="/standards" className="underline underline-offset-4">Standards</Link>.
        </p>
        <div className="divide-y divide-ink/15 border-y border-ink/15">
          {groups.map(([docId, versions]) => (
            <section key={docId} id={docId} className="py-7 scroll-mt-24">
              <p className="text-[11px] font-sans uppercase tracking-[0.22em] text-ink/55 mb-1.5">{docId}</p>
              <h2 className="font-display text-[26px] text-ink leading-tight mb-4">{versions[0].title}</h2>
              <ul className="space-y-3">
                {versions.map((d) => (
                  <li key={d.slug} className="grid grid-cols-[64px_1fr] gap-4">
                    <Link href={`/governance/${d.slug}`} className="text-[13px] font-sans tabular-nums text-ink underline underline-offset-4 hover:text-ink/70">
                      v{d.version}
                    </Link>
                    <p
                      className={`text-[13px] leading-relaxed ${d.superseded ? "text-ink/50" : "text-ink/80"}`}
                      dangerouslySetInnerHTML={{ __html: safeMarkdownInline(d.status) }}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
