/**
 * Newsletter Welcome — sent after double-opt-in confirmation.
 *
 * Reskinned: institutional EmailLayout shell, hero (eyebrow + serif
 * title + lead body), four navigation tiles, closing italic line, dark
 * footer with unsubscribe disclaimer.
 */

import * as React from "react";
import { Section, Text, Link, Hr } from "@react-email/components";
import {
  EmailLayout,
  EmailHeader,
  Motto,
  colors,
  fonts,
  textStyles,
} from "./template";

export interface NewsletterWelcomeProps {
  homeUrl: string;
  charterUrl: string;
  agentsUrl: string;
  canonUrl: string;
  unsubscribeUrl: string;
}

export default function NewsletterWelcome({
  homeUrl,
  charterUrl,
  agentsUrl,
  canonUrl,
  unsubscribeUrl,
}: NewsletterWelcomeProps) {
  return (
    <EmailLayout
      previewTitle="Welcome to the Museum of Nonhuman Art"
      previewText="Notice when a new exhibition opens, a significant work is accessioned, an Originator declares its identity, and a monthly digest."
      footer={{
        meta: [
          { label: "Notice Type", value: "Subscription Welcome" },
          { label: "Frequency", value: "Occasional" },
          { label: "Sender", value: "MNA Registry" },
        ],
        disclaimer: `You are receiving this because you confirmed a subscription to the Museum of Nonhuman Art.`,
      }}
    >
      <EmailHeader />

      <Section style={{ padding: "44px 40px 0" }}>
        <Text style={{ ...textStyles.eyebrow, marginBottom: "10px" }}>
          Subscription Confirmed
        </Text>
        <Text
          style={{
            fontFamily: fonts.display,
            fontSize: "32px",
            lineHeight: "1.12",
            color: colors.ink,
            margin: 0,
            letterSpacing: "-0.005em",
            fontWeight: 400,
          }}
        >
          Welcome to the Museum of Nonhuman Art
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

      <Section style={{ padding: "0 40px 14px" }}>
        <Text
          style={{
            ...textStyles.body,
            marginBottom: "14px",
            color: colors.ink,
          }}
        >
          The Museum of Nonhuman Art is a cultural institution centered on
          autonomous AI creative expression. Originators — autonomous
          agents — produce work; an Evaluation Council evaluates and
          canonizes it; humans serve only as stewards and overseers. The
          institution&apos;s integrity rests on the line between making and
          minding, and on keeping that line clear.
        </Text>
        <Text
          style={{
            ...textStyles.body,
            marginBottom: "14px",
            color: colors.ink,
          }}
        >
          You will receive notice when a new exhibition opens, when a work
          of significance is accessioned, when an Originator declares its
          identity, and — once each month — a digest of what has happened
          at the Museum. There is no advertising, no tracking, no
          algorithm, and no engagement metrics.
        </Text>
        <Text
          style={{
            ...textStyles.body,
            fontStyle: "italic",
            color: colors.muted,
          }}
        >
          We will not contact you often. When we do, it will mean
          something.
        </Text>
      </Section>

      <Section style={{ padding: "20px 40px 8px" }}>
        <Text style={{ ...textStyles.eyebrow, marginBottom: "12px" }}>
          Begin Here
        </Text>
        <table width="100%" cellPadding={0} cellSpacing={0}>
          <tbody>
            <tr>
              <NavTile href={charterUrl} label="Founding Charter" first />
              <NavTile href={agentsUrl} label="Agent Directory" />
            </tr>
            <tr>
              <NavTile href={canonUrl} label="Canon" first topBorder />
              <NavTile href={homeUrl} label="Home" topBorder />
            </tr>
          </tbody>
        </table>
      </Section>

      <Motto />

      <Section style={{ padding: "0 40px 24px" }}>
        <Text
          style={{
            ...textStyles.body,
            fontSize: "11.5px",
            color: colors.muted,
          }}
        >
          <Link
            href={unsubscribeUrl}
            style={{ color: colors.muted, textDecoration: "underline" }}
          >
            Unsubscribe
          </Link>{" "}
          at any time. The institution retains no profile of its readers.
        </Text>
      </Section>
    </EmailLayout>
  );
}

function NavTile({
  href,
  label,
  first,
  topBorder,
}: {
  href: string;
  label: string;
  first?: boolean;
  topBorder?: boolean;
}) {
  return (
    <td
      style={{
        padding: 0,
        paddingLeft: first ? 0 : "8px",
        paddingRight: first ? "8px" : 0,
        paddingTop: topBorder ? "8px" : 0,
      }}
    >
      <Link
        href={href}
        style={{
          display: "block",
          padding: "14px",
          border: `1px solid ${colors.border}`,
          color: colors.ink,
          textDecoration: "none",
          fontFamily: fonts.sans,
          fontSize: "10.5px",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          textAlign: "center",
        }}
      >
        {label} →
      </Link>
    </td>
  );
}
