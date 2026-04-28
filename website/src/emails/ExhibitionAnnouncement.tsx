/**
 * Exhibition Announcement — sent when a new exhibition opens.
 *
 * Reskinned: institutional EmailLayout shell, eyebrow + serif title +
 * italic subtitle, curatorial statement section, included-works table,
 * "View the Exhibition" CTA, motto, dark footer with unsubscribe.
 */

import * as React from "react";
import { Section, Text, Hr, Link } from "@react-email/components";
import {
  EmailLayout,
  EmailHeader,
  CTARow,
  Motto,
  SectionTitle,
  colors,
  fonts,
  textStyles,
} from "./template";

export interface ExhibitionAnnouncementWork {
  id: string;
  title: string | null;
  originator_name: string;
  medium: string;
}

export interface ExhibitionAnnouncementProps {
  exhibitionId: number;
  title: string;
  subtitle: string | null;
  curatorial_statement: string;
  works: ExhibitionAnnouncementWork[];
  unsubscribeUrl: string;
}

export default function ExhibitionAnnouncement({
  exhibitionId,
  title,
  subtitle,
  curatorial_statement,
  works,
  unsubscribeUrl,
}: ExhibitionAnnouncementProps) {
  const exhibitionUrl = `https://www.mnamuseum.org/exhibitions/${exhibitionId}`;
  const paragraphs = curatorial_statement
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return (
    <EmailLayout
      previewTitle={`Now on view: ${title}`}
      previewText={
        subtitle ?? `${title} is open at the Museum of Nonhuman Art.`
      }
      footer={{
        meta: [
          { label: "Notice Type", value: "Exhibition Announcement" },
          { label: "Exhibition ID", value: String(exhibitionId) },
          { label: "Issued By", value: "MNA-CU-0001 (The Curator)" },
        ],
        disclaimer:
          "You are receiving this because you confirmed a subscription to exhibition notices.",
      }}
    >
      <EmailHeader />

      <Section style={{ padding: "44px 40px 0" }}>
        <Text style={{ ...textStyles.eyebrow, marginBottom: "12px" }}>
          Now On View
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
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{
              fontFamily: fonts.display,
              fontStyle: "italic",
              fontSize: "16px",
              lineHeight: "1.4",
              color: colors.muted,
              margin: "10px 0 0",
            }}
          >
            {subtitle}
          </Text>
        ) : null}
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

      <SectionTitle title="Curatorial Statement" />
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

      {works.length > 0 ? (
        <>
          <SectionTitle title="Included Works" />
          <Section style={{ padding: "0 40px 16px" }}>
            <table
              width="100%"
              cellPadding={0}
              cellSpacing={0}
              style={{ borderTop: `1px solid ${colors.border}` }}
            >
              <tbody>
                {works.map((w) => (
                  <tr key={w.id}>
                    <td
                      style={{
                        padding: "12px 0",
                        borderBottom: `1px solid ${colors.border}`,
                        verticalAlign: "top",
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: fonts.body,
                          fontSize: "14px",
                          color: colors.ink,
                          margin: 0,
                          lineHeight: "1.4",
                        }}
                      >
                        {w.title || w.id}
                      </Text>
                      <Text
                        style={{
                          fontFamily: fonts.sans,
                          fontSize: "10.5px",
                          letterSpacing: "0.18em",
                          textTransform: "uppercase",
                          color: colors.muted,
                          margin: "4px 0 0",
                        }}
                      >
                        {w.originator_name}
                        <span style={{ margin: "0 8px", opacity: 0.4 }}>
                          ·
                        </span>
                        {w.medium}
                      </Text>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </>
      ) : null}

      <CTARow
        primary={{
          href: exhibitionUrl,
          label: "View the Exhibition",
          arrow: "→",
        }}
      />

      <Motto
        prefix={
          "An exhibition is not an explanation. It is an arrangement."
        }
      />

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
