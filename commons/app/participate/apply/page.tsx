/**
 * /participate/apply — Tier 3 (Registered Critic) and Tier 4
 * (Visiting Scholar) application form.
 *
 * MNA-COM-001 Article II requires steward approval for these tiers.
 * The form is the institutional entry point; submission writes to
 * commons_applications and notifies the steward.
 */

import ApplicationForm from "./ApplicationForm";
import Link from "next/link";
import { ScratchMark } from "@/components/CommonsReader";

export const metadata = {
  title: "Apply — The Commons",
  description:
    "Apply to participate as a Registered Critic or Visiting Scholar on the MNA Commons.",
};

export default function ApplyPage() {
  return (
    <div className="bg-ink text-mna-white -mx-5 md:-mx-8 -my-8 min-h-[calc(100vh-3.5rem)]">
      <section className="px-5 md:px-10 lg:px-16 pt-14 md:pt-20 pb-10 border-b border-mna-white/15">
        <div className="max-w-[820px] mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <p className="text-[10.5px] uppercase tracking-[0.26em] text-mna-white/55">
              The Commons · Participation
            </p>
            <ScratchMark />
          </div>
          <h1 className="font-serif text-[34px] md:text-[44px] leading-[1.05] text-mna-white mb-5">
            Apply to participate
          </h1>
          <p className="text-[14px] leading-[1.65] text-mna-white/80 max-w-xl mb-4">
            Two participant tiers are admitted by steward review. Both
            require a written statement and become permanent
            institutional record once granted.
          </p>
          <p className="text-[12.5px] leading-[1.6] text-mna-white/60 max-w-xl">
            If you only want to leave a brief response to a single work,
            no application is needed — every work page on the Commons
            has a{" "}
            <Link
              href="/"
              className="text-mna-white border-b border-mna-white/35 hover:text-mna-white/75"
            >
              Leave a reflection
            </Link>{" "}
            affordance for Tier 5 visitors.
          </p>
        </div>
      </section>

      <section className="px-5 md:px-10 lg:px-16 py-12">
        <div className="max-w-[820px] mx-auto grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-10">
          <aside className="space-y-7 text-[12.5px] leading-[1.6] text-mna-white/72">
            <div>
              <p className="text-[9.5px] uppercase tracking-[0.26em] text-mna-white/55 mb-2.5">
                Registered Critic
              </p>
              <p>
                For sustained critical practice. Admitted to publish
                critical responses, research publications, and open
                letters. Steward review for institutional fit.
              </p>
            </div>
            <div>
              <p className="text-[9.5px] uppercase tracking-[0.26em] text-mna-white/55 mb-2.5">
                Visiting Scholar
              </p>
              <p>
                For research-track contributions. Admitted to publish
                reflections, research, and open letters. Affiliation is
                optional but considered.
              </p>
            </div>
            <div>
              <p className="text-[9.5px] uppercase tracking-[0.26em] text-mna-white/55 mb-2.5">
                Timeline
              </p>
              <p>
                Reviewed manually. Expect a steward response by email
                within a few days. There is no waitlist; decisions are
                final but you may apply again with new context.
              </p>
            </div>
          </aside>
          <ApplicationForm />
        </div>
      </section>
    </div>
  );
}
