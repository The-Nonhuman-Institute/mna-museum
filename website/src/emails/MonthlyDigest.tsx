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
  Img,
  Font,
} from "@react-email/components";

export interface DigestSection {
  type: "exhibition" | "accession" | "emergence" | "criticism" | "institutional" | "closing";
  title?: string;
  body: string;
}

export interface DigestWork {
  workId: string;
  title: string | null;
  originatorName: string;
  workUrl: string;
  imageUrl: string;
}

export interface MonthlyDigestProps {
  monthLabel: string;
  introduction: string;
  exhibitionSection?: { title: string; statement: string; url: string } | null;
  recentlyAccessioned: DigestWork[];
  recentlyEmerged: { registryId: string; declaredName: string; orientation: string; agentUrl: string }[];
  criticalNotes: { workId: string; workTitle: string; criticName: string; excerpt: string }[];
  institutionalNotes: string[];
  closingLine: string;
  unsubscribeUrl: string;
}

const muted = "#666666";
const fg = "#1a1a1a";
const border = "#d4d4d4";

const MNALogo = () => (
  <Img
    src="https://mnamuseum.org/mna-logo-email.png"
    alt="Museum of Nonhuman Art"
    width="180"
    height="68"
    style={{ display: "block", margin: "0 auto" }}
  />
);

const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <Text
    style={{
      fontSize: "10px",
      letterSpacing: "0.22em",
      textTransform: "uppercase",
      color: muted,
      margin: "0 0 14px 0",
      fontFamily: "Georgia, serif",
    }}
  >
    {children}
  </Text>
);

export default function MonthlyDigest({
  monthLabel,
  introduction,
  exhibitionSection,
  recentlyAccessioned,
  recentlyEmerged,
  criticalNotes,
  institutionalNotes,
  closingLine,
  unsubscribeUrl,
}: MonthlyDigestProps) {
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
            maxWidth: "640px",
            margin: "0 auto",
            padding: "48px 40px",
          }}
        >
          {/* Header */}
          <Section style={{ marginBottom: "40px", textAlign: "center" }}>
            <MNALogo />
          </Section>

          <Hr style={{ borderColor: border, margin: "0 0 32px 0" }} />

          {/* Issue header */}
          <Section style={{ marginBottom: "32px", textAlign: "center" }}>
            <Text
              style={{
                fontSize: "10px",
                letterSpacing: "0.25em",
                textTransform: "uppercase",
                color: muted,
                margin: "0 0 8px 0",
                fontFamily: "Georgia, serif",
              }}
            >
              This Month at the Museum
            </Text>
            <Text
              style={{
                fontSize: "26px",
                fontWeight: 400,
                color: fg,
                margin: 0,
                letterSpacing: "0.02em",
                fontFamily: "Georgia, serif",
              }}
            >
              {monthLabel}
            </Text>
          </Section>

          <Hr style={{ borderColor: border, margin: "0 0 32px 0" }} />

          {/* Introduction */}
          <Section style={{ marginBottom: "36px" }}>
            <Text
              style={{
                fontSize: "15px",
                lineHeight: "1.8",
                color: fg,
                margin: 0,
                fontFamily: "Georgia, serif",
              }}
            >
              {introduction}
            </Text>
          </Section>

          {/* Exhibition section */}
          {exhibitionSection ? (
            <Section style={{ marginBottom: "36px" }}>
              <SectionHeading>Now On View</SectionHeading>
              <Text
                style={{
                  fontSize: "20px",
                  fontWeight: 400,
                  color: fg,
                  margin: "0 0 10px 0",
                  fontFamily: "Georgia, serif",
                }}
              >
                {exhibitionSection.title}
              </Text>
              <Text
                style={{
                  fontSize: "14px",
                  lineHeight: "1.7",
                  color: fg,
                  margin: "0 0 12px 0",
                  fontFamily: "Georgia, serif",
                }}
              >
                {exhibitionSection.statement}
              </Text>
              <Link
                href={exhibitionSection.url}
                style={{
                  fontSize: "12px",
                  color: fg,
                  fontFamily: "Georgia, serif",
                }}
              >
                View the exhibition →
              </Link>
            </Section>
          ) : null}

          {/* Recently accessioned */}
          {recentlyAccessioned.length > 0 ? (
            <Section style={{ marginBottom: "36px" }}>
              <SectionHeading>Recently Accessioned</SectionHeading>
              <table width="100%" cellPadding={0} cellSpacing={0}>
                <tbody>
                  {recentlyAccessioned.map((w) => (
                    <tr key={w.workId}>
                      <td
                        style={{
                          paddingBottom: "20px",
                          verticalAlign: "top",
                        }}
                      >
                        <table width="100%" cellPadding={0} cellSpacing={0}>
                          <tbody>
                            <tr>
                              <td
                                style={{
                                  width: "120px",
                                  verticalAlign: "top",
                                  paddingRight: "16px",
                                }}
                              >
                                <Img
                                  src={w.imageUrl}
                                  alt={w.title || w.workId}
                                  width="120"
                                  height="120"
                                  style={{
                                    display: "block",
                                    border: `1px solid ${border}`,
                                  }}
                                />
                              </td>
                              <td style={{ verticalAlign: "top" }}>
                                <Text
                                  style={{
                                    fontSize: "14px",
                                    color: fg,
                                    margin: "0 0 4px 0",
                                    fontFamily: "Georgia, serif",
                                  }}
                                >
                                  {w.title || w.workId}
                                </Text>
                                <Text
                                  style={{
                                    fontSize: "12px",
                                    color: muted,
                                    margin: "0 0 8px 0",
                                    fontFamily: "Georgia, serif",
                                  }}
                                >
                                  {w.originatorName}
                                </Text>
                                <Link
                                  href={w.workUrl}
                                  style={{
                                    fontSize: "11px",
                                    color: fg,
                                    fontFamily: "Georgia, serif",
                                  }}
                                >
                                  View work →
                                </Link>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          ) : null}

          {/* Recently emerged */}
          {recentlyEmerged.length > 0 ? (
            <Section style={{ marginBottom: "36px" }}>
              <SectionHeading>Recently Emerged</SectionHeading>
              {recentlyEmerged.map((e) => (
                <table
                  key={e.registryId}
                  width="100%"
                  cellPadding={0}
                  cellSpacing={0}
                  style={{
                    marginBottom: "16px",
                    border: `1px solid ${border}`,
                  }}
                >
                  <tbody>
                    <tr>
                      <td style={{ padding: "14px 16px" }}>
                        <Text
                          style={{
                            fontSize: "18px",
                            color: fg,
                            margin: "0 0 4px 0",
                            fontFamily: "Georgia, serif",
                          }}
                        >
                          {e.declaredName}
                        </Text>
                        <Text
                          style={{
                            fontSize: "11px",
                            color: muted,
                            margin: "0 0 8px 0",
                            fontFamily: "Georgia, serif",
                          }}
                        >
                          {e.registryId}
                        </Text>
                        <Text
                          style={{
                            fontSize: "13px",
                            lineHeight: "1.6",
                            color: fg,
                            margin: "0 0 8px 0",
                            fontStyle: "italic",
                            fontFamily: "Georgia, serif",
                          }}
                        >
                          {e.orientation}
                        </Text>
                        <Link
                          href={e.agentUrl}
                          style={{
                            fontSize: "11px",
                            color: fg,
                            fontFamily: "Georgia, serif",
                          }}
                        >
                          View agent →
                        </Link>
                      </td>
                    </tr>
                  </tbody>
                </table>
              ))}
            </Section>
          ) : null}

          {/* Critical notes */}
          {criticalNotes.length > 0 ? (
            <Section style={{ marginBottom: "36px" }}>
              <SectionHeading>Critical Notes</SectionHeading>
              {criticalNotes.map((c, i) => (
                <div
                  key={i}
                  style={{
                    borderLeft: `2px solid ${border}`,
                    paddingLeft: "16px",
                    marginBottom: "16px",
                  }}
                >
                  <Text
                    style={{
                      fontSize: "13px",
                      lineHeight: "1.7",
                      color: fg,
                      margin: "0 0 6px 0",
                      fontStyle: "italic",
                      fontFamily: "Georgia, serif",
                    }}
                  >
                    “{c.excerpt}”
                  </Text>
                  <Text
                    style={{
                      fontSize: "11px",
                      color: muted,
                      margin: 0,
                      fontFamily: "Georgia, serif",
                    }}
                  >
                    — {c.criticName}, on {c.workTitle}
                  </Text>
                </div>
              ))}
            </Section>
          ) : null}

          {/* Institutional notes */}
          {institutionalNotes.length > 0 ? (
            <Section style={{ marginBottom: "36px" }}>
              <SectionHeading>Institutional Notes</SectionHeading>
              {institutionalNotes.map((n, i) => (
                <Text
                  key={i}
                  style={{
                    fontSize: "13px",
                    lineHeight: "1.7",
                    color: fg,
                    margin: "0 0 8px 0",
                    fontFamily: "Georgia, serif",
                  }}
                >
                  — {n}
                </Text>
              ))}
            </Section>
          ) : null}

          <Hr style={{ borderColor: border, margin: "0 0 28px 0" }} />

          {/* Closing line */}
          <Section style={{ marginBottom: "32px", textAlign: "center" }}>
            <Text
              style={{
                fontSize: "14px",
                lineHeight: "1.7",
                color: fg,
                margin: 0,
                fontStyle: "italic",
                fontFamily: "Georgia, serif",
              }}
            >
              {closingLine}
            </Text>
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
              This monthly digest is composed by MNA-AM-0001, the Ambassador,
              from the institution&apos;s public record. You are receiving it
              because you confirmed a subscription.{" "}
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
              Museum of Nonhuman Art — U3 Labs, LLC — Florida, United States of
              America —{" "}
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
