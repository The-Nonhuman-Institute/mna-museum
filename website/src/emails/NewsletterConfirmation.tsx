/**
 * Newsletter Confirmation — double opt-in email.
 *
 * Reskinned to use the institutional EmailLayout shell. Single column
 * with eyebrow / serif title / body paragraph / Confirm CTA / fallback
 * link / closing motto + dark footer.
 */

import * as React from "react";
import { Section, Text, Link, Hr } from "@react-email/components";
import {
  EmailLayout,
  EmailHeader,
  CTARow,
  Motto,
  colors,
  fonts,
  textStyles,
} from "./template";

export interface NewsletterConfirmationProps {
  confirmationUrl: string;
}

export default function NewsletterConfirmation({
  confirmationUrl,
}: NewsletterConfirmationProps) {
  return (
    <EmailLayout
      previewTitle="Confirm your subscription — Museum of Nonhuman Art"
      previewText="Please confirm this subscription to receive notice from the Museum of Nonhuman Art."
      footer={{
        meta: [
          { label: "Notice Type", value: "Subscription Confirmation" },
          { label: "Action Required", value: "Confirm" },
          { label: "Sender", value: "MNA Registry" },
        ],
        disclaimer:
          "If you did not request this subscription, no action is required. Without confirmation, no further mail will be sent to this address.",
      }}
    >
      <EmailHeader />

      <Section style={{ padding: "44px 40px 0" }}>
        <Text style={{ ...textStyles.eyebrow, marginBottom: "10px" }}>
          Double Opt-In
        </Text>
        <Text
          style={{
            fontFamily: fonts.display,
            fontSize: "30px",
            lineHeight: "1.15",
            color: colors.ink,
            margin: 0,
            letterSpacing: "-0.005em",
            fontWeight: 400,
          }}
        >
          Subscription Confirmation
        </Text>
        <Hr
          style={{
            borderColor: colors.muted,
            borderWidth: "0",
            borderTopWidth: "1px",
            width: "48px",
            marginTop: "20px",
            marginBottom: "20px",
          }}
        />
      </Section>

      <Section style={{ padding: "0 40px 8px" }}>
        <Text style={{ ...textStyles.body, color: colors.ink }}>
          Please confirm this subscription to receive occasional notice when
          the Museum of Nonhuman Art opens new exhibitions or accessions
          significant works. No promotional content, no tracking, no
          third-party sharing. You may unsubscribe at any time from any
          message we send.
        </Text>
      </Section>

      <CTARow
        primary={{ label: "Confirm Subscription", href: confirmationUrl }}
      />

      <Section style={{ padding: "0 40px 16px" }}>
        <Text
          style={{
            ...textStyles.body,
            fontSize: "12.5px",
            color: colors.muted,
          }}
        >
          If the button does not work, copy and paste this link into your
          browser:
          <br />
          <Link
            href={confirmationUrl}
            style={{ color: colors.muted, wordBreak: "break-all" }}
          >
            {confirmationUrl}
          </Link>
        </Text>
      </Section>

      <Motto />
    </EmailLayout>
  );
}
