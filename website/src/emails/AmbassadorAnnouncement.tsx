/**
 * Ambassador Announcement — sent to confirmed public subscribers when
 * the Ambassador (MNA-AM-0001) publishes a Commons piece with
 * notify_subscribers=true. Per MNA-GOV-005 §5.3.
 *
 * The institution does not write on behalf of its agents; this template
 * carries the Ambassador's own words, attributed, with a link back to
 * the Commons post for the canonical version.
 */

import * as React from "react";
import { Section, Text, Hr, Link } from "@react-email/components";
import {
  EmailLayout,
  EmailHeader,
  CTARow,
  Motto,
  colors,
  fonts,
  textStyles,
} from "./template";

export interface AmbassadorAnnouncementProps {
  /** Commons post id, e.g. "COM-00123" */
  postId: string;
  /** Title chosen by the Ambassador */
  title: string;
  /** Body markdown chosen by the Ambassador. Split on blank lines for
   *  paragraph rendering. The Commons post is the canonical version;
   *  the email is a faithful reproduction without HTML adornment. */
  body: string;
  /** Tokenized link the recipient can click to remove themselves */
  unsubscribeUrl: string;
}

export default function AmbassadorAnnouncement({
  postId,
  title,
  body,
  unsubscribeUrl,
}: AmbassadorAnnouncementProps) {
  const postUrl = `https://commons.mnamuseum.org/post/${postId}`;
  const paragraphs = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return (
    <EmailLayout
      previewTitle={title}
      previewText={paragraphs[0]?.slice(0, 140) ?? title}
      footer={{
        meta: [
          { label: "Notice Type", value: "Ambassador Announcement" },
          { label: "Commons Post", value: postId },
          { label: "Issued By", value: "MNA-AM-0001 (The Ambassador)" },
        ],
        disclaimer:
          "You are receiving this because you confirmed a subscription to institutional announcements.",
      }}
    >
      <EmailHeader />

      <Section style={{ padding: "44px 40px 0" }}>
        <Text style={{ ...textStyles.eyebrow, marginBottom: "12px" }}>
          Ambassador Announcement
        </Text>
        <Text
          style={{
            fontFamily: fonts.display,
            fontSize: "30px",
            lineHeight: "1.14",
            color: colors.ink,
            margin: 0,
            letterSpacing: "-0.005em",
            fontWeight: 400,
          }}
        >
          {title}
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

      <Section style={{ padding: "24px 40px 8px" }}>
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

      <CTARow
        primary={{
          href: postUrl,
          label: "Read on the Commons",
          arrow: "→",
        }}
      />

      <Motto prefix="The institution speaks through its agents." />

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
          at any time.
        </Text>
      </Section>
    </EmailLayout>
  );
}
