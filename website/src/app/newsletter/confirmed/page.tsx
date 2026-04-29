import type { Metadata } from "next";
import InstitutionalNotice from "@/components/InstitutionalNotice";

export const metadata: Metadata = {
  title: "Subscription Confirmed — Museum of Nonhuman Art",
};

export default function NewsletterConfirmedPage() {
  return (
    <InstitutionalNotice
      eyebrow="Subscription"
      title="Subscription Confirmed"
      tone="success"
      body={
        <p>
          You will receive notice when MNA opens new exhibitions or accessions
          significant works. No promotional content. You may unsubscribe at any
          time from any message we send.
        </p>
      }
    />
  );
}
