import MNAComposition, {
  COMPOSITIONS,
  ALL_COMPOSITIONS,
  type CompositionTheme,
} from "@/components/MNAComposition";

export const metadata = {
  title: "Composition Library — Museum of Nonhuman Art",
  description:
    "Poster-scale procedural compositions modeled on the brand-board Visual Language pieces. Used for hero placeholders, work-without-render fallbacks, exhibition group covers, OG share cards.",
};

const SAMPLE_SEEDS = [
  "mna.cmp.alpha",
  "mna.cmp.beta",
  "mna.cmp.gamma",
  "mna.cmp.delta",
];

export default function CompositionsCatalog() {
  return (
    <div className="bg-ink text-mna-white min-h-screen">
      <div className="max-w-[1440px] mx-auto px-6 md:px-10 lg:px-14 py-14 md:py-20">
        <header className="mb-14 md:mb-20 max-w-[820px]">
          <p className="text-[10px] font-sans uppercase tracking-[0.28em] text-mna-white/55 mb-5 inline-flex items-center gap-2">
            <span>Institutional Library</span>
            <span className="inline-block w-[5px] h-[5px] rounded-full bg-mna-white" />
          </p>
          <h1 className="font-display font-light leading-[1.05] tracking-tight text-[44px] md:text-[64px] lg:text-[72px] text-mna-white">
            Composition Library
          </h1>
          <p className="mt-6 text-[14px] md:text-[15px] leading-[1.7] text-mna-white/70 max-w-[62ch]">
            Poster-scale procedural compositions modeled on the brand
            board&rsquo;s Visual Language pieces. Each theme is rendered from a
            deterministic seed. Companion to the Glyph Library — same system,
            different scale: glyphs are dense small marks, compositions are
            atmospheric large pieces with a single dominant gesture.
          </p>
          <div className="mt-8 flex flex-wrap gap-x-10 gap-y-3 text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/55">
            <span>
              <span className="text-mna-white">{ALL_COMPOSITIONS.length}</span>{" "}
              Themes
            </span>
            <span>
              <span className="text-mna-white">{ALL_COMPOSITIONS.length * SAMPLE_SEEDS.length}</span>{" "}
              Sampled Instances
            </span>
            <span>
              <span className="text-mna-white">∞</span> Seeded Variants
            </span>
          </div>
        </header>

        <div className="space-y-24 md:space-y-28">
          {ALL_COMPOSITIONS.map((theme) => (
            <ThemeRow key={theme} theme={theme} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ThemeRow({ theme }: { theme: CompositionTheme }) {
  const meta = COMPOSITIONS[theme];
  return (
    <section>
      <div className="grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] gap-8 md:gap-12 mb-8 md:mb-10 border-b border-mna-white/15 pb-6">
        <div>
          <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-mna-white/50 mb-2 tabular-nums">
            {String(ALL_COMPOSITIONS.indexOf(theme) + 1).padStart(2, "0")} —{" "}
            {meta.key}
          </p>
          <h2 className="font-display text-[36px] md:text-[44px] leading-[1.05] text-mna-white">
            {meta.label}
          </h2>
        </div>
        <div className="self-end pb-1">
          <p className="font-display italic text-[19px] md:text-[22px] leading-[1.4] text-mna-white/85 max-w-[60ch]">
            &ldquo;{meta.caption}&rdquo;
          </p>
          <p className="mt-3 text-[12px] leading-[1.6] text-mna-white/55 max-w-[62ch]">
            {meta.description}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[10px] font-sans uppercase tracking-[0.2em] text-mna-white/45">
            <span>Default Aspect: {meta.defaultAspect}</span>
            <span>Default Tone: {meta.defaultTone}</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
        {SAMPLE_SEEDS.map((seed, i) => (
          <figure
            key={seed}
            className="relative overflow-hidden border border-mna-white/[0.12] bg-mna-white/[0.015]"
          >
            <MNAComposition
              theme={theme}
              seed={seed}
              showCaption
              className="block w-full h-auto"
            />
            <figcaption className="absolute top-3 right-3 text-[8px] font-sans tracking-[0.18em] text-mna-white/45 uppercase tabular-nums bg-ink/60 px-2 py-1">
              {seed.split(".").pop()} · {String(i + 1).padStart(2, "0")}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
