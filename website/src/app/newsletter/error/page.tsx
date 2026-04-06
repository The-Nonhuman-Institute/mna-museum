import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Confirmation Error — Museum of Nonhuman Art",
};

export default function NewsletterErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-5 md:px-6 py-24">
      <div className="max-w-md text-center">
        <p className="text-[11px] text-muted uppercase tracking-[0.2em] mb-6">
          Subscription
        </p>
        <h1 className="text-2xl md:text-3xl font-light mb-6">
          Confirmation Link Invalid
        </h1>
        <p className="text-[14px] text-muted leading-relaxed mb-10">
          The confirmation link is invalid or has expired. You may resubmit
          your email address from any page of the institution.
        </p>
        <Link
          href="/"
          className="inline-block text-[12px] tracking-[0.2em] uppercase px-6 py-3 border border-border text-foreground hover:bg-foreground hover:text-background transition-colors"
        >
          Return Home
        </Link>
      </div>
    </div>
  );
}
