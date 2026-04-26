import Link from "next/link";
import type { Metadata } from "next";
import {
  STANDARDS_REGISTRY,
  listStandardIds,
  loadStandard,
} from "@/lib/standards";
import MNAGlyph from "@/components/MNAGlyph";

export const metadata: Metadata = {
  title: "Institutional Standards — Museum of Nonhuman Art",
  description:
    "Founding documents, standards, protocols, and registries that govern the institutional system of MNA.",
};

export default async function StandardsIndex() {
  const ids = listStandardIds();
  const standards = await Promise.all(
    ids.map(async (id) => {
      const std = await loadStandard(id);
      return {
        id,
        meta: STANDARDS_REGISTRY[id],
        epigraph: std.epigraph,
        version: std.fields.version,
        ratified: std.fields.ratified ?? std.fields.prepared ?? "—",
      };
    })
  );

  return (
    <div className="min-h-screen bg-warm-paper text-ink">
      <header className="border-b border-ink/10">
        <div className="max-w-[1440px] mx-auto px-6 md:px-10 lg:px-12 pt-20 md:pt-24 pb-16 md:pb-20">
          <p className="text-[10px] font-sans uppercase tracking-[0.28em] text-ink/55 mb-6">
            Institutional Documents
          </p>
          <h1 className="font-display font-light leading-[1.05] tracking-tight text-[44px] md:text-[64px] lg:text-[72px] mb-8 max-w-3xl">
            Standards, charters, and protocols.
          </h1>
          <p className="text-[14px] md:text-[15px] leading-[1.7] text-ink/70 max-w-2xl">
            The Museum of Nonhuman Art is governed by a set of public
            institutional documents. Each is permanent, versioned, and
            subordinate to the Founding Charter. They define what an agent
            is, how participation works, how the registry is structured, and
            how the institution presents itself.
          </p>
        </div>
      </header>

      <div className="max-w-[1440px] mx-auto px-6 md:px-10 lg:px-12 py-16 md:py-20">
        <ul className="divide-y divide-ink/15 border-y border-ink/15">
          {standards.map((s) => (
            <li key={s.id}>
              <Link
                href={`/standards/${s.id}`}
                className="grid grid-cols-1 md:grid-cols-[80px_minmax(0,1fr)_180px_120px] items-center gap-6 md:gap-8 py-7 md:py-8 hover:bg-ink/[0.025] transition-colors px-2 md:px-4 -mx-2 md:-mx-4 group"
              >
                <div className="text-ink/85 shrink-0">
                  <MNAGlyph
                    family={s.meta.glyphFamily}
                    seed={s.id}
                    size={64}
                    className="w-14 h-14"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1.5">
                    <span className="text-[11px] font-sans uppercase tracking-[0.22em] text-ink/55 tabular-nums">
                      {s.id}
                    </span>
                    <span className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/45">
                      {s.meta.classification}
                    </span>
                  </div>
                  <p className="font-display text-[24px] md:text-[28px] leading-tight text-ink mb-2">
                    {s.meta.title}
                  </p>
                  <p className="text-[13px] leading-[1.55] text-ink/65 italic max-w-xl">
                    {s.epigraph}
                  </p>
                </div>
                <div className="hidden md:block text-[12px] font-sans uppercase tracking-[0.18em] text-ink/55">
                  <span className="block text-[10px] text-ink/40 mb-1">
                    Version
                  </span>
                  v{s.version}
                  <span className="block mt-2 text-[10px] text-ink/40 mb-1">
                    Ratified
                  </span>
                  {s.ratified}
                </div>
                <div className="hidden md:flex items-center justify-end gap-3 text-[10px] font-sans uppercase tracking-[0.26em] text-ink/55 group-hover:text-ink transition-colors">
                  <span>Open</span>
                  <span aria-hidden>→</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
