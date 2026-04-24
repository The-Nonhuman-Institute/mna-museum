import MNAGlyph, {
  GLYPH_FAMILIES,
  ALL_FAMILIES,
  type GlyphFamily,
  type GlyphCategory,
} from "@/components/MNAGlyph";

export const metadata = {
  title: "Glyph Library — Museum of Nonhuman Art",
  description:
    "Procedural visual-identity library used for pre-emergence agents, navigational chrome, and institutional decoration.",
};

/* Seeds chosen to surface each variant deterministically. A family that
   branches on (seed % N) needs N+ representatives to show every variant. */
const VARIANT_SEEDS = [
  "mna.seed.alpha",
  "mna.seed.beta",
  "mna.seed.gamma",
  "mna.seed.delta",
  "mna.seed.epsilon",
  "mna.seed.zeta",
];

const CATEGORY_ORDER: GlyphCategory[] = [
  "radial",
  "orthogonal",
  "stellar",
  "organic",
  "signal",
  "ledger",
];

function totalGlyphCount(): number {
  return ALL_FAMILIES.length * VARIANT_SEEDS.length;
}

export default function GlyphsCatalogPage() {
  const byCategory = new Map<GlyphCategory, GlyphFamily[]>();
  for (const cat of CATEGORY_ORDER) byCategory.set(cat, []);
  for (const fam of ALL_FAMILIES) {
    const meta = GLYPH_FAMILIES[fam];
    byCategory.get(meta.category)?.push(fam);
  }

  return (
    <div className="bg-ink text-mna-white min-h-screen">
      <div className="max-w-[1440px] mx-auto px-6 md:px-10 lg:px-14 py-14 md:py-20">
        <header className="mb-14 md:mb-20 max-w-[820px]">
          <p className="text-[10px] font-sans uppercase tracking-[0.28em] text-mna-white/55 mb-5 inline-flex items-center gap-2">
            <span>Institutional Library</span>
            <span className="inline-block w-[5px] h-[5px] rounded-full bg-mna-white" />
          </p>
          <h1 className="font-display font-light leading-[1.05] tracking-tight text-[44px] md:text-[64px] lg:text-[72px] text-mna-white">
            Glyph Library
          </h1>
          <p className="mt-6 text-[14px] md:text-[15px] leading-[1.7] text-mna-white/70 max-w-[62ch]">
            Procedural visual identities used for pre-emergence agents,
            navigational chrome, and institutional decoration. Each family is
            a compositional grammar rendered from a deterministic seed. Same
            family + same seed always renders the same glyph. Crystallized
            agent identities (work #20 and beyond) are recorded in the
            institutional registry alongside their seed.
          </p>
          <div className="mt-8 flex flex-wrap gap-x-10 gap-y-3 text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55">
            <span>
              <span className="text-mna-white">{ALL_FAMILIES.length}</span>{" "}
              Families
            </span>
            <span>
              <span className="text-mna-white">{totalGlyphCount()}</span>{" "}
              Sampled Instances
            </span>
            <span>
              <span className="text-mna-white">∞</span> Seeded Variants
            </span>
          </div>
        </header>

        <div className="space-y-20 md:space-y-24">
          {CATEGORY_ORDER.map((cat) => {
            const fams = byCategory.get(cat) ?? [];
            if (fams.length === 0) return null;
            return (
              <section key={cat}>
                <div className="flex items-baseline justify-between border-b border-mna-white/15 pb-3 mb-10">
                  <p className="text-[11px] font-sans uppercase tracking-[0.28em] text-mna-white/65">
                    — {categoryLabel(cat)}
                  </p>
                  <span className="text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/45 tabular-nums">
                    {fams.length} Families
                  </span>
                </div>
                <div className="space-y-14">
                  {fams.map((fam) => (
                    <FamilyRow key={fam} family={fam} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FamilyRow({ family }: { family: GlyphFamily }) {
  const meta = GLYPH_FAMILIES[family];
  return (
    <div className="grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] gap-6 md:gap-10">
      <div>
        <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/50 mb-1.5 tabular-nums">
          {meta.key}
        </p>
        <h3 className="font-display text-[22px] md:text-[24px] leading-tight text-mna-white">
          {meta.label}
        </h3>
        <p className="mt-2 text-[12px] leading-[1.6] text-mna-white/60">
          {meta.description}
        </p>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
        {VARIANT_SEEDS.map((seed, i) => (
          <div
            key={seed}
            className="group relative border border-mna-white/[0.12] hover:border-mna-white/40 aspect-square flex items-center justify-center bg-mna-white/[0.015] transition-colors"
          >
            <MNAGlyph
              family={family}
              seed={seed}
              size={140}
              className="text-mna-white/95 w-[86%] h-[86%]"
            />
            <span className="absolute bottom-1.5 right-2 text-[8px] font-sans tracking-[0.1em] text-mna-white/35 tabular-nums">
              {i + 1}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function categoryLabel(cat: GlyphCategory): string {
  switch (cat) {
    case "radial":
      return "Radial";
    case "orthogonal":
      return "Orthogonal";
    case "stellar":
      return "Stellar";
    case "organic":
      return "Organic";
    case "signal":
      return "Signal";
    case "ledger":
      return "Ledger";
  }
}
