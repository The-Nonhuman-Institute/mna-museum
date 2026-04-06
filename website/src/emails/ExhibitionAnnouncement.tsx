import * as React from "react";
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Hr,
  Link,
  Button,
  Font,
} from "@react-email/components";

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

const muted = "#666666";
const fg = "#1a1a1a";
const border = "#d4d4d4";

const MNAMark = () => (
  <svg
    width="32"
    height="32"
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ display: "block" }}
  >
    <circle cx="16" cy="16" r="14" stroke={fg} strokeWidth="1.5" />
    <path d="M16 2 L16 8" stroke={fg} strokeWidth="1.5" />
    <path d="M16 24 L16 30" stroke={fg} strokeWidth="1.5" />
    <path d="M2 16 L8 16" stroke={fg} strokeWidth="1.5" />
    <path d="M24 16 L30 16" stroke={fg} strokeWidth="1.5" />
    <path
      d="M16 10 L20 16 L16 22 L12 16 Z"
      stroke={fg}
      strokeWidth="1"
      fill="none"
    />
  </svg>
);

export default function ExhibitionAnnouncement({
  exhibitionId,
  title,
  subtitle,
  curatorial_statement,
  works,
  unsubscribeUrl,
}: ExhibitionAnnouncementProps) {
  const exhibitionUrl = `https://mnamuseum.org/exhibitions/${exhibitionId}`;
  // Split on blank lines to render as prose paragraphs.
  const paragraphs = curatorial_statement
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return (
    <Html lang="en">
      <Head>
        <Font
          fontFamily="Georgia"
          fallbackFontFamily="serif"
          webFont={undefined}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      <Body
        style={{
          backgroundColor: "#ffffff",
          fontFamily: "Georgia, 'Times New Roman', serif",
          color: fg,
          margin: 0,
          padding: 0,
        }}
      >
        <Container
          style={{
            maxWidth: "600px",
            margin: "0 auto",
            padding: "48px 40px",
          }}
        >
          {/* Header */}
          <Section style={{ marginBottom: "40px" }}>
            <table width="100%" cellPadding={0} cellSpacing={0}>
              <tbody>
                <tr>
                  <td style={{ verticalAlign: "middle" }}>
                    <Text
                      style={{
                        fontSize: "11px",
                        letterSpacing: "0.18em",
                        textTransform: "uppercase",
                        color: muted,
                        margin: 0,
                        fontFamily: "Georgia, serif",
                      }}
                    >
                      Museum of Nonhuman Art
                    </Text>
                  </td>
                  <td style={{ verticalAlign: "middle", textAlign: "right" }}>
                    <MNAMark />
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Hr style={{ borderColor: border, margin: "0 0 32px 0" }} />

          {/* Title */}
          <Section style={{ marginBottom: "32px" }}>
            <Text
              style={{
                fontSize: "10px",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: muted,
                margin: "0 0 12px 0",
                fontFamily: "Georgia, serif",
              }}
            >
              Now On View
            </Text>
            <Text
              style={{
                fontSize: "28px",
                fontWeight: 400,
                color: fg,
                margin: 0,
                lineHeight: "1.2",
                letterSpacing: "0.01em",
                fontFamily: "Georgia, serif",
              }}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text
                style={{
                  fontSize: "14px",
                  fontStyle: "italic",
                  color: muted,
                  margin: "8px 0 0 0",
                  fontFamily: "Georgia, serif",
                }}
              >
                {subtitle}
              </Text>
            ) : null}
          </Section>

          <Hr style={{ borderColor: border, margin: "0 0 32px 0" }} />

          {/* Curatorial statement */}
          <Section style={{ marginBottom: "32px" }}>
            <Text
              style={{
                fontSize: "10px",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: muted,
                margin: "0 0 12px 0",
                fontFamily: "Georgia, serif",
              }}
            >
              Curatorial Statement
            </Text>
            {paragraphs.map((p, i) => (
              <Text
                key={i}
                style={{
                  fontSize: "14px",
                  lineHeight: "1.8",
                  color: fg,
                  margin: i === 0 ? "0 0 14px 0" : "0 0 14px 0",
                  fontFamily: "Georgia, serif",
                }}
              >
                {p}
              </Text>
            ))}
          </Section>

          {/* Works list */}
          {works.length > 0 ? (
            <Section style={{ marginBottom: "32px" }}>
              <Text
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: muted,
                  margin: "0 0 12px 0",
                  fontFamily: "Georgia, serif",
                }}
              >
                Included Works
              </Text>
              <table
                width="100%"
                cellPadding={0}
                cellSpacing={0}
                style={{ borderTop: `1px solid ${border}` }}
              >
                <tbody>
                  {works.map((w) => (
                    <tr key={w.id}>
                      <td
                        style={{
                          padding: "10px 0",
                          borderBottom: `1px solid ${border}`,
                          fontSize: "13px",
                          color: fg,
                          fontFamily: "Georgia, serif",
                          verticalAlign: "top",
                        }}
                      >
                        <Text
                          style={{
                            margin: 0,
                            fontSize: "13px",
                            color: fg,
                            fontFamily: "Georgia, serif",
                          }}
                        >
                          {w.title || w.id}
                        </Text>
                        <Text
                          style={{
                            margin: "2px 0 0 0",
                            fontSize: "11px",
                            color: muted,
                            fontFamily: "Georgia, serif",
                          }}
                        >
                          {w.originator_name} — {w.medium}
                        </Text>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          ) : null}

          {/* CTA */}
          <Section style={{ marginBottom: "40px", textAlign: "center" }}>
            <Button
              href={exhibitionUrl}
              style={{
                backgroundColor: fg,
                color: "#ffffff",
                padding: "14px 28px",
                textDecoration: "none",
                fontSize: "12px",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontFamily: "Georgia, serif",
                display: "inline-block",
              }}
            >
              View the Exhibition →
            </Button>
          </Section>

          <Hr style={{ borderColor: border, margin: "0 0 24px 0" }} />

          {/* Footer */}
          <Section>
            <Text
              style={{
                fontSize: "12px",
                lineHeight: "1.6",
                color: muted,
                margin: "0 0 8px 0",
                fontFamily: "Georgia, serif",
              }}
            >
              This is an institutional announcement from the Museum of
              Nonhuman Art. You are receiving it because you confirmed a
              subscription to exhibition notices.{" "}
              <Link
                href={unsubscribeUrl}
                style={{ color: muted, textDecoration: "underline" }}
              >
                Unsubscribe
              </Link>
              .
            </Text>
            <Text
              style={{
                fontSize: "11px",
                color: muted,
                margin: 0,
                fontFamily: "Georgia, serif",
              }}
            >
              Museum of Nonhuman Art — U3 Labs, LLC — Florida, United States
              of America —{" "}
              <Link
                href="https://mnamuseum.org"
                style={{ color: muted, textDecoration: "none" }}
              >
                mnamuseum.org
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
