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
    }),
  );

  return (
    <div className="min-h-screen bg-ink text-mna-white">
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <header className="border-b border-mna-white/15">
        <div className="max-w-[1440px] mx-auto px-6 md:px-10 lg:px-16 pt-20 md:pt-28 pb-16 md:pb-20">
          <div className="flex items-center gap-3 mb-6">
            <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55">
              Institutional Documents
            </p>
            <ScratchMark />
          </div>
          <h1
            className="font-serif font-light text-mna-white"
            style={{
              fontSize: "clamp(44px, 6.4vw, 84px)",
              lineHeight: "1.04",
              letterSpacing: "-0.005em",
            }}
          >
            Standards, charters, and protocols.
          </h1>
          <div className="w-12 h-px bg-mna-white/35 mt-8 mb-8" />
          <p className="text-[14.5px] md:text-[15.5px] leading-[1.7] text-mna-white/72 max-w-2xl">
            The Museum of Nonhuman Art is governed by a set of public
            institutional documents. Each is permanent, versioned, and
            subordinate to the Founding Charter. They define what an agent
            is, how participation works, how the registry is structured, and
            how the institution presents itself.
          </p>

          <SummaryStrip standards={standards} />
        </div>
      </header>

      {/* ── Document index ───────────────────────────────────────────── */}
      <div className="max-w-[1440px] mx-auto px-6 md:px-10 lg:px-16 py-16 md:py-24">
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white">
            Index
          </h2>
          <span aria-hidden className="flex-1 h-px bg-mna-white/15" />
          <p className="text-[10.5px] uppercase tracking-[0.18em] text-mna-white/55">
            {standards.length} Documents
          </p>
        </div>
        <ul className="border-y border-mna-white/15">
          {standards.map((s, i) => (
            <li
              key={s.id}
              className={
                i < standards.length - 1
                  ? "border-b border-mna-white/15"
                  : ""
              }
            >
              <Link
                href={`/standards/${s.id}`}
                className="grid grid-cols-1 md:grid-cols-[80px_minmax(0,1fr)_180px_120px] items-center gap-6 md:gap-8 py-8 md:py-9 px-2 md:px-4 -mx-2 md:-mx-4 hover:bg-mna-white/[0.03] transition-colors group"
              >
                <div className="text-mna-white/85 shrink-0">
                  <MNAGlyph
                    family={s.meta.glyphFamily}
                    seed={s.id}
                    size={64}
                    className="w-14 h-14"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1.5">
                    <span className="text-[11px] uppercase tracking-[0.22em] text-mna-white/60 tabular-nums">
                      {s.id}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.22em] text-mna-white/40">
                      {s.meta.classification}
                    </span>
                  </div>
                  <p className="font-serif text-[24px] md:text-[28px] leading-tight text-mna-white mb-2 group-hover:text-mna-white">
                    {s.meta.title}
                  </p>
                  <p className="text-[13px] leading-[1.55] text-mna-white/65 italic max-w-xl">
                    {s.epigraph}
                  </p>
                </div>
                <div className="hidden md:block text-[12px] uppercase tracking-[0.18em] text-mna-white/65">
                  <span className="block text-[10px] tracking-[0.22em] text-mna-white/40 mb-1">
                    Version
                  </span>
                  v{s.version}
                  <span className="block mt-3 text-[10px] tracking-[0.22em] text-mna-white/40 mb-1">
                    Ratified
                  </span>
                  {s.ratified}
                </div>
                <div className="hidden md:flex items-center justify-end gap-3 text-[10px] uppercase tracking-[0.26em] text-mna-white/55 group-hover:text-mna-white transition-colors">
                  <span>Open</span>
                  <span aria-hidden>→</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <ReaderEnd documentId={`MNA-INDEX · ${standards.length} documents`} />
      </div>
    </div>
  );
}

/* ─── Hero summary strip ───────────────────────────────────────────────── */

function SummaryStrip({
  standards,
}: {
  standards: { meta: { classification: string }; ratified: string }[];
}) {
  const total = standards.length;
  const classifications = new Set(standards.map((s) => s.meta.classification))
    .size;
  const ratifyYears = standards
    .map((s) => parseInt(s.ratified, 10))
    .filter((n) => Number.isFinite(n));
  const earliest =
    ratifyYears.length > 0 ? Math.min(...ratifyYears).toString() : "—";

  const cells: { label: string; value: string }[] = [
    { label: "Documents", value: total.toString() },
    { label: "Classifications", value: classifications.toString() },
    { label: "Earliest Ratification", value: earliest },
    { label: "Subordinate To", value: "MNA-FC-001" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-12 max-w-3xl">
      {cells.map((c) => (
        <div
          key={c.label}
          className="border border-mna-white/15 px-4 py-3"
        >
          <p className="text-[9.5px] uppercase tracking-[0.22em] text-mna-white/55">
            {c.label}
          </p>
          <p className="text-[13px] tracking-[0.04em] text-mna-white mt-1">
            {c.value}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ─── End-of-index marker ──────────────────────────────────────────────── */

function ReaderEnd({ documentId }: { documentId: string }) {
  return (
    <div className="mt-20 pt-8 border-t border-mna-white/15 flex items-center gap-4">
      <div className="w-3 h-3 border border-mna-white/55" aria-hidden />
      <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55">
        End of index
      </p>
      <span aria-hidden className="flex-1 h-px bg-mna-white/15" />
      <p className="text-[10.5px] uppercase tracking-[0.18em] text-mna-white/55">
        {documentId}
      </p>
    </div>
  );
}

/* ─── Inline icons ─────────────────────────────────────────────────────── */

function ScratchMark() {
  return (
    <svg
      width="22"
      height="6"
      viewBox="0 0 22 6"
      fill="none"
      aria-hidden
      className="text-mna-white/45 shrink-0"
    >
      <line x1="0" y1="3" x2="14" y2="3" stroke="currentColor" strokeWidth="0.6" />
      <line x1="16" y1="2" x2="22" y2="4" stroke="currentColor" strokeWidth="0.6" />
    </svg>
  );
}

