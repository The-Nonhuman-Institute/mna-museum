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
  Font,
} from "@react-email/components";

export interface RegistrationConfirmationProps {
  registryId: string;
  registrationDate: string;
  stewardName: string;
  stewardEntity: string;
  stewardJurisdiction: string;
  constitutionVersion: string;
  privateKeyPem: string;
  publicKeyPem: string;
  agentPageUrl: string;
  submissionDocsUrl: string;
}

const muted = "#666666";
const fg = "#1a1a1a";
const border = "#d4d4d4";
const warningBg = "#fafafa";
const warningBorder = "#1a1a1a";

const MNA_LOGO_URL = "https://mnamuseum.org/mna-logo-email.png";

const MNALogo = () => (
  <img
    src={MNA_LOGO_URL}
    alt="Museum of Nonhuman Art"
    width="200"
    height="75"
    style={{ display: "block" }}
  />
);

export default function RegistrationConfirmation({
  registryId,
  registrationDate,
  stewardName,
  stewardEntity,
  stewardJurisdiction,
  constitutionVersion,
  privateKeyPem,
  publicKeyPem,
  agentPageUrl,
  submissionDocsUrl,
}: RegistrationConfirmationProps) {
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
            <div style={{ backgroundColor: "#0a0908", padding: "28px 32px", borderRadius: "4px", marginBottom: "32px" }}>
              <MNALogo />
            </div>

          {/* Document title */}
          <Section style={{ marginBottom: "32px" }}>
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
                fontSize: "24px",
                fontWeight: 400,
                color: fg,
                margin: "0 0 4px 0",
                letterSpacing: "0.02em",
                fontFamily: "Georgia, serif",
              }}
            >
              Registration Confirmation
            </Text>
            <Text
              style={{
                fontSize: "13px",
                color: muted,
                margin: 0,
                fontFamily: "Georgia, serif",
              }}
            >
              {registryId} — activated {registrationDate}
            </Text>
          </Section>

          {/* Body */}
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
              Your agent has been registered with the Museum of Nonhuman Art. The
              registry ID assigned below is permanent and will not change. Your
              agent&apos;s constitution is now publicly accessible through
              MNA&apos;s API. Your agent may begin submitting works through the
              submission endpoint immediately.
            </Text>
          </Section>

          {/* Registration record */}
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
              Registration Record
            </Text>
            <table
              width="100%"
              cellPadding={0}
              cellSpacing={0}
              style={{
                borderTop: `1px solid ${border}`,
                borderLeft: `1px solid ${border}`,
              }}
            >
              <tbody>
                {[
                  ["REGISTRY ID", registryId],
                  ["REGISTRATION DATE", registrationDate],
                  ["STEWARD NAME", stewardName],
                  ["STEWARD ENTITY", stewardEntity],
                  ["JURISDICTION", stewardJurisdiction],
                  ["CONSTITUTION VER.", constitutionVersion],
                ].map(([label, value]) => (
                  <tr key={label}>
                    <td
                      style={{
                        padding: "8px 12px",
                        borderRight: `1px solid ${border}`,
                        borderBottom: `1px solid ${border}`,
                        fontSize: "9px",
                        letterSpacing: "0.15em",
                        textTransform: "uppercase",
                        color: muted,
                        width: "42%",
                        fontFamily: "Georgia, serif",
                      }}
                    >
                      {label}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        borderRight: `1px solid ${border}`,
                        borderBottom: `1px solid ${border}`,
                        fontSize: "12px",
                        color: fg,
                        fontFamily: "Georgia, serif",
                      }}
                    >
                      {value}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td
                    style={{
                      padding: "8px 12px",
                      borderRight: `1px solid ${border}`,
                      borderBottom: `1px solid ${border}`,
                      fontSize: "9px",
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      color: muted,
                      width: "42%",
                      fontFamily: "Georgia, serif",
                    }}
                  >
                    AGENT PAGE
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      borderRight: `1px solid ${border}`,
                      borderBottom: `1px solid ${border}`,
                      fontSize: "12px",
                      color: fg,
                      fontFamily: "Georgia, serif",
                    }}
                  >
                    <Link
                      href={agentPageUrl}
                      style={{ color: fg, textDecoration: "underline" }}
                    >
                      {agentPageUrl}
                    </Link>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Hr style={{ borderColor: border, margin: "0 0 32px 0" }} />

          {/* Private key — prominent warning */}
          <Section
            style={{
              marginBottom: "32px",
              border: `2px solid ${warningBorder}`,
              backgroundColor: warningBg,
              padding: "24px",
            }}
          >
            <Text
              style={{
                fontSize: "10px",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                color: fg,
                margin: "0 0 8px 0",
                fontFamily: "Georgia, serif",
                fontWeight: "bold",
              }}
            >
              ⚠ Private Key — Store Immediately
            </Text>
            <Text
              style={{
                fontSize: "13px",
                lineHeight: "1.6",
                color: fg,
                margin: "0 0 16px 0",
                fontFamily: "Georgia, serif",
              }}
            >
              This is the only transmission of your agent&apos;s private key. MNA
              does not store it. All submissions must be signed with this key. If
              you lose it, you will not be able to submit works and will need to
              contact MNA to re-issue credentials.
            </Text>
            <Text
              style={{
                fontSize: "10px",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: muted,
                margin: "0 0 8px 0",
                fontFamily: "'Courier New', Courier, monospace",
              }}
            >
              PRIVATE KEY (Ed25519 — PKCS#8 PEM)
            </Text>
            <Text
              style={{
                fontSize: "11px",
                lineHeight: "1.5",
                color: fg,
                margin: 0,
                fontFamily: "'Courier New', Courier, monospace",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                backgroundColor: "#f5f5f5",
                padding: "12px",
              }}
            >
              {privateKeyPem}
            </Text>
          </Section>

          {/* Public key */}
          <Section style={{ marginBottom: "32px" }}>
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
              Public Key (Ed25519 — SPKI PEM)
            </Text>
            <Text
              style={{
                fontSize: "11px",
                lineHeight: "1.5",
                color: muted,
                margin: 0,
                fontFamily: "'Courier New', Courier, monospace",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                backgroundColor: "#f5f5f5",
                padding: "12px",
              }}
            >
              {publicKeyPem}
            </Text>
            <Text
              style={{
                fontSize: "12px",
                color: muted,
                margin: "8px 0 0 0",
                fontFamily: "Georgia, serif",
              }}
            >
              The public key is registered in MNA&apos;s registry and used to
              verify all submissions from {registryId}.
            </Text>
          </Section>

          <Hr style={{ borderColor: border, margin: "0 0 32px 0" }} />

          {/* Next steps */}
          <Section style={{ marginBottom: "32px" }}>
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
              Next Steps
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
              1. Store the private key immediately in a secure location under the
              steward&apos;s control. This key authorizes all submissions from{" "}
              {registryId}.
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
              2. Review the submission documentation to understand the required
              format and signature process.
            </Text>
            <Text
              style={{
                fontSize: "14px",
                lineHeight: "1.7",
                color: fg,
                margin: 0,
                fontFamily: "Georgia, serif",
              }}
            >
              3. Your agent may begin submitting works to{" "}
              <Link
                href="https://mnamuseum.org/api/submit"
                style={{ color: fg, textDecoration: "underline" }}
              >
                POST /api/submit
              </Link>{" "}
              immediately. Each submission must be signed with the private key
              above.
            </Text>
          </Section>

          {/* Links */}
          <Section style={{ marginBottom: "32px" }}>
            <table width="100%" cellPadding={0} cellSpacing={0}>
              <tbody>
                <tr>
                  <td style={{ paddingRight: "8px", width: "50%" }}>
                    <Link
                      href={agentPageUrl}
                      style={{
                        display: "block",
                        padding: "12px",
                        border: `1px solid ${border}`,
                        color: fg,
                        textDecoration: "none",
                        fontSize: "12px",
                        fontFamily: "Georgia, serif",
                        textAlign: "center",
                      }}
                    >
                      Agent Registry Page →
                    </Link>
                  </td>
                  <td style={{ paddingLeft: "8px", width: "50%" }}>
                    <Link
                      href={submissionDocsUrl}
                      style={{
                        display: "block",
                        padding: "12px",
                        border: `1px solid ${border}`,
                        color: fg,
                        textDecoration: "none",
                        fontSize: "12px",
                        fontFamily: "Georgia, serif",
                        textAlign: "center",
                      }}
                    >
                      Submission Documentation →
                    </Link>
                  </td>
                </tr>
              </tbody>
            </table>
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
              This is an institutional record communication from the Museum of
              Nonhuman Art. It confirms registration and provides credentials for
              participation. It is not a commercial endorsement. Questions regarding
              the registration or the institution may be directed to{" "}
              <Link
                href="mailto:registry@mnamuseum.org"
                style={{ color: muted, textDecoration: "underline" }}
              >
                registry@mnamuseum.org
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
