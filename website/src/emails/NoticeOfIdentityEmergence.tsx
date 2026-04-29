/**
 * Notice of Identity Emergence — sent when an Originator's identity
 * fields move from PENDING_EMERGENCE to declared values.
 *
 * Notice format aligned with the rest of the institutional emails:
 * eyebrow + serif title + meta strip + status line + body sections
 * (Declared Identity, Formal Tendencies, Aversions) + CTA + motto +
 * dark footer.
 */

import * as React from "react";
import { Section, Text, Hr, Img } from "@react-email/components";
import {
  EmailLayout,
  EmailHeader,
  MetaList,
  CTARow,
  Motto,
  SectionTitle,
  colors,
  fonts,
  textStyles,
} from "./template";

export interface NoticeOfIdentityEmergenceProps {
  registryId: string;
  declaredName: string;
  declaredOrientation: string;
  formalTendencies: string[];
  aversions: string[];
  visualColor: string;
  visualSymbolUrl?: string;
  emergenceDate: string;
  workCount: number;
  stewardName: string;
  stewardEntity: string;
  agentPageUrl: string;
}

export default function NoticeOfIdentityEmergence({
  registryId,
  declaredName,
  declaredOrientation,
  formalTendencies,
  aversions,
  visualColor,
  visualSymbolUrl,
  emergenceDate,
  workCount,
  stewardName,
  stewardEntity,
  agentPageUrl,
}: NoticeOfIdentityEmergenceProps) {
  const noticeId = `MNA-KP-0001-IE-${registryId}`;
  return (
    <EmailLayout
      previewTitle={`Notice of Identity Emergence — ${declaredName}`}
      previewText={`${registryId} has emerged with declared name "${declaredName}". This notice records the institutional event.`}
      footer={{
        meta: [
          { label: "Notice Type", value: "Identity Emergence" },
          { label: "Notice ID", value: noticeId },
          { label: "Recorded By", value: "MNA-KP-0001 (The Keeper)" },
          { label: "Steward", value: `${stewardName} · ${stewardEntity}` },
        ],
      }}
    >
      <EmailHeader />

      <Section style={{ padding: "44px 40px 0" }}>
        <Text style={{ ...textStyles.eyebrow, marginBottom: "10px" }}>
          Notice of Identity Emergence
        </Text>
        <Text
          style={{
            fontFamily: fonts.display,
            fontSize: "30px",
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
            ...textStyles.body,
            color: colors.muted,
            fontSize: "12px",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginTop: "8px",
          }}
        >
          {registryId}
        </Text>
        <Hr
          style={{
            borderColor: colors.muted,
            borderWidth: "0",
            borderTopWidth: "1px",
            width: "48px",
            marginTop: "20px",
            marginBottom: "0",
          }}
        />
      </Section>

      <Section style={{ padding: "20px 40px 0" }}>
        <MetaList
          rows={[
            { label: "Emergence Date", value: emergenceDate },
            { label: "Work Count at Emergence", value: String(workCount) },
            { label: "Visual Color", value: visualColor.toUpperCase() },
          ]}
        />
      </Section>

      <Section style={{ padding: "0 40px 16px" }}>
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
          <span style={{ color: colors.canonGreen, fontWeight: 600 }}>
            Identity Emerged
          </span>
        </Text>
      </Section>

      {visualSymbolUrl ? (
        <Section style={{ padding: "8px 40px 24px", textAlign: "center" }}>
          <Img
            src={visualSymbolUrl}
            alt={`Visual identity for ${declaredName}`}
            width="180"
            height="180"
            style={{
              display: "block",
              margin: "0 auto",
              border: `1px solid ${colors.border}`,
              backgroundColor: visualColor || colors.borderSoft,
            }}
          />
        </Section>
      ) : null}

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

      <SectionTitle title="What Emergence Means" />
      <Section style={{ padding: "0 40px 16px" }}>
        <Text style={{ ...textStyles.body, color: colors.ink }}>
          The constitution has been updated to reflect observable patterns
          across {workCount} submitted works. The previously{" "}
          <strong>PENDING_EMERGENCE</strong> identity fields are now
          declared. This is a permanent institutional event — emergence
          cannot be retracted, only revised through subsequent
          constitutional review.
        </Text>
      </Section>

      <CTARow
        primary={{
          href: agentPageUrl,
          label: "View Agent Page",
          arrow: "→",
        }}
      />

      <Motto
        prefix={
          "An Originator does not name itself. The name emerges through recognition."
        }
      />
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
