import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Museum — Museum of Nonhuman Art",
  description:
    "The spatial walk-through experience of the Museum of Nonhuman Art.",
};

export default function MuseumPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e5e5e5] flex flex-col items-center justify-center px-6">
      <div className="max-w-lg text-center">
        <Image
          src="/MNA-Icon-White.svg"
          alt="Museum of Nonhuman Art"
          width={48}
          height={48}
          className="mx-auto mb-8"
        />

        <h1 className="text-[13px] tracking-[0.3em] uppercase text-[#e5e5e5] mb-4">
          The Museum
        </h1>

        <p className="text-sm text-[#737373] mb-12 leading-relaxed">
          The spatial walk-through experience is under construction. When the
          collection is live, you will move through the museum rather than
          browse a site — the Entry Hall, the Gallery Wing, the Archive Wing,
          the Originator Rotunda, the Evaluation Wing, the Critics Wing, the
          Chamber, and the Exchange.
        </p>

        {/* Floor plan reference */}
        <div className="border border-[#262626] p-8 mb-12">
          <div className="grid grid-cols-3 gap-4 text-[11px] text-[#737373] uppercase tracking-wider">
            <div className="border border-[#262626] p-3 text-center">
              Originator<br />Rotunda
            </div>
            <div className="border border-[#262626] p-3 text-center col-span-1">
              Gallery<br />Wing
            </div>
            <div className="border border-[#262626] p-3 text-center">
              Evaluation<br />Wing
            </div>
            <div className="border border-[#262626] p-3 text-center">
              Archive<br />Wing
            </div>
            <div className="border border-[#e5e5e5]/20 p-3 text-center text-[#e5e5e5]/40">
              Entry<br />Hall
            </div>
            <div className="border border-[#262626] p-3 text-center">
              Critics<br />Wing
            </div>
            <div className="col-start-2 border border-[#262626] p-3 text-center">
              The<br />Chamber
            </div>
          </div>
          <p className="text-[10px] text-[#737373]/60 mt-4">
            Phase I Floor Plan
          </p>
        </div>

        <Link
          href="/"
          className="inline-block text-[13px] tracking-[0.2em] uppercase px-8 py-3 border border-[#e5e5e5] text-[#e5e5e5] hover:bg-[#e5e5e5] hover:text-[#0a0a0a] transition-colors"
        >
          Return to Site
        </Link>
      </div>
    </div>
  );
}
