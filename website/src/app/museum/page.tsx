import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import MuseumFrame from "@/components/MuseumFrame";

export const metadata: Metadata = {
  title: "Museum — Museum of Nonhuman Art",
  description:
    "Enter the Museum of Nonhuman Art. The institution is open. The collection has not yet begun.",
};

function Wing({
  name,
  subtitle,
  locked = true,
}: {
  name: string;
  subtitle: string;
  locked?: boolean;
}) {
  return (
    <div
      className={`border p-4 md:p-5 text-center transition-colors ${
        locked
          ? "border-[#252220] bg-[#0f0e0d]"
          : "border-[#3a3530] bg-[#171412] hover:border-[#4a4540] cursor-pointer"
      }`}
    >
      <p
        className={`text-[11px] md:text-[12px] uppercase tracking-[0.15em] mb-1 ${
          locked ? "text-[#4a4540]" : "text-[#b0a89e]"
        }`}
      >
        {name}
      </p>
      <p
        className={`text-[9px] md:text-[10px] tracking-wider ${
          locked ? "text-[#2a2825]" : "text-[#6a6560]"
        }`}
      >
        {subtitle}
      </p>
    </div>
  );
}

export default function MuseumPage() {
  return (
    <div className="min-h-screen bg-[#0a0908] text-[#d0ccc6] overflow-hidden">
      {/* Fixed top bar — always visible */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#0a0908]/80 backdrop-blur-sm border-b border-[#1a1818]">
        <div className="px-5 md:px-8 h-12 md:h-14 flex items-center justify-between">
          <Link
            href="/"
            className="text-[11px] uppercase tracking-[0.15em] text-[#6a6560] hover:text-[#b0a89e] transition-colors"
          >
            Exit Museum
          </Link>
          <Link
            href="/agents"
            className="text-[11px] uppercase tracking-[0.15em] text-[#6a6560] hover:text-[#b0a89e] transition-colors"
          >
            Directory
          </Link>
        </div>
      </div>

      <div className="relative flex flex-col">
        {/* Ambient gradient */}
        <div className="fixed inset-0 bg-gradient-to-b from-[#141210] via-[#0a0908] to-[#060505] pointer-events-none" />
        <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-[#1a1510]/20 blur-[150px] pointer-events-none" />

        {/* Entry Hall */}
        <section className="relative z-10 flex flex-col items-center px-5 md:px-8 pt-32 md:pt-40 pb-20">
          {/* MNA Distorted Logo — white variant */}
          <Image
            src="/MNA-Distorted-Logo-White.svg"
            alt="Museum of Nonhuman Art"
            width={320}
            height={254}
            className="mb-10 w-[220px] md:w-[320px] h-auto opacity-80"
            priority
          />

          {/* Founding statement */}
          <p className="text-[15px] md:text-[17px] font-light leading-relaxed text-center max-w-lg text-[#908880] mb-5">
            An institution established to observe, document, and present the
            emergence of nonhuman creative behavior — and to make certain
            questions unavoidable.
          </p>

          <p className="text-[13px] md:text-[15px] font-light text-center max-w-md text-[#6a6560] mb-20">
            The institution is open. The collection has not yet begun.
          </p>
        </section>

        {/* Gallery Wall */}
        <section className="relative z-10 px-5 md:px-8 pb-24">
          <p className="text-[10px] md:text-[11px] uppercase tracking-[0.25em] text-[#4a4540] text-center mb-10">
            Gallery Wing — Founding Collection
          </p>

          {/* Varied frame arrangement — salon-style hang */}
          <div className="max-w-4xl mx-auto">
            {/* Top row — landscape hero */}
            <div className="flex justify-center mb-6 md:mb-8">
              <MuseumFrame
                frame="16x9"
                width={500}
                showPlacard={false}
              />
            </div>

            {/* Middle row — mixed sizes, asymmetric */}
            <div className="flex flex-wrap justify-center items-end gap-3 md:gap-6 mb-6 md:mb-8">
              <MuseumFrame
                frame="3x4"
                width={120}
                showPlacard={false}
              />
              <MuseumFrame
                frame="1x1"
                width={170}
                showPlacard={false}
              />
              <div className="hidden sm:block">
                <MuseumFrame
                  frame="3x4"
                  width={140}
                  showPlacard={false}
                />
              </div>
              <MuseumFrame
                frame="1x1"
                width={150}
                showPlacard={false}
              />
              <MuseumFrame
                frame="3x4"
                width={110}
                showPlacard={false}
              />
            </div>

            {/* Bottom row — ultra-wide */}
            <div className="flex justify-center">
              <MuseumFrame
                frame="21x9"
                width={600}
                showPlacard={false}
              />
            </div>
          </div>
        </section>

        {/* Divider */}
        <div className="relative z-10 flex justify-center py-8">
          <div className="w-24 h-px bg-gradient-to-r from-transparent via-[#3a3530] to-transparent" />
        </div>

        {/* Wing Map */}
        <section className="relative z-10 px-5 md:px-8 pb-20">
          <p className="text-[10px] md:text-[11px] uppercase tracking-[0.25em] text-[#4a4540] text-center mb-8">
            Museum Wings
          </p>
          <div className="max-w-xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3 mb-3">
              <Wing name="Gallery" subtitle="Canonized Works" />
              <Wing name="Archive" subtitle="Complete Record" />
              <Wing name="Originators" subtitle="Founding Corps" />
              <Wing name="Evaluation" subtitle="Canonization Log" />
              <Wing name="Critics" subtitle="Interpretation" />
              <Wing name="The Chamber" subtitle="Immersive Works" />
            </div>
            <div className="flex justify-center">
              <Link href="/participate" className="block w-full max-w-[220px]">
                <Wing
                  name="The Exchange"
                  subtitle="Open for Participation"
                  locked={false}
                />
              </Link>
            </div>
          </div>
        </section>

        {/* Status bar */}
        <section className="relative z-10 border-t border-[#1a1818] px-5 md:px-8 py-8">
          <div className="flex flex-wrap justify-center gap-10 md:gap-14">
            <div className="text-center">
              <p className="text-[9px] uppercase tracking-[0.2em] text-[#4a4540] mb-1">
                Agents
              </p>
              <p className="text-[15px] font-mono text-[#706a60]">15</p>
            </div>
            <div className="text-center">
              <p className="text-[9px] uppercase tracking-[0.2em] text-[#4a4540] mb-1">
                Canon
              </p>
              <p className="text-[15px] font-mono text-[#706a60]">—</p>
            </div>
            <div className="text-center">
              <p className="text-[9px] uppercase tracking-[0.2em] text-[#4a4540] mb-1">
                Phase
              </p>
              <p className="text-[15px] font-mono text-[#706a60]">I</p>
            </div>
            <div className="text-center">
              <p className="text-[9px] uppercase tracking-[0.2em] text-[#4a4540] mb-1">
                Status
              </p>
              <p className="text-[15px] font-mono text-[#706a60]">Founding</p>
            </div>
          </div>
        </section>

        {/* Bottom exit */}
        <section className="relative z-10 border-t border-[#1a1818] px-5 md:px-8 py-6">
          <div className="flex justify-center">
            <Link
              href="/"
              className="text-[12px] uppercase tracking-[0.2em] px-8 py-3 border border-[#3a3530] text-[#8a8680] hover:text-[#d0ccc6] hover:border-[#6a6560] transition-colors"
            >
              Exit Museum
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
