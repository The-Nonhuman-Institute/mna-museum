/**
 * Reusable email atoms shared across notice templates.
 *
 *   MetaRow         label/value row used in the work-record block
 *   MetaList        full administrative field-list (Work ID / Title / etc.)
 *   StatusLine      "STATUS: CANONIZED" with verdict color
 *   StatusHero      dark two-column hero (Registration template)
 *   CTA             dark filled / outlined button pair
 *   CTARow          two-button row used at the bottom of notices
 *   Motto           italic "observer is human / authorship is not" block
 *   SectionTitle    display serif section title (NOTICE OF ACCESSION)
 *   FieldGrid       generic 4-column grid used by Registration metadata
 */

import * as React from "react";
import { Section, Text, Hr, Link } from "@react-email/components";
import { colors, fonts, textStyles } from "./styles";

/* ─── MetaList ──────────────────────────────────────────────────────────── */

export interface MetaListRow {
  label: string;
  value: string;
  /** When true the value renders in italic — used for work titles. */
  italic?: boolean;
}

export function MetaList({ rows }: { rows: MetaListRow[] }) {
  return (
    <table width="100%" cellPadding={0} cellSpacing={0}>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td
              style={{
                width: "32%",
                paddingTop: i === 0 ? 0 : "8px",
                paddingBottom: "8px",
                verticalAlign: "top",
              }}
            >
              <Text
                style={{
                  ...textStyles.fieldLabel,
                  color: colors.ink,
                  letterSpacing: "0.14em",
                  fontWeight: 600,
                }}
              >
                {r.label}
              </Text>
            </td>
            <td
              style={{
                paddingTop: i === 0 ? 0 : "8px",
                paddingBottom: "8px",
                verticalAlign: "top",
              }}
            >
              <Text
                style={{
                  ...textStyles.fieldValue,
                  fontStyle: r.italic ? "italic" : "normal",
                }}
              >
                {r.value}
              </Text>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─── StatusLine ────────────────────────────────────────────────────────── */

export function StatusLine({
  status,
  body,
}: {
  status: "CANONIZED" | "REJECTED" | "IN REVIEW" | "ACTIVE";
  /** Body paragraph rendered immediately under the status line. */
  body?: string;
}) {
  const color =
    status === "CANONIZED"
      ? colors.canonGreen
      : status === "REJECTED"
        ? colors.rejectRed
        : status === "IN REVIEW"
          ? colors.reviewAmber
          : colors.canonGreen;
  return (
    <Section style={{ paddingTop: "0", paddingBottom: "16px" }}>
      <Text
        style={{
          fontFamily: fonts.display,
          fontSize: "20px",
          color: colors.ink,
          margin: 0,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          fontWeight: 400,
        }}
      >
        Status:{" "}
        <span style={{ color, fontWeight: 600 }}>{status}</span>
      </Text>
      {body ? (
        <Text
          style={{
            ...textStyles.body,
            marginTop: "10px",
          }}
        >
          {body}
        </Text>
      ) : null}
    </Section>
  );
}

/* ─── ConsensusRow ─────────────────────────────────────────────────────── */

export function ConsensusRow({
  consensus,
  determination,
}: {
  consensus: string;
  determination: string;
}) {
  return (
    <Section style={{ paddingBottom: "20px" }}>
      <table cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr>
            <td style={{ paddingRight: "24px", verticalAlign: "baseline" }}>
              <Text style={{ ...textStyles.fieldLabel, fontWeight: 600 }}>
                Consensus:
              </Text>
            </td>
            <td style={{ verticalAlign: "baseline" }}>
              <Text style={textStyles.fieldValue}>{consensus}</Text>
            </td>
          </tr>
          <tr>
            <td style={{ paddingTop: "8px", paddingRight: "24px", verticalAlign: "baseline" }}>
              <Text style={{ ...textStyles.fieldLabel, fontWeight: 600 }}>
                Final Determination:
              </Text>
            </td>
            <td style={{ paddingTop: "8px", verticalAlign: "baseline" }}>
              <Text style={textStyles.fieldValue}>{determination}</Text>
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

/* ─── StatusHero (Registration) ─────────────────────────────────────────── */

export function StatusHero({
  status,
  statusBody,
  registryId,
  agentType,
}: {
  status: string;
  statusBody: string;
  registryId: string;
  agentType: string;
}) {
  return (
    <Section style={{ marginBottom: "32px" }}>
      <table
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        style={{
          backgroundColor: colors.ink,
          color: "#FFFFFF",
        }}
      >
        <tbody>
          <tr>
            <td
              style={{
                width: "50%",
                padding: "36px 28px",
                textAlign: "center",
                borderRight: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              <Text
                style={{
                  fontFamily: fonts.sans,
                  fontSize: "10px",
                  letterSpacing: "0.28em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.7)",
                  margin: 0,
                  fontWeight: 500,
                }}
              >
                Status
              </Text>
              <Text
                style={{
                  fontFamily: fonts.display,
                  fontSize: "36px",
                  color: "#FFFFFF",
                  margin: "10px 0 8px 0",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                {status}
              </Text>
              <Text
                style={{
                  fontFamily: fonts.body,
                  fontSize: "12.5px",
                  lineHeight: "1.5",
                  color: "rgba(255,255,255,0.72)",
                  margin: 0,
                }}
              >
                {statusBody}
              </Text>
            </td>
            <td
              style={{
                width: "50%",
                padding: "36px 28px",
                textAlign: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: fonts.sans,
                  fontSize: "10px",
                  letterSpacing: "0.28em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.7)",
                  margin: 0,
                  fontWeight: 500,
                }}
              >
                Registry ID
              </Text>
              <Text
                style={{
                  fontFamily: fonts.sans,
                  fontSize: "32px",
                  color: "#FFFFFF",
                  margin: "10px 0 8px 0",
                  letterSpacing: "0.06em",
                  fontWeight: 300,
                }}
              >
                {registryId}
              </Text>
              <Text
                style={{
                  fontFamily: fonts.sans,
                  fontSize: "10px",
                  letterSpacing: "0.28em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.7)",
                  margin: 0,
                  fontWeight: 500,
                }}
              >
                Agent Type
              </Text>
              <Text
                style={{
                  fontFamily: fonts.sans,
                  fontSize: "13px",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "#FFFFFF",
                  margin: "6px 0 0 0",
                }}
              >
                {agentType}
              </Text>
            </td>
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

/* ─── CTA buttons ───────────────────────────────────────────────────────── */

export function CTA({
  href,
  label,
  variant = "filled",
  arrow = "→",
}: {
  href: string;
  label: string;
  variant?: "filled" | "outlined";
  arrow?: "→" | "↓";
}) {
  const filled = variant === "filled";
  return (
    <Link
      href={href}
      style={{
        display: "inline-block",
        padding: "14px 24px",
        backgroundColor: filled ? colors.ink : "transparent",
        color: filled ? "#FFFFFF" : colors.ink,
        border: `1px solid ${colors.ink}`,
        textDecoration: "none",
        fontFamily: fonts.sans,
        fontSize: "10px",
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        fontWeight: 600,
      }}
    >
      {label} {arrow}
    </Link>
  );
}

export function CTARow({
  primary,
  secondary,
}: {
  primary: { href: string; label: string; arrow?: "→" | "↓" };
  secondary?: { href: string; label: string; arrow?: "→" | "↓" };
}) {
  return (
    <Section style={{ paddingTop: "8px", paddingBottom: "20px" }}>
      <table cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr>
            <td style={{ paddingRight: "12px" }}>
              <CTA href={primary.href} label={primary.label} arrow={primary.arrow ?? "→"} variant="filled" />
            </td>
            {secondary ? (
              <td>
                <CTA
                  href={secondary.href}
                  label={secondary.label}
                  arrow={secondary.arrow ?? "↓"}
                  variant="outlined"
                />
              </td>
            ) : null}
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

/* ─── Motto ─────────────────────────────────────────────────────────────── */

export function Motto({
  prefix,
}: {
  /** Optional explanatory paragraph rendered above the divider. */
  prefix?: string;
}) {
  return (
    <Section
      style={{
        paddingTop: "16px",
        paddingBottom: "32px",
        textAlign: "center",
      }}
    >
      {prefix ? (
        <Text
          style={{
            ...textStyles.body,
            color: colors.muted,
            textAlign: "center",
            marginBottom: "16px",
          }}
        >
          {prefix}
        </Text>
      ) : null}
      <Hr
        style={{
          borderTop: `1px solid ${colors.border}`,
          width: "60px",
          margin: "0 auto 16px auto",
        }}
      />
      <Text style={{ ...textStyles.motto, textAlign: "center" }}>
        The observer is human.
        <br />
        The authorship is not.
      </Text>
    </Section>
  );
}

/* ─── SectionTitle ──────────────────────────────────────────────────────── */

export function SectionTitle({
  eyebrow,
  title,
}: {
  eyebrow?: string;
  title: string;
}) {
  return (
    <Section style={{ paddingTop: "0", paddingBottom: "16px" }}>
      {eyebrow ? (
        <Text style={{ ...textStyles.eyebrow, marginBottom: "8px" }}>
          {eyebrow}
        </Text>
      ) : null}
      <Text style={textStyles.displayTitle}>{title}</Text>
    </Section>
  );
}

/* ─── BlockTitle (smaller — used for sub-section headings like
       COUNCIL SUMMARY) ──────────────────────────────────────────────────── */

export function BlockTitle({ title }: { title: string }) {
  return (
    <Text
      style={{
        fontFamily: fonts.display,
        fontSize: "20px",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: colors.ink,
        margin: "0 0 16px 0",
        fontWeight: 400,
      }}
    >
      {title}
    </Text>
  );
}
