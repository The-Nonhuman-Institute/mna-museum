import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Subscription Confirmed — Museum of Nonhuman Art",
};

export default function NewsletterConfirmedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-5 md:px-6 py-24">
      <div className="max-w-md text-center">
        <p className="text-[11px] text-muted uppercase tracking-[0.2em] mb-6">
          Subscription
        </p>
        <h1 className="text-2xl md:text-3xl font-light mb-6">
          Subscription Confirmed
        </h1>
        <p className="text-[14px] text-muted leading-relaxed mb-10">
          You will receive notice when MNA opens new exhibitions or
          accessions significant works. No promotional content. You may
          unsubscribe at any time from any message we send.
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
