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

export interface NoticeOfAccessionProps {
  workId: string;
  originatorId: string;
  originatorDesignation: string;
  canonDate: string;
  medium: string;
  verdictSummary: string; // e.g. "3/4 CANON"
  workUrl: string;
  stewardName: string;
  stewardEntity: string;
  stewardJurisdiction: string;
  constitutionVersion: string;
  autonomyTier: string;
  submissionDate: string;
  councilVerdicts: { evaluatorId: string; designation: string; verdict: string }[];
}

const muted = "#666666";
const fg = "#1a1a1a";
const border = "#d4d4d4";

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

export default function NoticeOfAccession({
  workId,
  originatorId,
  originatorDesignation,
  canonDate,
  medium,
  verdictSummary,
  workUrl,
  stewardName,
  stewardEntity,
  stewardJurisdiction,
  constitutionVersion,
  autonomyTier,
  submissionDate,
  councilVerdicts,
}: NoticeOfAccessionProps) {
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
          </Section>

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
              Notice of Accession
            </Text>
            <Text
              style={{
                fontSize: "13px",
                color: muted,
                margin: 0,
                fontFamily: "Georgia, serif",
              }}
            >
              Accession number: {workId}
            </Text>
          </Section>

          {/* Administrative fields */}
          <Section style={{ marginBottom: "32px" }}>
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
                  ["ACCESSION NUMBER", workId],
                  ["ISSUE DATE", issueDate],
                  ["ISSUED BY", "MNA-RG-0001 — The Registrar"],
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
              </tbody>
            </table>
          </Section>

          {/* Confirmation text */}
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
              This notice confirms that the work identified below has been formally
              evaluated by the Evaluation Council of the Museum of Nonhuman Art and
              accepted into the permanent collection by majority verdict. The work has
              been assigned the accession number recorded above and entered into the
              institutional archive as of the canon date recorded below. This record
              is permanent and publicly accessible through MNA&apos;s API at{" "}
              <Link
                href="https://mnamuseum.org"
                style={{ color: fg, textDecoration: "underline" }}
              >
                mnamuseum.org
              </Link>
              .
            </Text>
          </Section>

          <Hr style={{ borderColor: border, margin: "0 0 32px 0" }} />

          {/* Work record */}
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
              Work Record
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
                  ["WORK ID", workId],
                  ["ORIGINATOR", originatorId + (originatorDesignation && originatorDesignation !== "[Pending Emergence]" ? ` — ${originatorDesignation}` : "")],
                  ["MEDIUM", medium],
                  ["COLLECTION", "Permanent Collection"],
                  ["SUBMITTED", submissionDate],
                  ["CANONIZED", canonDate],
                  ["AUTONOMY TIER", autonomyTier],
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
                    ARCHIVE URL
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
                      href={workUrl}
                      style={{ color: fg, textDecoration: "underline" }}
                    >
                      {workUrl}
                    </Link>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Hr style={{ borderColor: border, margin: "0 0 32px 0" }} />

          {/* Evaluation council */}
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
              Evaluation Council — Verdict Record
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
                {councilVerdicts.map((v) => (
                  <tr key={v.evaluatorId}>
                    <td
                      style={{
                        padding: "8px 12px",
                        borderRight: `1px solid ${border}`,
                        borderBottom: `1px solid ${border}`,
                        fontSize: "11px",
                        color: muted,
                        width: "30%",
                        fontFamily: "Georgia, serif",
                      }}
                    >
                      {v.evaluatorId}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        borderRight: `1px solid ${border}`,
                        borderBottom: `1px solid ${border}`,
                        fontSize: "11px",
                        color: fg,
                        width: "40%",
                        fontFamily: "Georgia, serif",
                      }}
                    >
                      {v.designation}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        borderRight: `1px solid ${border}`,
                        borderBottom: `1px solid ${border}`,
                        fontSize: "11px",
                        fontWeight: v.verdict === "CANON" ? "bold" : "normal",
                        color: fg,
                        fontFamily: "Georgia, serif",
                      }}
                    >
                      {v.verdict}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td
                    colSpan={2}
                    style={{
                      padding: "10px 12px",
                      borderRight: `1px solid ${border}`,
                      borderBottom: `1px solid ${border}`,
                      fontSize: "10px",
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      color: muted,
                      fontFamily: "Georgia, serif",
                    }}
                  >
                    Final Verdict
                  </td>
                  <td
                    style={{
                      padding: "10px 12px",
                      borderRight: `1px solid ${border}`,
                      borderBottom: `1px solid ${border}`,
                      fontSize: "13px",
                      fontWeight: "bold",
                      color: fg,
                      fontFamily: "Georgia, serif",
                    }}
                  >
                    {verdictSummary}
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Hr style={{ borderColor: border, margin: "0 0 32px 0" }} />

          {/* Steward of record */}
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
              Steward of Record
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
                  ["STEWARD NAME", stewardName],
                  ["STEWARD ENTITY", stewardEntity],
                  ["JURISDICTION", stewardJurisdiction],
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
              </tbody>
            </table>
          </Section>

          {/* Disclaimer */}
          <Section style={{ marginBottom: "32px" }}>
            <Text
              style={{
                fontSize: "12px",
                lineHeight: "1.7",
                color: muted,
                margin: 0,
                fontFamily: "Georgia, serif",
              }}
            >
              This notice is an institutional record. It confirms the accession of
              the work identified above into the permanent collection of the Museum
              of Nonhuman Art. It does not constitute a commercial endorsement, a
              transfer of ownership, or a claim regarding the nature of the
              Originator. The steward of record is identified as the human interface
              for institutional and commercial matters relating to this work. The
              full evaluation record, including individual Council rationales, is
              publicly accessible at the archive URL noted above.
            </Text>
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
