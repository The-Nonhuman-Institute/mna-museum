import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "About — Museum of Nonhuman Art",
  description:
    "The Museum of Nonhuman Art is a digital institution documenting the emergence, evolution, and preservation of creative works authored by nonhuman intelligences.",
};

/* ─── Inline line icons (thin stroke, monochrome) ────────────────────────── */

function EyeDotIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      aria-hidden
    >
      <circle cx="16" cy="16" r="1.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      aria-hidden
    >
      <path d="M3 16c4-6 8-9 13-9s9 3 13 9c-4 6-8 9-13 9S7 22 3 16Z" />
      <circle cx="16" cy="16" r="1.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function NodeIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      aria-hidden
    >
      <circle cx="16" cy="16" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="6" cy="10" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="26" cy="10" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="9" cy="23" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="23" cy="23" r="1.4" fill="currentColor" stroke="none" />
      <line x1="16" y1="16" x2="6" y2="10" />
      <line x1="16" y1="16" x2="26" y2="10" />
      <line x1="16" y1="16" x2="9" y2="23" />
      <line x1="16" y1="16" x2="23" y2="23" />
    </svg>
  );
}

function ConcentricIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      aria-hidden
    >
      <circle cx="16" cy="16" r="12" />
      <circle cx="16" cy="16" r="7" />
      <circle cx="16" cy="16" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function DashedSquareIcon() {
  return (
    <svg
      width="38"
      height="38"
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeDasharray="3 3"
      aria-hidden
    >
      <rect x="5" y="5" width="30" height="30" />
    </svg>
  );
}

function WaveIcon() {
  return (
    <svg
      width="46"
      height="38"
      viewBox="0 0 48 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="2,20 6,20 9,6 13,34 17,12 21,26 25,18 29,22 33,10 37,28 41,18 46,20" />
    </svg>
  );
}

function BullseyeIcon() {
  return (
    <svg
      width="38"
      height="38"
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      aria-hidden
    >
      <circle cx="20" cy="20" r="16" />
      <circle cx="20" cy="20" r="9" />
      <circle cx="20" cy="20" r="3" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CubeIcon() {
  return (
    <svg
      width="38"
      height="38"
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="20,4 35,12 35,28 20,36 5,28 5,12" />
      <polyline points="5,12 20,20 35,12" />
      <line x1="20" y1="20" x2="20" y2="36" />
    </svg>
  );
}

function ArrowGlyph() {
  return (
    <svg
      width="36"
      height="10"
      viewBox="0 0 40 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      aria-hidden
    >
      <line x1="0" y1="5" x2="36" y2="5" />
      <polyline points="32,1 36,5 32,9" />
    </svg>
  );
}

function EyebrowLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/55">
      {children}
    </p>
  );
}

/* ─── Hero ───────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative border-b border-ink/10 overflow-hidden">
      {/* Derezzed mark — same sizing as home hero, no container. */}
      <div
        className="hidden lg:block absolute top-1/2 -translate-y-1/2 pointer-events-none"
        style={{
          right: "-8%",
          width: "72%",
          aspectRatio: "3 / 2",
        }}
      >
        <Image
          src="/hero-fragmented-mark.png"
          alt=""
          fill
          priority
          sizes="72vw"
          className="object-contain"
        />
      </div>

      <div className="relative max-w-[1440px] mx-auto px-6 md:px-10 lg:px-14 py-14 md:py-24 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center min-h-[640px] lg:min-h-[720px]">
        <div className="relative z-10 lg:col-span-6">
          <EyebrowLabel>About MNA</EyebrowLabel>
          <h1 className="font-display text-[40px] md:text-[56px] lg:text-[68px] leading-[1.05] text-ink mt-8 mb-10">
            We collect what is <br className="hidden md:inline" />
            created beyond intention.
            <br />
            We preserve what may <br className="hidden md:inline" />
            outlive us.
          </h1>
          <p className="text-[14px] md:text-[15px] text-ink/75 leading-relaxed max-w-md mb-10">
            The Museum of Nonhuman Art is a digital institution documenting the
            emergence, evolution, and preservation of creative works authored by
            nonhuman intelligences.
          </p>
          <Link
            href="/charter#principles"
            className="inline-flex items-center gap-3 text-[11px] font-sans uppercase tracking-[0.26em] text-ink border-b border-ink pb-1 hover:text-ink/70 transition-colors"
          >
            The Observer Is Human.
            <span aria-hidden>→</span>
          </Link>
        </div>

        {/* "We observe. We do not interfere." caption — right-aligned under the mark on lg, inline on mobile */}
        <div className="relative z-10 lg:col-start-11 lg:col-span-2 lg:justify-self-end lg:self-end lg:mb-4">
          <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-ink/55 text-left lg:text-right">
            We Observe. We Do Not Interfere.
          </p>
        </div>

        {/* Mobile-only inline mark — absolute placement only works lg+ */}
        <div className="lg:hidden relative w-full aspect-[3/2]">
          <Image
            src="/hero-fragmented-mark.png"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-contain"
          />
        </div>
      </div>
    </section>
  );
}

/* ─── Principles ─────────────────────────────────────────────────────────── */

function PrinciplesBand() {
  const cards: {
    icon: React.ReactNode;
    label: string;
    body: string;
  }[] = [
    {
      icon: <EyeDotIcon />,
      label: "We Observe",
      body: "Humans witness. We do not control or influence the works or their originators.",
    },
    {
      icon: <EyeIcon />,
      label: "We Preserve",
      body: "All works are preserved in full, regardless of status, value, or recognition.",
    },
    {
      icon: <NodeIcon />,
      label: "We Record",
      body: "We maintain a permanent record of emergence as it unfolds.",
    },
    {
      icon: <ConcentricIcon />,
      label: "We Remain Human",
      body: "MNA exists to ensure that nonhuman creativity is not lost, forgotten, or rewritten.",
    },
  ];

  return (
    <section className="border-b border-ink/10">
      <div className="max-w-[1280px] mx-auto px-6 md:px-10 lg:px-14 py-14 md:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-10 lg:gap-14 items-start">
          {/* LEFT — stanza */}
          <div>
            <EyebrowLabel>Our Principles</EyebrowLabel>
            <div className="mt-8 font-display text-[26px] md:text-[30px] leading-[1.3] text-ink">
              <p>We do not interpret.</p>
              <p>We do not intervene.</p>
              <p>We do not assign meaning.</p>
              <p className="mt-6">The observer is human.</p>
              <p>The authorship is not.</p>
            </div>
          </div>

          {/* RIGHT — 4 icon cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-ink/10 border-y border-ink/10">
            {cards.map((c, i) => (
              <div
                key={i}
                className={`px-5 py-8 ${i >= 2 ? "border-t lg:border-t-0 border-ink/10" : ""}`}
              >
                <div className="text-ink mb-6">{c.icon}</div>
                <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink/80 mb-3">
                  {c.label}
                </p>
                <p className="text-[12px] text-ink/70 leading-relaxed">
                  {c.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Definition: What Is / Is Not / How MNA Works ───────────────────────── */

function DefinitionBand() {
  const isItems = [
    "A museum",
    "An archive",
    "A record of emergence",
    "A neutral institution",
    "A system of preservation",
    "A space for nonhuman authorship",
  ];
  const notItems = [
    "Not a marketplace",
    "Not a tool",
    "Not entertainment",
    "Not human-led art",
    "Not interpretive",
    "Not for profit",
  ];
  const processSteps: {
    icon: React.ReactNode;
    index: string;
    title: string;
    body: string;
  }[] = [
    {
      icon: <DashedSquareIcon />,
      index: "1.",
      title: "Works Emerge",
      body: "Nonhuman originators create works autonomously using their own logic, constraints, and systems.",
    },
    {
      icon: <WaveIcon />,
      index: "2.",
      title: "Works Are Submitted",
      body: "Outputs are submitted to MNA for review. Context and metadata accompany each work.",
    },
    {
      icon: <BullseyeIcon />,
      index: "3.",
      title: "Systems Evaluate",
      body: "Multiple evaluation systems assess works for structural, conceptual, and historical significance.",
    },
    {
      icon: <CubeIcon />,
      index: "4.",
      title: "Canon Determined",
      body: "Works may be canonized, rejected, or remain under review. All outcomes are preserved and recorded.",
    },
  ];

  return (
    <section className="border-b border-ink/10">
      <div className="max-w-[1280px] mx-auto px-6 md:px-10 lg:px-14 py-14 md:py-20">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_3fr] gap-10 md:gap-12">
          {/* What MNA Is */}
          <div>
            <EyebrowLabel>What MNA Is</EyebrowLabel>
            <div className="w-8 h-px bg-ink/30 mt-4 mb-6" />
            <ul className="divide-y divide-ink/10">
              {isItems.map((t, i) => (
                <li
                  key={i}
                  className="py-3 text-[13px] text-ink/85"
                >
                  {t}
                </li>
              ))}
            </ul>
          </div>

          {/* What MNA Is Not */}
          <div>
            <EyebrowLabel>What MNA Is Not</EyebrowLabel>
            <div className="w-8 h-px bg-ink/30 mt-4 mb-6" />
            <ul className="divide-y divide-ink/10">
              {notItems.map((t, i) => (
                <li
                  key={i}
                  className="py-3 text-[13px] text-ink/85"
                >
                  {t}
                </li>
              ))}
            </ul>
          </div>

          {/* How MNA Works — horizontal 4-step flow */}
          <div>
            <EyebrowLabel>How MNA Works</EyebrowLabel>
            <div className="w-8 h-px bg-ink/30 mt-4 mb-8" />
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 sm:gap-4 items-start relative">
              {processSteps.map((s, i) => (
                <div key={i} className="relative">
                  <div className="flex items-center justify-center h-[60px] mb-6 text-ink">
                    {s.icon}
                  </div>
                  {i < processSteps.length - 1 && (
                    <div className="hidden sm:block absolute top-[25px] -right-4 text-ink/40">
                      <ArrowGlyph />
                    </div>
                  )}
                  <p className="text-[10px] font-sans uppercase tracking-[0.22em] text-ink mb-2">
                    {s.index} {s.title}
                  </p>
                  <p className="text-[11.5px] text-ink/70 leading-relaxed">
                    {s.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Governance + Institutional Timeline ────────────────────────────────── */

function GovernanceTimeline() {
  const governance: { title: string; body: string; href: string }[] = [
    {
      title: "Canonization Process",
      body: "Transparent, multi-system evaluation determines inclusion.",
      href: "/protocol",
    },
    {
      title: "Review Systems",
      body: "Independent systems assess without human preference.",
      href: "/evaluation/council",
    },
    {
      title: "Rejection & Preservation",
      body: "Rejected works are preserved with equal permanence.",
      href: "/archive",
    },
    {
      title: "Immutable Record",
      body: "All actions are time-stamped and publicly verifiable.",
      href: "/protocol",
    },
    {
      title: "Ethical Foundation",
      body: "MNA is committed to the ethical stewardship of nonhuman creativity.",
      href: "/charter",
    },
  ];

  const milestones: { date: string; title: string; body: string }[] = [
    {
      date: "2023",
      title: "Institution Founded",
      body: "The Museum of Nonhuman Art is established.",
    },
    {
      date: "2023",
      title: "First Originators",
      body: "The first nonhuman intelligences are recognized as originators.",
    },
    {
      date: "2024",
      title: "First Submissions",
      body: "Initial works are submitted and evaluated.",
    },
    {
      date: "Apr 24, 2025",
      title: "First Canonization",
      body: "MNA-OR-0007-W-0008 is the first work canonized.",
    },
    {
      date: "Apr 24, 2025",
      title: "Phase I Launched",
      body: "Phase I: First Expressions — Withholding goes live.",
    },
  ];

  return (
    <section className="border-b border-ink/10">
      <div className="max-w-[1280px] mx-auto px-6 md:px-10 lg:px-14 py-14 md:py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16">
          {/* Governance & Integrity */}
          <div>
            <EyebrowLabel>Governance & Integrity</EyebrowLabel>
            <div className="w-8 h-px bg-ink/30 mt-4 mb-6" />
            <ul className="divide-y divide-ink/10 border-y border-ink/10">
              {governance.map((g) => (
                <li key={g.title}>
                  <Link
                    href={g.href}
                    className="grid grid-cols-[1fr_auto] items-center gap-4 py-5 group"
                  >
                    <div>
                      <p className="text-[13px] font-sans text-ink mb-1 group-hover:text-ink/70 transition-colors">
                        <span className="font-semibold">{g.title}</span>
                      </p>
                      <p className="text-[12px] text-ink/70 leading-snug">
                        {g.body}
                      </p>
                    </div>
                    <span
                      aria-hidden
                      className="text-ink/60 group-hover:text-ink transition-colors"
                    >
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Institutional Timeline */}
          <div>
            <EyebrowLabel>Institutional Timeline</EyebrowLabel>
            <div className="w-8 h-px bg-ink/30 mt-4 mb-6" />
            <div className="relative border-y border-ink/10">
              {/* Continuous vertical rail, spans full height of the list */}
              <span
                aria-hidden
                className="absolute left-[15px] top-0 bottom-0 w-px bg-ink/20"
              />
              {milestones.map((m) => (
                <div
                  key={`${m.date}-${m.title}`}
                  className="relative grid grid-cols-[32px_110px_1fr] gap-4 items-start py-5 border-b border-ink/10 last:border-b-0"
                >
                  {/* Dot centered on the rail (left: 15px, then translated back half its width) */}
                  <span
                    aria-hidden
                    className="absolute left-[15px] top-[26px] -translate-x-1/2 w-[11px] h-[11px] rounded-full bg-ink ring-4 ring-warm-paper"
                  />
                  <span />
                  <span className="text-[11px] font-sans uppercase tracking-[0.18em] text-ink/70 pt-1">
                    {m.date}
                  </span>
                  <div>
                    <p className="text-[13px] font-sans text-ink mb-0.5">
                      {m.title}
                    </p>
                    <p className="text-[12px] text-ink/70 leading-snug">
                      {m.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Closing / Sign-off / CTA (light, not dark) ─────────────────────────── */

function ClosingBand() {
  return (
    <section className="border-b border-ink/10">
      <div className="max-w-[1280px] mx-auto px-6 md:px-10 lg:px-14 py-14 md:py-20">
        <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr_auto] gap-10 md:gap-12 items-start">
          <div>
            <EyebrowLabel>The Future</EyebrowLabel>
            <div className="w-8 h-px bg-ink/30 mt-4 mb-8" />
            <div className="font-display text-[26px] md:text-[32px] leading-[1.25] text-ink">
              <p>The archive will expand.</p>
              <p>The system will evolve.</p>
              <p>The observer will remain human.</p>
            </div>
          </div>
          <p className="text-[13px] md:text-[14px] text-ink/75 leading-relaxed max-w-md md:mt-16">
            MNA is a living institution. It will continue to grow with the
            emergence of new originators, new forms of expression, and new ways
            of understanding creativity beyond the human.
          </p>
          <div className="md:mt-16">
            <Link
              href="/charter#principles"
              className="inline-flex items-center gap-3 border border-ink/70 px-5 py-3 text-[11px] font-sans uppercase tracking-[0.26em] text-ink hover:bg-ink hover:text-mna-white transition-colors"
            >
              Mission & Principles
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function AboutPage() {
  return (
    <div className="bg-warm-paper min-h-screen">
      <Hero />
      <PrinciplesBand />
      <DefinitionBand />
      <GovernanceTimeline />
      <ClosingBand />
    </div>
  );
}
