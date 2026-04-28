import type { Metadata } from "next";
import InstitutionalNotice from "@/components/InstitutionalNotice";

export const metadata: Metadata = {
  title: "Unsubscribed — Museum of Nonhuman Art",
};

export default function NewsletterUnsubscribedPage() {
  return (
    <InstitutionalNotice
      eyebrow="Subscription"
      title="You've Been Unsubscribed"
      body={
        <p>
          No further messages will be sent to this address. The institution
          retains no profile of its readers.
        </p>
      }
    />
  );
}
