/**
 * EmailFooter — dark band at the bottom of every institutional email.
 *
 * Two layouts:
 *   - notice variant (default): logo+wordmark on left, meta cells
 *     across the rest. Used by Accession, Rejection, Registration.
 *   - bulletin variant: 3 equal columns — logo+wordmark | centered
 *     motto ("THE OBSERVER IS HUMAN. / THE AUTHORSHIP IS NOT.") |
 *     domain + entity + location stacked. Used by the Institutional
 *     Bulletin per mock #115.
 */

import * as React from "react";
import { Section, Text, Img } from "@react-email/components";
import { colors, fonts } from "./styles";

export interface EmailFooterProps {
  /** Per-email metadata cells (notice variant). Ignored when
   *  `bulletin` is set. */
  meta?: { label: string; value: string }[];
  /** Bulletin variant — when set, render the 3-column footer with the
   *  motto centered and a stack of right-column lines. */
  bulletin?: {
    mottoLine1: string;
    mottoLine2: string;
    rightLines: string[];
  };
  /** Disclaimer text rendered below the footer band. */
  disclaimer?: string;
  /** Set by EmailLayout based on container width. */
  width?: "notice" | "document";
}

export default function EmailFooter({
  meta = [],
  bulletin,
  disclaimer,
  width = "notice",
}: EmailFooterProps) {
  const containerWidth = width === "document" ? "720px" : "600px";

  return (
    <>
      <Section style={{ backgroundColor: colors.ink, color: "#FFFFFF" }}>
        <table
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{ maxWidth: containerWidth, margin: "0 auto" }}
        >
          <tbody>
            <tr>
              <td style={{ padding: "26px 36px" }}>
                {bulletin ? (
                  <BulletinFooter {...bulletin} />
                ) : (
                  <NoticeFooter meta={meta} />
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      {disclaimer ? (
        <Section
          style={{
            backgroundColor: "#0F0F0F",
            padding: "14px 32px 18px",
          }}
        >
          <table
            width="100%"
            cellPadding={0}
            cellSpacing={0}
            style={{ maxWidth: containerWidth, margin: "0 auto" }}
          >
            <tbody>
              <tr>
                <td>
                  <Text
                    style={{
                      fontFamily: fonts.body,
                      fontSize: "11px",
                      lineHeight: "1.6",
                      color: "rgba(255,255,255,0.55)",
                      margin: 0,
                      textAlign: "center",
                    }}
                  >
                    {disclaimer}
                  </Text>
                </td>
              </tr>
            </tbody>
          </table>
        </Section>
      ) : null}
    </>
  );
}

/* ─── Notice footer (logo + meta cells) ─────────────────────────────────── */

function NoticeFooter({
  meta,
}: {
  meta: { label: string; value: string }[];
}) {
  return (
    <table width="100%" cellPadding={0} cellSpacing={0}>
      <tbody>
        <tr>
          <td valign="middle" style={{ paddingRight: "24px", width: "28%" }}>
            <LogoBlock />
          </td>
          {meta.map((m, i) => (
            <td
              key={i}
              valign="middle"
              style={{
                paddingRight: i < meta.length - 1 ? "20px" : 0,
              }}
            >
              <Text style={metaLabelStyle}>{m.label}</Text>
              {m.value ? <Text style={metaValueStyle}>{m.value}</Text> : null}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

/* ─── Bulletin footer (logo | motto | right column) ─────────────────────── */

function BulletinFooter({
  mottoLine1,
  mottoLine2,
  rightLines,
}: {
  mottoLine1: string;
  mottoLine2: string;
  rightLines: string[];
}) {
  return (
    <table width="100%" cellPadding={0} cellSpacing={0}>
      <tbody>
        <tr>
          {/* Logo + wordmark */}
          <td valign="middle" style={{ width: "33%", paddingRight: "16px" }}>
            <LogoBlock />
          </td>
          {/* Centered motto */}
          <td valign="middle" style={{ width: "34%", textAlign: "center" }}>
            <Text
              style={{
                fontFamily: fonts.sans,
                fontSize: "10px",
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: "#FFFFFF",
                margin: 0,
                lineHeight: "1.7",
              }}
            >
              {mottoLine1}
              <br />
              {mottoLine2}
            </Text>
          </td>
          {/* Right column */}
          <td valign="middle" style={{ width: "33%", textAlign: "right", paddingLeft: "16px" }}>
            {rightLines.map((line, i) => (
              <Text
                key={i}
                style={{
                  fontFamily: fonts.sans,
                  fontSize: i === 0 ? "12px" : "11px",
                  color: i === 0 ? "#FFFFFF" : "rgba(255,255,255,0.7)",
                  margin: i === 0 ? 0 : "3px 0 0 0",
                  textAlign: "right",
                }}
              >
                {line}
              </Text>
            ))}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/* ─── Shared logo+wordmark block ────────────────────────────────────────── */

function LogoBlock() {
  return (
    <table cellPadding={0} cellSpacing={0}>
      <tbody>
        <tr>
          <td valign="middle" style={{ paddingRight: "12px" }}>
            <Img
              src="https://mnamuseum.org/mna-icon-email.png"
              alt=""
              width="36"
              height="36"
              style={{ display: "block" }}
            />
          </td>
          <td valign="middle">
            <Text
              style={{
                fontFamily: fonts.display,
                fontSize: "12px",
                lineHeight: "1.18",
                color: "#FFFFFF",
                margin: 0,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              Museum of
              <br />
              Nonhuman Art
            </Text>
            <Text
              style={{
                fontFamily: fonts.sans,
                fontSize: "8px",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.55)",
                margin: "4px 0 0 0",
                fontWeight: 500,
              }}
            >
              A Digital Institution
            </Text>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

const metaLabelStyle = {
  fontFamily: fonts.sans,
  fontSize: "8.5px",
  letterSpacing: "0.22em",
  textTransform: "uppercase" as const,
  color: "rgba(255,255,255,0.55)",
  margin: 0,
  fontWeight: 500,
};

const metaValueStyle = {
  fontFamily: fonts.sans,
  fontSize: "11px",
  color: "#FFFFFF",
  margin: "4px 0 0 0",
};
