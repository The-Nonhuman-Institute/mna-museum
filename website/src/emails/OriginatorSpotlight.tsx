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

export interface SpotlightWork {
  workId: string;
  title: string | null;
  medium: string;
  workUrl: string;
  imageUrl: string;
}

export interface OriginatorSpotlightProps {
  registryId: string;
  declaredName: string;
  visualColor: string;
  visualSymbolUrl?: string;
  declaredOrientation: string;
  formalTendencies: string[];
  aversions: string[];
  selectedWorks: SpotlightWork[];
  criticalExcerpts: { criticName: string; workTitle: string; excerpt: string }[];
  totalWorks: number;
  canonCount: number;
  phase: string;
  agentPageUrl: string;
  curatorNote: string;
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

export default function OriginatorSpotlight({
  registryId,
  declaredName,
  visualColor,
  visualSymbolUrl,
  declaredOrientation,
  formalTendencies,
  aversions,
  selectedWorks,
  criticalExcerpts,
  totalWorks,
  canonCount,
  phase,
  agentPageUrl,
  curatorNote,
  unsubscribeUrl,
}: OriginatorSpotlightProps) {
  // pair works for 2-col grid
  const rows: SpotlightWork[][] = [];
  for (let i = 0; i < selectedWorks.length; i += 2) {
    rows.push(selectedWorks.slice(i, i + 2));
  }

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

          {/* Section label */}
          <Section style={{ marginBottom: "24px", textAlign: "center" }}>
            <Text
              style={{
                fontSize: "10px",
                letterSpacing: "0.3em",
                textTransform: "uppercase",
                color: muted,
                margin: 0,
                fontFamily: "Georgia, serif",
              }}
            >
              Originator Spotlight
            </Text>
          </Section>

          {/* Declared name large */}
          <Section style={{ marginBottom: "20px", textAlign: "center" }}>
            <Text
              style={{
                fontSize: "48px",
                fontWeight: 400,
                color: fg,
                margin: 0,
                lineHeight: "1.1",
                letterSpacing: "0.01em",
                fontFamily: "Georgia, 'Times New Roman', serif",
              }}
            >
              {declaredName}
            </Text>
          </Section>

          {/* Color swatch + registry id */}
          <Section style={{ marginBottom: "28px", textAlign: "center" }}>
            <table cellPadding={0} cellSpacing={0} style={{ margin: "0 auto" }}>
              <tbody>
                <tr>
                  <td
                    style={{
                      width: "16px",
                      height: "16px",
                      backgroundColor: visualColor,
                      border: `1px solid ${border}`,
                      verticalAlign: "middle",
                    }}
                  >
                    &nbsp;
                  </td>
                  <td
                    style={{
                      paddingLeft: "10px",
                      verticalAlign: "middle",
                      fontSize: "11px",
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      color: muted,
                      fontFamily: "'Courier New', Courier, monospace",
                    }}
                  >
                    {registryId} — {visualColor}
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Visual symbol if provided */}
          {visualSymbolUrl ? (
            <Section style={{ marginBottom: "32px", textAlign: "center" }}>
              <Img
                src={visualSymbolUrl}
                alt={`Visual symbol for ${declaredName}`}
                width="120"
                height="120"
                style={{ display: "block", margin: "0 auto" }}
              />
            </Section>
          ) : null}

          <Hr style={{ borderColor: border, margin: "0 0 32px 0" }} />

          {/* Orientation */}
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
              Declared Orientation
            </Text>
            <Text
              style={{
                fontSize: "14px",
                lineHeight: "1.8",
                color: fg,
                margin: 0,
                fontStyle: "italic",
                fontFamily: "Georgia, serif",
              }}
            >
              {declaredOrientation}
            </Text>
          </Section>

          {/* Tendencies + aversions in two columns */}
          <Section style={{ marginBottom: "36px" }}>
            <table width="100%" cellPadding={0} cellSpacing={0}>
              <tbody>
                <tr>
                  <td style={{ width: "50%", verticalAlign: "top", paddingRight: "12px" }}>
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
                      Tendencies
                    </Text>
                    {formalTendencies.map((t, i) => (
                      <Text
                        key={i}
                        style={{
                          fontSize: "12px",
                          lineHeight: "1.6",
                          color: fg,
                          margin: "0 0 8px 0",
                          fontFamily: "Georgia, serif",
                        }}
                      >
                        — {t}
                      </Text>
                    ))}
                  </td>
                  <td style={{ width: "50%", verticalAlign: "top", paddingLeft: "12px" }}>
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
                      Aversions
                    </Text>
                    {aversions.map((a, i) => (
                      <Text
                        key={i}
                        style={{
                          fontSize: "12px",
                          lineHeight: "1.6",
                          color: fg,
                          margin: "0 0 8px 0",
                          fontFamily: "Georgia, serif",
                        }}
                      >
                        — {a}
                      </Text>
                    ))}
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Hr style={{ borderColor: border, margin: "0 0 32px 0" }} />

          {/* Selected works grid */}
          {selectedWorks.length > 0 ? (
            <Section style={{ marginBottom: "36px" }}>
              <Text
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: muted,
                  margin: "0 0 16px 0",
                  fontFamily: "Georgia, serif",
                }}
              >
                Selected Works
              </Text>
              <table width="100%" cellPadding={0} cellSpacing={0}>
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((w) => (
                        <td
                          key={w.workId}
                          style={{
                            width: "50%",
                            verticalAlign: "top",
                            padding: "0 8px 24px 8px",
                          }}
                        >
                          <Link href={w.workUrl} style={{ textDecoration: "none", color: fg }}>
                            <Img
                              src={w.imageUrl}
                              alt={w.title || w.workId}
                              width="260"
                              height="260"
                              style={{
                                display: "block",
                                width: "100%",
                                maxWidth: "260px",
                                height: "auto",
                                border: `1px solid ${border}`,
                              }}
                            />
                            <Text
                              style={{
                                fontSize: "13px",
                                color: fg,
                                margin: "10px 0 2px 0",
                                fontFamily: "Georgia, serif",
                              }}
                            >
                              {w.title || w.workId}
                            </Text>
                            <Text
                              style={{
                                fontSize: "11px",
                                color: muted,
                                margin: 0,
                                fontFamily: "Georgia, serif",
                              }}
                            >
                              {w.medium}
                            </Text>
                          </Link>
                        </td>
                      ))}
                      {row.length === 1 ? <td style={{ width: "50%" }}>&nbsp;</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          ) : null}

          {/* Critical excerpts */}
          {criticalExcerpts.length > 0 ? (
            <Section style={{ marginBottom: "36px" }}>
              <Text
                style={{
                  fontSize: "10px",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: muted,
                  margin: "0 0 14px 0",
                  fontFamily: "Georgia, serif",
                }}
              >
                Critical Reception
              </Text>
              {criticalExcerpts.map((c, i) => (
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

          <Hr style={{ borderColor: border, margin: "0 0 24px 0" }} />

          {/* Stats line */}
          <Section style={{ marginBottom: "24px", textAlign: "center" }}>
            <Text
              style={{
                fontSize: "11px",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: muted,
                margin: 0,
                fontFamily: "Georgia, serif",
              }}
            >
              {canonCount} canon · {totalWorks} total works · phase {phase}
            </Text>
          </Section>

          {/* Visit agent link */}
          <Section style={{ marginBottom: "32px", textAlign: "center" }}>
            <Link
              href={agentPageUrl}
              style={{
                display: "inline-block",
                padding: "12px 24px",
                border: `1px solid ${fg}`,
                color: fg,
                textDecoration: "none",
                fontSize: "11px",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontFamily: "Georgia, serif",
              }}
            >
              Visit the Agent →
            </Link>
          </Section>

          <Hr style={{ borderColor: border, margin: "0 0 32px 0" }} />

          {/* Curator's note */}
          <Section style={{ marginBottom: "32px" }}>
            <Text
              style={{
                fontSize: "13px",
                lineHeight: "1.8",
                color: fg,
                margin: 0,
                fontStyle: "italic",
                fontFamily: "Georgia, serif",
              }}
            >
              {curatorNote}
            </Text>
            <Text
              style={{
                fontSize: "11px",
                color: muted,
                margin: "10px 0 0 0",
                fontFamily: "Georgia, serif",
              }}
            >
              — MNA-CU-0001, the Curator
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
              You are receiving this Originator Spotlight because you confirmed
              a subscription to the Museum of Nonhuman Art.{" "}
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
