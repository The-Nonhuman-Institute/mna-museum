/**
 * EmailFooter — dark band at the bottom of every institutional email.
 *
 * Layout: logo + wordmark on the left, then a row of label/value
 * metadata columns (Institutional Record / Date Issued / domain), and
 * a small disclaimer paragraph below.
 */

import * as React from "react";
import { Section, Text, Img } from "@react-email/components";
import { colors, fonts } from "./styles";

export interface EmailFooterProps {
  /** Per-email metadata columns. e.g.
   *  [{label: "Institutional Record", value: "MNA-KP-0001-NTC-0042"},
   *   {label: "Date Issued", value: "April 24, 2026"},
   *   {label: "Museum of Nonhuman Art", value: "mnamuseum.org"}]
   */
  meta: { label: string; value: string }[];
  /** Disclaimer text shown below the footer band. */
  disclaimer?: string;
  /** Set by EmailLayout based on container width — keeps the footer
   *  aligned with the paper container. */
  width?: "notice" | "document";
}

export default function EmailFooter({
  meta,
  disclaimer,
  width = "notice",
}: EmailFooterProps) {
  const containerWidth = width === "document" ? "720px" : "600px";

  return (
    <>
      {/* Dark footer band */}
      <Section
        style={{
          backgroundColor: colors.ink,
          color: "#FFFFFF",
        }}
      >
        <table
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{
            maxWidth: containerWidth,
            margin: "0 auto",
          }}
        >
          <tbody>
            <tr>
              <td
                style={{
                  padding: "22px 32px",
                }}
              >
                <table width="100%" cellPadding={0} cellSpacing={0}>
                  <tbody>
                    <tr>
                      {/* Logo column */}
                      <td valign="middle" style={{ paddingRight: "20px", width: "26%" }}>
                        <table cellPadding={0} cellSpacing={0}>
                          <tbody>
                            <tr>
                              <td valign="middle" style={{ paddingRight: "10px" }}>
                                <Img
                                  src="https://mnamuseum.org/mna-icon-email.png"
                                  alt=""
                                  width="32"
                                  height="32"
                                  style={{ display: "block" }}
                                />
                              </td>
                              <td valign="middle">
                                <Text
                                  style={{
                                    fontFamily: fonts.display,
                                    fontSize: "11px",
                                    lineHeight: "1.2",
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
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>

                      {/* Meta columns */}
                      {meta.map((m, i) => (
                        <td
                          key={i}
                          valign="middle"
                          style={{
                            paddingRight: i < meta.length - 1 ? "16px" : 0,
                            verticalAlign: "middle",
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: fonts.sans,
                              fontSize: "8.5px",
                              letterSpacing: "0.2em",
                              textTransform: "uppercase",
                              color: "rgba(255,255,255,0.55)",
                              margin: 0,
                              fontWeight: 500,
                            }}
                          >
                            {m.label}
                          </Text>
                          <Text
                            style={{
                              fontFamily: fonts.sans,
                              fontSize: "11px",
                              color: "#FFFFFF",
                              margin: "4px 0 0 0",
                            }}
                          >
                            {m.value}
                          </Text>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      {/* Disclaimer */}
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
