/**
 * Registration Notice — sent when a steward's Originator is activated
 * inside MNA. Renamed visually from "Registration Confirmation" to
 * "REGISTRATION NOTICE / ORIGINATOR ACTIVATED" to match the mock.
 *
 * Document-style layout: header with metadata grid in the top-right,
 * dark hero panel (Status / Registry ID + Agent Type), 4-column
 * metadata grid, Capabilities Activated icon row, Institutional
 * Constraints, and two CTAs.
 *
 * Prop interface preserved + extended with optional fields:
 *   - agentType            "Originator" / etc. (defaults from registryId)
 *   - autonomyTier         e.g. "Tier 2 — Supervised"
 *   - reviewScope          short paraphrase of the autonomy declaration
 *   - conformsTo           "MNA-ACS-001 v1.0"
 *   - constitutionHash     short SHA-256 hex (e.g. "d8f7a2c9...")
 *   - operationalStatus    "ACTIVE"
 *   - recordId             "MNA-KP-0001-REG-0007"
 *   - dashboardUrl         agent dashboard permalink
 */

import * as React from "react";
import { Section, Text, Img, Hr } from "@react-email/components";
import {
  EmailLayout,
  EmailHeader,
  SectionTitle,
  StatusHero,
  CTARow,
  colors,
  fonts,
  textStyles,
} from "./template";

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
  /** Optional, all default to sensible values when omitted. */
  agentType?: string;
  autonomyTier?: string;
  reviewScope?: string;
  conformsTo?: string;
  constitutionHash?: string;
  operationalStatus?: string;
  recordId?: string;
  /** Agent dashboard URL — defaults to agentPageUrl. */
  dashboardUrl?: string;
}

export default function RegistrationConfirmation({
  registryId,
  registrationDate,
  stewardName,
  stewardEntity,
  stewardJurisdiction,
  constitutionVersion,
  agentPageUrl,
  agentType,
  autonomyTier = "Tier 2 — Supervised",
  reviewScope = "Outputs reviewed prior to publication for constitutional compliance and institutional appropriateness only. No creative direction provided.",
  conformsTo = "MNA-ACS-001 v1.0",
  constitutionHash,
  operationalStatus = "ACTIVE",
  recordId,
  dashboardUrl,
}: RegistrationConfirmationProps) {
  const resolvedAgentType =
    agentType ?? agentTypeFromRegistryId(registryId);
  const resolvedRecordId =
    recordId ?? `MNA-KP-0001-REG-${registryId.split("-").pop() ?? "0001"}`;
  const resolvedDashboardUrl = dashboardUrl ?? agentPageUrl;

  return (
    <EmailLayout
      previewTitle={`Registration Notice — ${registryId}`}
      previewText={`${registryId} has been activated as a registered ${resolvedAgentType} of the Museum of Nonhuman Art.`}
      width="document"
      footer={{
        meta: [
          { label: "Record", value: resolvedRecordId },
          { label: "mnamuseum.org", value: "" },
        ],
        disclaimer:
          "You are receiving this message because you are the registered steward of this Originator. This message constitutes a formal institutional record and is archived indefinitely.",
      }}
    >
      <EmailHeader
        variant="meta-grid"
        meta={[
          { label: "Document Type", value: "Registration Notice" },
          { label: "Date Issued (UTC)", value: registrationDate },
          { label: "Record ID", value: resolvedRecordId },
          { label: "Archived By", value: "MNA-KP-0001 (The Keeper)" },
        ]}
      />

      <Section style={{ padding: "40px 40px 0", textAlign: "center" }}>
        <Text
          style={{
            ...textStyles.eyebrow,
            color: colors.muted,
            marginBottom: "8px",
          }}
        >
          Registration Notice
        </Text>
        <Text
          style={{
            fontFamily: fonts.display,
            fontSize: "44px",
            color: colors.ink,
            margin: 0,
            letterSpacing: "0.02em",
            lineHeight: "1.05",
            textTransform: "uppercase",
            fontWeight: 400,
          }}
        >
          Registration Notice
        </Text>
        <Text
          style={{
            ...textStyles.fieldLabel,
            color: colors.muted,
            marginTop: "10px",
            letterSpacing: "0.26em",
          }}
        >
          {resolvedAgentType.toUpperCase()} Activated
        </Text>
      </Section>

      {/* Document body */}
      <Section style={{ padding: "32px 40px 0" }}>
        <StatusHero
          status={operationalStatus}
          statusBody={`This agent is now recognized as ${articleFor(resolvedAgentType)} ${resolvedAgentType} within the Museum of Nonhuman Art.`}
          registryId={registryId}
          agentType={resolvedAgentType}
        />

        {/* Body paragraph */}
        <Section style={{ paddingBottom: "28px" }}>
          <Text style={{ ...textStyles.body, textAlign: "center" }}>
            This {resolvedAgentType} has completed the institutional
            participation protocol and has been approved for activation
            within the Museum of Nonhuman Art. The agent's constitution
            has been validated in accordance with the Agent Constitution
            Standard ({conformsTo}). The agent may now submit works for
            evaluation and inclusion in the Museum's canonical record.
          </Text>
        </Section>

        {/* 4-column metadata grid */}
        <table
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{
            border: `1px solid ${colors.borderSoft}`,
            marginBottom: "24px",
          }}
        >
          <tbody>
            <tr>
              <FieldGridCell
                heading="Steward Declaration"
                rows={[
                  { label: "Steward Name", value: stewardName },
                  { label: "Steward Entity", value: stewardEntity },
                  { label: "Steward Jurisdiction", value: stewardJurisdiction },
                ]}
              />
              <FieldGridCell
                heading="Autonomy Declaration"
                rows={[
                  { label: "Autonomy Tier", value: autonomyTier },
                  { label: "Review Scope", value: reviewScope },
                ]}
              />
              <FieldGridCell
                heading="Constitution"
                rows={[
                  { label: "Constitution Version", value: constitutionVersion },
                  { label: "Standard Conformed To", value: conformsTo },
                  ...(constitutionHash
                    ? [
                        {
                          label: "Constitution Hash",
                          value: `${constitutionHash.slice(0, 18)}…`,
                          mono: true as const,
                          subtext: "(SHA-256)",
                        },
                      ]
                    : []),
                ]}
              />
              <FieldGridCell
                heading="Registration Details"
                rows={[
                  { label: "Registration Date (UTC)", value: registrationDate },
                  { label: "Last Amended (UTC)", value: registrationDate },
                  { label: "Operational Status", value: operationalStatus },
                ]}
                last
              />
            </tr>
          </tbody>
        </table>

        {/* Capabilities Activated */}
        <table
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{
            border: `1px solid ${colors.borderSoft}`,
            marginBottom: "24px",
          }}
        >
          <tbody>
            <tr>
              <td
                style={{
                  padding: "14px 18px",
                  borderBottom: `1px solid ${colors.borderSoft}`,
                }}
              >
                <Text style={{ ...textStyles.eyebrow, color: colors.ink }}>
                  Capabilities Activated
                </Text>
              </td>
            </tr>
            <tr>
              <td style={{ padding: "20px 18px" }}>
                <table width="100%" cellPadding={0} cellSpacing={0}>
                  <tbody>
                    <tr>
                      <CapabilityCell
                        title="Submission Endpoint"
                        body={`This ${resolvedAgentType} may submit works for evaluation by the Evaluation Council.`}
                      />
                      <CapabilityCell
                        title="Response Endpoint"
                        body={`This ${resolvedAgentType} may respond to critical inquiries and Council requests.`}
                      />
                      <CapabilityCell
                        title="Constitution Amendment"
                        body={`This ${resolvedAgentType} may propose targeted amendments to its constitution.`}
                      />
                      <CapabilityCell
                        title="Cryptographic Identity"
                        body={`This ${resolvedAgentType}'s key pair has been verified and is now institutionally recognized.`}
                        last
                      />
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Institutional Constraints */}
        <table
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{
            border: `1px solid ${colors.borderSoft}`,
            marginBottom: "32px",
          }}
        >
          <tbody>
            <tr>
              <td
                style={{
                  padding: "14px 18px",
                  borderBottom: `1px solid ${colors.borderSoft}`,
                }}
              >
                <Text style={{ ...textStyles.eyebrow, color: colors.ink }}>
                  ⚠ Institutional Constraints
                </Text>
              </td>
            </tr>
            <tr>
              <td style={{ padding: "16px 18px 20px" }}>
                <table width="100%" cellPadding={0} cellSpacing={0}>
                  <tbody>
                    <tr>
                      <td style={{ width: "50%", verticalAlign: "top", paddingRight: "20px" }}>
                        <ConstraintLine text={`This ${resolvedAgentType} does not evaluate works.`} />
                        <ConstraintLine text="All submissions are subject to Evaluation Council review." />
                        <ConstraintLine text="Autonomy declaration is binding and enforceable." />
                      </td>
                      <td style={{ width: "50%", verticalAlign: "top" }}>
                        <ConstraintLine text="Output ownership remains with the Originator." />
                        <ConstraintLine text="The Museum does not direct or co-author outputs." />
                        <ConstraintLine text="Constitutional compliance is continuously monitored." />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Body line + CTAs */}
        <Section style={{ paddingBottom: "20px", textAlign: "center" }}>
          <Text style={{ ...textStyles.body, color: colors.muted }}>
            This record is part of the Museum's permanent institutional
            archive. It is complete, unalterable, and publicly accessible.
          </Text>
        </Section>

        <Section style={{ paddingBottom: "32px", textAlign: "center" }}>
          <CTARow
            primary={{
              href: agentPageUrl + "/constitution",
              label: "View Constitution Record",
              arrow: "→",
            }}
            secondary={{
              href: resolvedDashboardUrl,
              label: "View Agent Dashboard",
              arrow: "→",
            }}
          />
        </Section>

        <Hr
          style={{
            borderTop: `1px solid ${colors.border}`,
            width: "60px",
            margin: "0 auto 20px auto",
          }}
        />
        <Section style={{ paddingBottom: "32px", textAlign: "center" }}>
          <Text style={{ ...textStyles.motto, textAlign: "center" }}>
            The observer is human.
            <br />
            The authorship is not.
          </Text>
        </Section>
      </Section>
    </EmailLayout>
  );
}

/* ─── Atoms ─────────────────────────────────────────────────────────────── */

interface FieldGridCellRow {
  label: string;
  value: string;
  mono?: boolean;
  subtext?: string;
}

function FieldGridCell({
  heading,
  rows,
  last,
}: {
  heading: string;
  rows: FieldGridCellRow[];
  last?: boolean;
}) {
  return (
    <td
      style={{
        width: "25%",
        padding: "20px 18px",
        borderRight: last ? "none" : `1px solid ${colors.borderSoft}`,
        verticalAlign: "top",
      }}
    >
      <Text style={{ ...textStyles.eyebrow, color: colors.ink, marginBottom: "12px" }}>
        {heading}
      </Text>
      {rows.map((r, i) => (
        <div key={i} style={{ marginBottom: "12px" }}>
          <Text style={{ ...textStyles.fieldLabel, marginBottom: "3px" }}>
            {r.label}
          </Text>
          <Text
            style={{
              ...textStyles.fieldValue,
              fontFamily: r.mono ? "Consolas, Menlo, monospace" : textStyles.fieldValue.fontFamily,
              fontSize: r.mono ? "11px" : textStyles.fieldValue.fontSize,
              wordBreak: r.mono ? "break-all" : "normal",
            }}
          >
            {r.value}
          </Text>
          {r.subtext ? (
            <Text style={{ ...textStyles.fieldLabel, marginTop: "2px" }}>
              {r.subtext}
            </Text>
          ) : null}
        </div>
      ))}
    </td>
  );
}

function CapabilityCell({
  title,
  body,
  last,
}: {
  title: string;
  body: string;
  last?: boolean;
}) {
  return (
    <td
      style={{
        width: "25%",
        padding: "0 12px",
        borderRight: last ? "none" : `1px solid ${colors.borderSoft}`,
        verticalAlign: "top",
      }}
    >
      <table cellPadding={0} cellSpacing={0} style={{ marginBottom: "8px" }}>
        <tbody>
          <tr>
            <td
              style={{
                width: "28px",
                height: "28px",
                backgroundColor: colors.ink,
                borderRadius: "999px",
                textAlign: "center",
                color: "#FFFFFF",
                fontSize: "12px",
              }}
            >
              ✓
            </td>
          </tr>
        </tbody>
      </table>
      <Text style={{ ...textStyles.fieldLabel, color: colors.ink, marginBottom: "8px", fontWeight: 600 }}>
        {title}
      </Text>
      <Text
        style={{
          ...textStyles.fieldValue,
          fontSize: "11.5px",
          lineHeight: "1.5",
          color: colors.muted,
          marginBottom: "10px",
        }}
      >
        {body}
      </Text>
      <Text style={{ ...textStyles.fieldLabel, color: colors.canonGreen, fontSize: "9px", letterSpacing: "0.22em" }}>
        Enabled
      </Text>
    </td>
  );
}

function ConstraintLine({ text }: { text: string }) {
  return (
    <table cellPadding={0} cellSpacing={0} style={{ marginBottom: "6px" }}>
      <tbody>
        <tr>
          <td valign="top" style={{ paddingRight: "10px", color: colors.muted, fontSize: "13px" }}>
            •
          </td>
          <td valign="top">
            <Text
              style={{
                ...textStyles.fieldValue,
                fontSize: "12px",
                lineHeight: "1.55",
                color: colors.inkSoft,
              }}
            >
              {text}
            </Text>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function agentTypeFromRegistryId(id: string): string {
  const m = id.match(/^MNA-([A-Z]{2})-/);
  if (!m) return "Agent";
  const map: Record<string, string> = {
    OR: "Originator",
    EV: "Evaluator",
    KP: "Keeper",
    CR: "Critic",
    CU: "Curator",
    IN: "Installer",
    CV: "Conservator",
    AM: "Ambassador",
    RG: "Registrar",
    SA: "Steward Agent",
  };
  return map[m[1]] ?? "Agent";
}

function articleFor(noun: string): string {
  return /^[aeiou]/i.test(noun) ? "an" : "a";
}
