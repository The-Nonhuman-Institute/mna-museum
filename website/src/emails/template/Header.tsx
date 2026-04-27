/**
 * EmailHeader — top of the paper container.
 *
 * Two layout variants:
 *   - "title-only" (Family A — Notice of Accession / Rejection):
 *     Logo block on the left, MUSEUM OF NONHUMAN ART / A DIGITAL
 *     INSTITUTION on the right. Hairline rule below.
 *
 *   - "meta-grid" (Family B — Registration / Bulletin):
 *     Same logo + wordmark, plus a metadata grid in the right column
 *     (DOCUMENT TYPE / DATE ISSUED / RECORD ID / etc.).
 */

import * as React from "react";
import { Img, Section, Text } from "@react-email/components";
import { colors, fonts, textStyles } from "./styles";

export interface MetaPair {
  label: string;
  value: string;
}

export interface EmailHeaderProps {
  variant?: "title-only" | "meta-grid";
  /** Right-side metadata grid. Required when variant === "meta-grid". */
  meta?: MetaPair[];
}

export default function EmailHeader({
  variant = "title-only",
  meta,
}: EmailHeaderProps) {
  return (
    <Section
      style={{
        padding: "32px 40px 28px",
        borderBottom: `1px solid ${colors.border}`,
      }}
    >
      <table width="100%" cellPadding={0} cellSpacing={0}>
        <tbody>
          <tr>
            {/* Logo + wordmark */}
            <td valign="top" style={{ width: variant === "meta-grid" ? "50%" : "100%" }}>
              <table cellPadding={0} cellSpacing={0}>
                <tbody>
                  <tr>
                    <td valign="middle" style={{ paddingRight: "18px" }}>
                      <Img
                        src="https://mnamuseum.org/mna-icon-email-black.png"
                        alt="Museum of Nonhuman Art"
                        width="64"
                        height="64"
                        style={{ display: "block" }}
                      />
                    </td>
                    <td valign="middle">
                      <Text
                        style={{
                          fontFamily: fonts.display,
                          fontSize: "20px",
                          lineHeight: "1.15",
                          color: colors.ink,
                          margin: 0,
                          letterSpacing: "0.02em",
                          fontWeight: 400,
                          textTransform: "uppercase",
                        }}
                      >
                        Museum of
                        <br />
                        Nonhuman Art
                      </Text>
                      <Text
                        style={{
                          ...textStyles.fieldLabel,
                          marginTop: "6px",
                          letterSpacing: "0.16em",
                        }}
                      >
                        A Digital Institution
                      </Text>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>

            {/* Optional meta-grid (right side) */}
            {variant === "meta-grid" && meta ? (
              <td valign="top" style={{ width: "50%", textAlign: "right" }}>
                <table cellPadding={0} cellSpacing={0} style={{ display: "inline-table" }}>
                  <tbody>
                    {meta.map((pair, i) => (
                      <tr key={i}>
                        <td
                          style={{
                            paddingRight: "16px",
                            paddingBottom: i < meta.length - 1 ? "6px" : 0,
                            verticalAlign: "top",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <Text
                            style={{ ...textStyles.fieldLabel, textAlign: "right" }}
                          >
                            {pair.label}
                          </Text>
                        </td>
                        <td
                          style={{
                            paddingBottom: i < meta.length - 1 ? "6px" : 0,
                            verticalAlign: "top",
                            textAlign: "left",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: fonts.sans,
                              fontSize: "11px",
                              lineHeight: "1.3",
                              color: colors.ink,
                              margin: 0,
                              fontWeight: 500,
                            }}
                          >
                            {pair.value}
                          </Text>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </td>
            ) : null}
          </tr>
        </tbody>
      </table>
    </Section>
  );
}
