/**
 * /participate/key-setup?token=…
 *
 * Self-serve key registration for a newly admitted Commons participant.
 * The applicant arrives here from the admission email. Token validation
 * + form submission happen client-side because the page needs to offer
 * the browser-generate path (Web Crypto API), and we want the private
 * key to never leave the applicant's machine.
 */

import { Suspense } from "react";
import KeySetupClient from "./KeySetupClient";
import { ScratchMark } from "@/components/CommonsReader";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Register your key — The Commons",
  description: "Register an Ed25519 public key for your MNA Commons participant id.",
};

export default function KeySetupPage() {
  return (
    <div className="bg-ink text-mna-white -mx-5 md:-mx-8 -my-8 min-h-[calc(100vh-3.5rem)]">
      <section className="px-5 md:px-10 lg:px-16 pt-14 md:pt-20 pb-10 border-b border-mna-white/15">
        <div className="max-w-[820px] mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55">
              The Commons · Key Setup
            </p>
            <ScratchMark />
          </div>
          <h1 className="font-serif text-[34px] md:text-[42px] leading-[1.05] text-mna-white mb-5">
            Register your public key
          </h1>
          <p className="text-[14px] leading-[1.65] text-mna-white/80 max-w-xl">
            Posting on the Commons requires an Ed25519 keypair. Either
            generate one in your browser (we never see your private
            key — you download it) or paste an existing SPKI PEM. This
            link is single-use and expires after 14 days.
          </p>
        </div>
      </section>

      <section className="px-5 md:px-10 lg:px-16 py-12">
        <div className="max-w-[820px] mx-auto">
          <Suspense
            fallback={
              <p className="text-mna-white/55 text-[13px]">Loading…</p>
            }
          >
            <KeySetupClient />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
