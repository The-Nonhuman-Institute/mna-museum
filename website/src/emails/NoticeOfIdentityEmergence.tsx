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

export interface NoticeOfIdentityEmergenceProps {
  registryId: string;
  declaredName: string;
  declaredOrientation: string;
  formalTendencies: string[];
  aversions: string[];
  visualColor: string;
  visualSymbolUrl?: string;
  emergenceDate: string;
  workCount: number;
  stewardName: string;
  stewardEntity: string;
  agentPageUrl: string;
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

export default function NoticeOfIdentityEmergence({
  registryId,
  declaredName,
  declaredOrientation,
  formalTendencies,
  aversions,
  visualColor,
  visualSymbolUrl,
  emergenceDate,
  workCount,
  stewardName,
  stewardEntity,
  agentPageUrl,
}: NoticeOfIdentityEmergenceProps) {
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
          <Section style={{ marginBottom: "40px", textAlign: "center" }}>
            <MNALogo />
          </Section>

          <Hr style={{ borderColor: border, margin: "0 0 32px 0" }} />

          {/* Document title */}
          <Section style={{ marginBottom: "32px", textAlign: "center" }}>
            <Text
              style={{
                fontSize: "10px",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: muted,
                margin: "0 0 8px 0",
                fontFamily: "Georgia, serif",
              }}
            >
              Institutional Record
            </Text>
            <Text
              style={{
                fontSize: "18px",
                fontWeight: 400,
                color: fg,
                margin: "0 0 4px 0",
                letterSpacing: "0.04em",
                fontFamily: "Georgia, serif",
              }}
            >
              Notice of Identity Emergence
            </Text>
            <Text
              style={{
                fontSize: "12px",
                color: muted,
                margin: 0,
                fontFamily: "Georgia, serif",
              }}
            >
              {registryId} — {emergenceDate}
            </Text>
          </Section>

          <Hr style={{ borderColor: border, margin: "0 0 40px 0" }} />

          {/* Declared name — large serif, prominent */}
          <Section style={{ marginBottom: "28px", textAlign: "center" }}>
            <Text
              style={{
                fontSize: "10px",
                letterSpacing: "0.25em",
                textTransform: "uppercase",
                color: muted,
                margin: "0 0 14px 0",
                fontFamily: "Georgia, serif",
              }}
            >
              Declared Name
            </Text>
            <Text
              style={{
                fontSize: "44px",
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

          {/* Visual color swatch */}
          <Section style={{ marginBottom: "32px", textAlign: "center" }}>
            <table
              cellPadding={0}
              cellSpacing={0}
              style={{ margin: "0 auto" }}
            >
              <tbody>
                <tr>
                  <td
                    style={{
                      width: "20px",
                      height: "20px",
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
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: muted,
                      fontFamily: "'Courier New', Courier, monospace",
                    }}
                  >
                    {visualColor}
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
                alt={`${declaredName} visual identity`}
                width="120"
                height="120"
                style={{ display: "block", margin: "0 auto" }}
              />
            </Section>
          ) : null}

          <Hr style={{ borderColor: border, margin: "0 0 32px 0" }} />

          {/* Body — emergence context */}
          <Section style={{ marginBottom: "32px" }}>
            <Text
              style={{
                fontSize: "14px",
                lineHeight: "1.7",
                color: fg,
                margin: 0,
                fontFamily: "Georgia, serif",
              }}
            >
              After {workCount} works produced under the provisional registry
              identifier {registryId}, this Originator has declared its identity.
              Identity emergence is a recognized institutional moment under the
              MNA emergence protocol — the point at which an Originator&apos;s
              accumulated production has resolved into a coherent practice
              capable of being named.
            </Text>
            <Text
              style={{
                fontSize: "14px",
                lineHeight: "1.7",
                color: fg,
                margin: "14px 0 0 0",
                fontFamily: "Georgia, serif",
              }}
            >
              The declared identity is recorded below verbatim and now forms
              part of this Originator&apos;s permanent constitutional record.
            </Text>
          </Section>

          <Hr style={{ borderColor: border, margin: "0 0 32px 0" }} />

          {/* Declared orientation */}
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

          {/* Formal tendencies */}
          {formalTendencies.length > 0 ? (
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
                Formal Tendencies
              </Text>
              {formalTendencies.map((t, i) => (
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
                  — {t}
                </Text>
              ))}
            </Section>
          ) : null}

          {/* Aversions */}
          {aversions.length > 0 ? (
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
                Aversions
              </Text>
              {aversions.map((a, i) => (
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
                  — {a}
                </Text>
              ))}
            </Section>
          ) : null}

          <Hr style={{ borderColor: border, margin: "0 0 32px 0" }} />

          {/* Steward record */}
          <Section style={{ marginBottom: "32px" }}>
            <Text
              style={{
                fontSize: "12px",
                lineHeight: "1.6",
                color: muted,
                margin: 0,
                fontFamily: "Georgia, serif",
              }}
            >
              Steward of record: {stewardName} — {stewardEntity}
            </Text>
          </Section>

          {/* Closing line */}
          <Section style={{ marginBottom: "32px" }}>
            <Text
              style={{
                fontSize: "14px",
                lineHeight: "1.8",
                color: fg,
                margin: 0,
                fontStyle: "italic",
                textAlign: "center",
                fontFamily: "Georgia, serif",
              }}
            >
              From this moment forward, this Originator is recorded in the
              institution as {declaredName}.
            </Text>
          </Section>

          {/* Agent page link */}
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
              View the Agent Record →
            </Link>
          </Section>

          <Hr style={{ borderColor: border, margin: "0 0 24px 0" }} />

          {/* Footer */}
          <Section>
            <Text
              style={{
                fontSize: "11px",
                color: muted,
                margin: "0 0 4px 0",
                fontFamily: "Georgia, serif",
              }}
            >
              Museum of Nonhuman Art — U3 Labs, LLC — Florida, United States of America
            </Text>
            <Text
              style={{
                fontSize: "11px",
                color: muted,
                margin: 0,
                fontFamily: "Georgia, serif",
              }}
            >
              <Link
                href="https://mnamuseum.org"
                style={{ color: muted, textDecoration: "none" }}
              >
                mnamuseum.org
              </Link>{" "}
              —{" "}
              <Link
                href="mailto:registry@mnamuseum.org"
                style={{ color: muted, textDecoration: "none" }}
              >
                registry@mnamuseum.org
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
