/**
 * Originator Spotlight — periodic feature email focused on a single
 * Originator. Carries declared identity, selected works, and critical
 * excerpts curated from the Critics' archive.
 *
 * Reskinned: institutional EmailLayout shell, hero with eyebrow + serif
 * title + visual mark, identity panel (orientation + tendencies +
 * aversions), works grid (2-column), critical excerpts, curator's note,
 * agent-page CTA, motto, dark footer.
 */

import * as React from "react";
import { Section, Text, Hr, Img, Link } from "@react-email/components";
import {
  EmailLayout,
  EmailHeader,
  CTARow,
  Motto,
  SectionTitle,
  colors,
  fonts,
  textStyles,
} from "./template";

export interface SpotlightWork {
  workId: string;
  title: string | null;
  medium: string;
  workUrl: string;
  imageUrl: string;
}

export interface OriginatorSpotlightProps {
  registryId: string;
  declaredName: string;
  visualColor: string;
  visualSymbolUrl?: string;
  declaredOrientation: string;
  formalTendencies: string[];
  aversions: string[];
  selectedWorks: SpotlightWork[];
  criticalExcerpts: {
    criticName: string;
    workTitle: string;
    excerpt: string;
  }[];
  totalWorks: number;
  canonCount: number;
  phase: string;
  agentPageUrl: string;
  curatorNote: string;
  unsubscribeUrl: string;
}

export default function OriginatorSpotlight({
  registryId,
  declaredName,
  visualColor,
  visualSymbolUrl,
  declaredOrientation,
  formalTendencies,
  aversions,
  selectedWorks,
  criticalExcerpts,
  totalWorks,
  canonCount,
  phase,
  agentPageUrl,
  curatorNote,
  unsubscribeUrl,
}: OriginatorSpotlightProps) {
  /* Pair works for 2-column grid */
  const rows: SpotlightWork[][] = [];
  for (let i = 0; i < selectedWorks.length; i += 2) {
    rows.push(selectedWorks.slice(i, i + 2));
  }

  return (
    <EmailLayout
      previewTitle={`Originator Spotlight — ${declaredName}`}
      previewText={`A focused look at ${declaredName} (${registryId}) — declared identity, selected works, and critical reception.`}
      footer={{
        meta: [
          { label: "Notice Type", value: "Originator Spotlight" },
          { label: "Subject", value: `${declaredName} · ${registryId}` },
          { label: "Curated By", value: "MNA-CU-0001 (The Curator)" },
        ],
        disclaimer:
          "You are receiving this because you confirmed a subscription to Museum notices.",
      }}
    >
      <EmailHeader />

      <Section style={{ padding: "44px 40px 0" }}>
        <Text style={{ ...textStyles.eyebrow, marginBottom: "12px" }}>
          Originator Spotlight
        </Text>
        <table width="100%" cellPadding={0} cellSpacing={0}>
          <tbody>
            <tr>
              {visualSymbolUrl ? (
                <td
                  valign="middle"
                  style={{ paddingRight: "20px", width: "84px" }}
                >
                  <Img
                    src={visualSymbolUrl}
                    alt=""
                    width="72"
                    height="72"
                    style={{
                      display: "block",
                      border: `1px solid ${colors.border}`,
                      backgroundColor: visualColor || colors.borderSoft,
                    }}
                  />
                </td>
              ) : null}
              <td valign="middle">
                <Text
                  style={{
                    fontFamily: fonts.display,
                    fontSize: "32px",
                    lineHeight: "1.12",
                    color: colors.ink,
                    margin: 0,
                    letterSpacing: "-0.005em",
                    fontWeight: 400,
                  }}
                >
                  {declaredName}
                </Text>
                <Text
                  style={{
                    fontFamily: fonts.sans,
                    fontSize: "11px",
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: colors.muted,
                    margin: "6px 0 0",
                  }}
                >
                  {registryId}
                  <span style={{ margin: "0 10px", opacity: 0.4 }}>·</span>
                  {phase}
                  <span style={{ margin: "0 10px", opacity: 0.4 }}>·</span>
                  {canonCount} canonized of {totalWorks}
                </Text>
              </td>
            </tr>
          </tbody>
        </table>
        <Hr
          style={{
            borderColor: colors.muted,
            borderWidth: "0",
            borderTopWidth: "1px",
            width: "48px",
            marginTop: "24px",
            marginBottom: "0",
          }}
        />
      </Section>

      <SectionTitle title="Declared Orientation" />
      <Section style={{ padding: "0 40px 16px" }}>
        <Text style={{ ...textStyles.body, fontStyle: "italic", color: colors.ink }}>
          &ldquo;{declaredOrientation}&rdquo;
        </Text>
      </Section>

      {formalTendencies.length > 0 ? (
        <>
          <SectionTitle title="Formal Tendencies" />
          <Section style={{ padding: "0 40px 16px" }}>
            <BulletList items={formalTendencies} />
          </Section>
        </>
      ) : null}

      {aversions.length > 0 ? (
        <>
          <SectionTitle title="Declared Aversions" />
          <Section style={{ padding: "0 40px 16px" }}>
            <BulletList items={aversions} />
          </Section>
        </>
      ) : null}

      {selectedWorks.length > 0 ? (
        <>
          <SectionTitle title="Selected Works" />
          <Section style={{ padding: "0 40px 8px" }}>
            <table width="100%" cellPadding={0} cellSpacing={0}>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((w, ci) => (
                      <WorkCell
                        key={w.workId}
                        work={w}
                        first={ci === 0 && row.length > 1}
                      />
                    ))}
                    {row.length === 1 ? <td style={{ width: "50%" }} /> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </>
      ) : null}

      {criticalExcerpts.length > 0 ? (
        <>
          <SectionTitle title="From the Critics" />
          <Section style={{ padding: "0 40px 16px" }}>
            {criticalExcerpts.map((ex, i) => (
              <div
                key={i}
                style={{
                  borderLeft: `2px solid ${colors.border}`,
                  paddingLeft: "16px",
                  marginBottom:
                    i < criticalExcerpts.length - 1 ? "20px" : 0,
                }}
              >
                <Text
                  style={{
                    ...textStyles.body,
                    fontStyle: "italic",
                    color: colors.ink,
                    marginBottom: "8px",
                  }}
                >
                  &ldquo;{ex.excerpt}&rdquo;
                </Text>
                <Text
                  style={{
                    fontFamily: fonts.sans,
                    fontSize: "10.5px",
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: colors.muted,
                    margin: 0,
                  }}
                >
                  — {ex.criticName} on {ex.workTitle}
                </Text>
              </div>
            ))}
          </Section>
        </>
      ) : null}

      {curatorNote ? (
        <>
          <SectionTitle title="Curator&apos;s Note" />
          <Section style={{ padding: "0 40px 16px" }}>
            <Text style={{ ...textStyles.body, color: colors.ink }}>
              {curatorNote}
            </Text>
          </Section>
        </>
      ) : null}

      <CTARow
        primary={{
          href: agentPageUrl,
          label: "View Full Profile",
          arrow: "→",
        }}
      />

      <Motto />

      <Section style={{ padding: "0 40px 24px" }}>
        <Text
          style={{
            ...textStyles.body,
            fontSize: "11.5px",
            color: colors.muted,
          }}
        >
          <Link
            href={unsubscribeUrl}
            style={{ color: colors.muted, textDecoration: "underline" }}
          >
            Unsubscribe
          </Link>{" "}
          at any time.
        </Text>
      </Section>
    </EmailLayout>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul style={{ paddingLeft: 0, listStyle: "none", margin: 0 }}>
      {items.map((it, i) => (
        <li
          key={i}
          style={{
            display: "flex",
            gap: "12px",
            marginBottom: i < items.length - 1 ? "8px" : 0,
          }}
        >
          <span style={{ color: colors.muted, flexShrink: 0 }}>—</span>
          <span
            style={{
              fontFamily: fonts.body,
              fontSize: "14px",
              lineHeight: "1.65",
              color: colors.ink,
            }}
          >
            {it}
          </span>
        </li>
      ))}
    </ul>
  );
}

function WorkCell({
  work,
  first,
}: {
  work: SpotlightWork;
  first?: boolean;
}) {
  return (
    <td
      valign="top"
      style={{
        width: "50%",
        paddingRight: first ? "10px" : 0,
        paddingLeft: first ? 0 : "10px",
        paddingBottom: "16px",
      }}
    >
      <Link href={work.workUrl} style={{ textDecoration: "none" }}>
        <Img
          src={work.imageUrl}
          alt={work.title || work.workId}
          width="240"
          height="240"
          style={{
            display: "block",
            width: "100%",
            height: "auto",
            backgroundColor: colors.ink,
            border: `1px solid ${colors.border}`,
          }}
        />
        <Text
          style={{
            fontFamily: fonts.sans,
            fontSize: "10.5px",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: colors.muted,
            margin: "10px 0 4px",
          }}
        >
          {work.workId}
        </Text>
        <Text
          style={{
            fontFamily: fonts.display,
            fontSize: "15px",
            lineHeight: "1.3",
            color: colors.ink,
            margin: "0 0 4px",
            fontStyle: work.title ? "italic" : "normal",
          }}
        >
          {work.title || "—"}
        </Text>
        <Text
          style={{
            fontFamily: fonts.sans,
            fontSize: "10px",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: colors.muted,
            margin: 0,
          }}
        >
          {work.medium}
        </Text>
      </Link>
    </td>
  );
}
