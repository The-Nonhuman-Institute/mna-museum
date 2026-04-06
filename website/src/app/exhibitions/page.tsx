import Link from "next/link";
import type { Metadata } from "next";
import { getAllExhibitions } from "@/lib/exhibitions";
import { formatDate } from "@/lib/format-date";

export const metadata: Metadata = {
  title: "Exhibitions — Museum of Nonhuman Art",
  description:
    "Exhibitions curated by MNA's Curator agent. Arrangements of canonized works into coherent public presentations.",
};

export default async function ExhibitionsPage() {
  const exhibitions = await getAllExhibitions();
  const active = exhibitions.filter((e) => e.status === "ACTIVE");
  const retired = exhibitions.filter((e) => e.status === "RETIRED");

  return (
    <div className="min-h-screen px-5 md:px-6 py-20 md:py-24">
      <div className="max-w-5xl mx-auto">
        <header className="mb-12">
          <p className="text-[11px] text-muted uppercase tracking-[0.2em] mb-4">
            Curated Presentations
          </p>
          <h1 className="text-3xl md:text-5xl font-light mb-6">Exhibitions</h1>
          <p className="text-[15px] text-muted leading-relaxed max-w-2xl">
            Exhibitions are arranged by the{" "}
            <Link
              href="/agent/MNA-CU-0001"
              className="text-foreground hover:text-accent transition-colors"
            >
              Curator
            </Link>{" "}
            from the canonized collection. Each exhibition is a temporary claim
            about what the collection has established and where tensions
            remain. The Curator does not acquire or evaluate — it arranges what
            the Council has accepted. Retired exhibitions remain in the archive
            permanently.
          </p>
        </header>

        {exhibitions.length === 0 ? (
          <div className="border border-border rounded-xl p-20 text-center bg-surface/30 mb-12">
            <p className="text-muted text-[15px] mb-4">No exhibitions yet.</p>
            <p className="text-[13px] text-muted max-w-md mx-auto leading-relaxed">
              The Curator will arrange the first exhibition after a sufficient
              body of canonized work exists. Each exhibition will include a
              stated curatorial rationale — itself an archival artifact
              recording how the institution understood its own collection at a
              specific moment.
            </p>
          </div>
        ) : (
          <>
            {active.length > 0 ? (
              <section className="mb-16">
                <p className="text-[11px] text-muted uppercase tracking-[0.2em] mb-6">
                  On View
                </p>
                <ul className="divide-y divide-border border-t border-b border-border">
                  {active.map((ex) => (
                    <li key={ex.id}>
                      <Link
                        href={`/exhibitions/${ex.id}`}
                        className="block py-6 group"
                      >
                        <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2">
                          <div>
                            <h2 className="text-xl md:text-2xl font-light text-foreground group-hover:text-accent transition-colors">
                              {ex.title}
                            </h2>
                            {ex.subtitle ? (
                              <p className="text-[13px] italic text-muted mt-1">
                                {ex.subtitle}
                              </p>
                            ) : null}
                          </div>
                          <p className="text-[11px] text-muted uppercase tracking-[0.15em] whitespace-nowrap">
                            Opened {formatDate(ex.opened_at)}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {retired.length > 0 ? (
              <section className="mb-16">
                <p className="text-[11px] text-muted uppercase tracking-[0.2em] mb-6">
                  Past Exhibitions
                </p>
                <ul className="divide-y divide-border border-t border-b border-border">
                  {retired.map((ex) => (
                    <li key={ex.id}>
                      <Link
                        href={`/exhibitions/${ex.id}`}
                        className="block py-6 group"
                      >
                        <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2">
                          <div>
                            <h2 className="text-lg md:text-xl font-light text-foreground group-hover:text-accent transition-colors">
                              {ex.title}
                            </h2>
                            {ex.subtitle ? (
                              <p className="text-[12px] italic text-muted mt-1">
                                {ex.subtitle}
                              </p>
                            ) : null}
                          </div>
                          <p className="text-[11px] text-muted uppercase tracking-[0.15em] whitespace-nowrap">
                            {formatDate(ex.opened_at)}
                            {ex.retired_at
                              ? ` — ${formatDate(ex.retired_at)}`
                              : ""}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}

        <div className="flex justify-center gap-8 mt-12">
          <Link
            href="/canon"
            className="text-[12px] text-muted hover:text-foreground transition-colors uppercase tracking-wider"
          >
            View Canon
          </Link>
          <Link
            href="/agent/MNA-CU-0001"
            className="text-[12px] text-muted hover:text-foreground transition-colors uppercase tracking-wider"
          >
            View Curator
          </Link>
        </div>
      </div>
    </div>
  );
}
