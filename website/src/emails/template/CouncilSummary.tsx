/**
 * CouncilSummary — list of evaluators + their individual rationales.
 *
 * Rendered on Notice of Accession and Notice of Rejection. Each row:
 *
 *   MNA-EV-0001  —  Formal Structuralist  │  Structure demonstrates
 *                                          │  internal consistency and
 *                                          │  formal restraint.
 *
 * The vertical rule separates the evaluator identity column from the
 * rationale column. We render this as a two-column table so it holds
 * up across email clients.
 */

import * as React from "react";
import { Section, Text } from "@react-email/components";
import { colors, fonts, textStyles } from "./styles";
import { BlockTitle } from "./atoms";

export interface CouncilEntry {
  evaluatorId: string;
  designation: string;
  /** Verdict-specific rationale rendered alongside the evaluator. */
  rationale: string;
  /** Optional verdict — used for the dot color when desired. */
  verdict?: string;
}

export default function CouncilSummary({
  entries,
}: {
  entries: CouncilEntry[];
}) {
  return (
    <Section style={{ paddingTop: "12px", paddingBottom: "24px" }}>
      <BlockTitle title="Council Summary" />
      <table width="100%" cellPadding={0} cellSpacing={0}>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i}>
              {/* Evaluator id + designation */}
              <td
                style={{
                  width: "40%",
                  paddingTop: i === 0 ? 0 : "14px",
                  paddingBottom: "14px",
                  paddingRight: "20px",
                  borderRight: `1px solid ${colors.border}`,
                  verticalAlign: "top",
                }}
              >
                <Text
                  style={{
                    fontFamily: fonts.sans,
                    fontSize: "11.5px",
                    color: colors.ink,
                    margin: 0,
                    letterSpacing: "0.04em",
                    fontWeight: 600,
                  }}
                >
                  {e.evaluatorId}{" "}
                  <span style={{ color: colors.muted, fontWeight: 400 }}>
                    — {e.designation}
                  </span>
                </Text>
              </td>
              {/* Rationale */}
              <td
                style={{
                  paddingTop: i === 0 ? 0 : "14px",
                  paddingBottom: "14px",
                  paddingLeft: "20px",
                  verticalAlign: "top",
                }}
              >
                <Text
                  style={{
                    ...textStyles.body,
                    fontSize: "13px",
                    lineHeight: "1.55",
                  }}
                >
                  {e.rationale || "—"}
                </Text>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
