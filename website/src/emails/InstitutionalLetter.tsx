/**
 * Institutional Letter — general-purpose correspondence template.
 *
 * Used for metadata corrections, policy announcements, institutional
 * invitations, constitutional amendments affecting an Originator, and
 * any other formal communication that doesn't fit a more specific
 * notice. Reskinned to use the EmailLayout shell.
 */

import * as React from "react";
import { Section, Text, Hr } from "@react-email/components";
import {
  EmailLayout,
  EmailHeader,
  Motto,
  colors,
  fonts,
  textStyles,
} from "./template";

export interface InstitutionalLetterProps {
  recipientName: string;
  recipientEntity?: string;
  subject: string;
  /**
   * Prose paragraphs of the letter body. Rendered in serif, one
   * paragraph per element. Plain text only.
   */
  paragraphs: string[];
  signedBy: string;
  signedRole: string;
  /** Optional post-script shown after the signature in smaller type. */
  postscript?: string;
}

export default function InstitutionalLetter({
  recipientName,
  recipientEntity,
  subject,
  paragraphs,
  signedBy,
  signedRole,
  postscript,
}: InstitutionalLetterProps) {
  const issueDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <EmailLayout
      previewTitle={`Institutional Letter — ${subject}`}
      previewText={subject}
      footer={{
        meta: [
          { label: "Notice Type", value: "Institutional Letter" },
          { label: "Date", value: issueDate },
          { label: "Issued By", value: signedBy },
        ],
      }}
    >
      <EmailHeader />

      <Section style={{ padding: "44px 40px 0" }}>
        <Text style={{ ...textStyles.eyebrow, marginBottom: "12px" }}>
          Institutional Letter
        </Text>
        <Text
          style={{
            fontFamily: fonts.display,
            fontSize: "28px",
            lineHeight: "1.18",
            color: colors.ink,
            margin: 0,
            letterSpacing: "-0.005em",
            fontWeight: 400,
          }}
        >
          {subject}
        </Text>
        <Hr
          style={{
            borderColor: colors.muted,
            borderWidth: "0",
            borderTopWidth: "1px",
            width: "48px",
            marginTop: "20px",
            marginBottom: "0",
          }}
        />
      </Section>

      <Section style={{ padding: "20px 40px 16px" }}>
        <Text
          style={{
            ...textStyles.body,
            color: colors.muted,
            fontSize: "12px",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            marginBottom: "16px",
          }}
        >
          {issueDate}
        </Text>
        <Text style={{ ...textStyles.body, color: colors.ink }}>
          {recipientName}
          {recipientEntity ? (
            <>
              <br />
              <span style={{ color: colors.muted }}>{recipientEntity}</span>
            </>
          ) : null}
        </Text>
      </Section>

      <Section style={{ padding: "0 40px 16px" }}>
        {paragraphs.map((p, i) => (
          <Text
            key={i}
            style={{
              ...textStyles.body,
              marginBottom: i < paragraphs.length - 1 ? "14px" : 0,
              color: colors.ink,
            }}
          >
            {p}
          </Text>
        ))}
      </Section>

      <Section style={{ padding: "20px 40px 0" }}>
        <Text style={{ ...textStyles.body, color: colors.ink, marginBottom: "4px" }}>
          —
        </Text>
        <Text
          style={{
            fontFamily: fonts.display,
            fontSize: "16px",
            color: colors.ink,
            margin: "12px 0 4px",
          }}
        >
          {signedBy}
        </Text>
        <Text
          style={{
            ...textStyles.body,
            fontSize: "11px",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: colors.muted,
            margin: 0,
          }}
        >
          {signedRole}
        </Text>
      </Section>

      {postscript ? (
        <Section style={{ padding: "20px 40px 0" }}>
          <Hr
            style={{
              borderColor: colors.border,
              marginTop: 0,
              marginBottom: "14px",
            }}
          />
          <Text
            style={{
              ...textStyles.body,
              fontSize: "12.5px",
              color: colors.muted,
            }}
          >
            <strong style={{ color: colors.ink }}>P.S.</strong> {postscript}
          </Text>
        </Section>
      ) : null}

      <Motto />
    </EmailLayout>
  );
}
