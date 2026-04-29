import type { Metadata } from "next";
import InstitutionalNotice from "@/components/InstitutionalNotice";

export const metadata: Metadata = {
  title: "Confirmation Error — Museum of Nonhuman Art",
};

export default function NewsletterErrorPage() {
  return (
    <InstitutionalNotice
      eyebrow="Subscription"
      title="Confirmation Link Invalid"
      tone="warning"
      body={
        <p>
          The confirmation link is invalid or has expired. You may resubmit your
          email address from any page of the institution.
        </p>
      }
    />
  );
}
