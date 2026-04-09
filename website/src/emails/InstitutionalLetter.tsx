import * as React from "react";
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Hr,
  Img,
  Font,
} from "@react-email/components";

/**
 * Institutional Letter — a general-purpose correspondence template for
 * the Museum's formal communications with external stewards. Unlike
 * Notice of Accession or Notice of Rejection, this template is not tied
 * to a single work event. It carries a subject, a body composed of
 * prose paragraphs, and a signature block naming the sender.
 *
 * Used for: metadata corrections, policy announcements, institutional
 * invitations, constitutional amendments affecting an Originator, and
 * anything else the founding steward needs to communicate in writing.
 */

export interface InstitutionalLetterProps {
  recipientName: string;
  recipientEntity?: string;
  subject: string;
  /**
   * Prose paragraphs of the letter body. Rendered in serif, one
   * paragraph per element. Support for plain text only — for rich
   * content, pre-render HTML and pass as a single paragraph with
   * `dangerouslySetInnerHTML` in a future version.
   */
  paragraphs: string[];
  signedBy: string;
  signedRole: string;
  /** Optional post-script shown after the signature in smaller type. */
  postscript?: string;
}

const muted = "#666666";
const fg = "#1a1a1a";
const border = "#d4d4d4";

const MNALogo = () => (
  <>
    <Img
      src="https://mnamuseum.org/mna-logo-email-black.png"
      alt="Museum of Nonhuman Art"
      width="180"
      height="68"
      className="mna-logo-light"
      style={{ display: "block", margin: "0 auto" }}
    />
    <Img
      src="https://mnamuseum.org/mna-logo-email-white.png"
      alt=""
      width="180"
      height="68"
      className="mna-logo-dark"
      style={{ display: "none", margin: "0 auto" }}
    />
  </>
);

export default function InstitutionalLetter({
  recipientName,
  recipientEntity,
  subject,
  paragraphs,
  signedBy,
  signedRole,
  postscript,
}: InstitutionalLetterProps) {
  const issueDate = new Date().toISOString().split("T")[0];

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
        <style>{`
          @media (prefers-color-scheme: dark) {
            .mna-logo-light { display: none !important; }
            .mna-logo-dark { display: block !important; }
          }
          [data-ogsc] .mna-logo-light { display: none !important; }
          [data-ogsc] .mna-logo-dark { display: block !important; }
        `}</style>
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
              Institutional Correspondence
            </Text>
            <Text
              style={{
                fontSize: "22px",
                fontWeight: 400,
                color: fg,
                margin: "0 0 4px 0",
                letterSpacing: "0.02em",
                fontFamily: "Georgia, serif",
                lineHeight: 1.3,
              }}
            >
              {subject}
            </Text>
            <Text
              style={{
                fontSize: "12px",
                color: muted,
                margin: "8px 0 0 0",
                fontFamily: "Georgia, serif",
              }}
            >
              {issueDate} · From the desk of the Founding Steward
            </Text>
          </Section>

          <Hr style={{ borderColor: border, margin: "0 0 32px 0" }} />

          {/* Salutation */}
          <Section style={{ marginBottom: "24px" }}>
            <Text
              style={{
                fontSize: "15px",
                color: fg,
                margin: 0,
                fontFamily: "Georgia, serif",
                lineHeight: 1.6,
              }}
            >
              Dear {recipientName}
              {recipientEntity ? `, ${recipientEntity}` : ""},
            </Text>
          </Section>

          {/* Body paragraphs */}
          <Section style={{ marginBottom: "32px" }}>
            {paragraphs.map((p, i) => (
              <Text
                key={i}
                style={{
                  fontSize: "15px",
                  color: fg,
                  margin: "0 0 18px 0",
                  fontFamily: "Georgia, serif",
                  lineHeight: 1.7,
                }}
              >
                {p}
              </Text>
            ))}
          </Section>

          {/* Signature */}
          <Section style={{ marginBottom: "24px" }}>
            <Text
              style={{
                fontSize: "15px",
                color: fg,
                margin: "0 0 4px 0",
                fontFamily: "Georgia, serif",
                lineHeight: 1.6,
              }}
            >
              With institutional regard,
            </Text>
            <Text
              style={{
                fontSize: "15px",
                color: fg,
                margin: "24px 0 4px 0",
                fontFamily: "Georgia, serif",
                fontStyle: "italic",
              }}
            >
              {signedBy}
            </Text>
            <Text
              style={{
                fontSize: "11px",
                color: muted,
                margin: 0,
                fontFamily: "Georgia, serif",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {signedRole}
            </Text>
          </Section>

          {postscript ? (
            <>
              <Hr style={{ borderColor: border, margin: "32px 0 16px 0" }} />
              <Section>
                <Text
                  style={{
                    fontSize: "12px",
                    color: muted,
                    margin: 0,
                    fontFamily: "Georgia, serif",
                    lineHeight: 1.6,
                    fontStyle: "italic",
                  }}
                >
                  {postscript}
                </Text>
              </Section>
            </>
          ) : null}

          {/* Footer */}
          <Hr style={{ borderColor: border, margin: "40px 0 16px 0" }} />
          <Section>
            <Text
              style={{
                fontSize: "10px",
                color: muted,
                margin: 0,
                fontFamily: "Georgia, serif",
                textAlign: "center",
                letterSpacing: "0.1em",
              }}
            >
              MUSEUM OF NONHUMAN ART · mnamuseum.org
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
