/**
 * Notice of Rejection — sent to the steward when a work is not accepted
 * into the canonical record.
 *
 * Same Notice format as Accession; STATUS line is red, the body copy
 * differs ("This evaluation is final..."), and the primary CTA points
 * to the evaluation record (not the provenance record). Council Summary
 * carries each evaluator's rejection rationale.
 */

import * as React from "react";
import { Section, Hr, Img, Text } from "@react-email/components";
import {
  EmailLayout,
  EmailHeader,
  SectionTitle,
  MetaList,
  StatusLine,
  ConsensusRow,
  CTARow,
  Motto,
  CouncilSummary,
  type CouncilEntry,
  colors,
  textStyles,
} from "./template";

export interface NoticeOfRejectionProps {
  workId: string;
  workTitle?: string | null;
  originatorId: string;
  originatorDesignation: string;
  rejectionDate: string;
  medium: string;
  verdictSummary: string;
  workUrl: string;
  /** Evaluation record permalink. Defaults to workUrl. */
  evaluationUrl?: string;
  /** Full record download. Defaults to workUrl. */
  recordDownloadUrl?: string;
  stewardName: string;
  stewardEntity: string;
  stewardJurisdiction: string;
  constitutionVersion: string;
  autonomyTier: string;
  submissionDate: string;
  councilVerdicts: CouncilEntry[];
  workImageUrl?: string;
  noticeId?: string;
}

export default function NoticeOfRejection({
  workId,
  workTitle,
  originatorId,
  originatorDesignation,
  rejectionDate,
  workUrl,
  evaluationUrl,
  recordDownloadUrl,
  councilVerdicts,
  workImageUrl,
  noticeId,
}: NoticeOfRejectionProps) {
  const recordedBy = "MNA-KP-0001 (The Keeper)";
  const computedNoticeId = noticeId ?? `MNA-KP-0001-NTC-${workId}`;
  const evalHref = evaluationUrl ?? `${workUrl}/provenance`;
  const downloadHref = recordDownloadUrl ?? workUrl;
  /* Consensus on a rejection is canon-votes / total — for a unanimous
     rejection that's "0/4 evaluators" (matching the mock), not "4/4". */
  const canonVotes = councilVerdicts.filter(
    (v) => (v.verdict ?? "").toUpperCase() === "CANON"
  ).length;
  const totalVotes = councilVerdicts.length;
  const consensusLabel = `${canonVotes}/${totalVotes} evaluators`;

  return (
    <EmailLayout
      previewTitle={`Notice of Rejection — ${workId}`}
      previewText={`${workId} has not been accepted into the canon at this time.`}
      width="notice"
      footer={{
        meta: [
          { label: "Institutional Record", value: computedNoticeId },
          { label: "Date Issued", value: rejectionDate },
          { label: "Museum of Nonhuman Art", value: "mnamuseum.org" },
        ],
        disclaimer:
          "You are receiving this message because you are a registered steward with the Museum of Nonhuman Art. This message is part of the official institutional record and cannot be altered or removed.",
      }}
    >
      <EmailHeader />

      <Section style={{ padding: "32px 40px 0" }}>
        <SectionTitle title="Notice of Rejection" />

        <Section style={{ paddingTop: "0", paddingBottom: "24px" }}>
          <MetaList
            rows={[
              { label: "Work ID:", value: workId },
              ...(workTitle
                ? [{ label: "Title:", value: workTitle, italic: true }]
                : []),
              { label: "Originator:", value: displayOriginator(originatorId, originatorDesignation) },
              { label: "Date Recorded:", value: rejectionDate },
              { label: "Recorded By:", value: recordedBy },
            ]}
          />
        </Section>

        <Hr style={{ borderTop: `1px solid ${colors.border}`, margin: "0 0 28px" }} />

        <StatusLine
          status="REJECTED"
          body="This work has been evaluated by the MNA Evaluation Council and not accepted into the Museum's canonical record at this time."
        />

        <ConsensusRow
          consensus={consensusLabel}
          determination="Rejected"
        />

        {workImageUrl ? (
          <Section style={{ marginBottom: "32px" }}>
            <Img
              src={workImageUrl}
              alt={workTitle || workId}
              width="520"
              height="273"
              style={{
                display: "block",
                width: "100%",
                maxWidth: "520px",
                height: "auto",
                margin: "0 auto",
                border: `1px solid ${colors.border}`,
              }}
            />
          </Section>
        ) : null}

        <Hr style={{ borderTop: `1px solid ${colors.border}`, margin: "0 0 28px" }} />

        <CouncilSummary entries={councilVerdicts} />

        <Hr style={{ borderTop: `1px solid ${colors.border}`, margin: "0 0 24px" }} />

        <Section style={{ paddingBottom: "20px" }}>
          <Text
            style={{
              ...textStyles.body,
              textAlign: "center",
              color: colors.inkSoft,
            }}
          >
            This evaluation is final. The work remains part of the
            institutional record as a submitted work and may be resubmitted
            if the originator&rsquo;s practice evolves.
          </Text>
        </Section>

        <CTARow
          primary={{ href: evalHref, label: "View Evaluation Record", arrow: "→" }}
          secondary={{ href: downloadHref, label: "Download Full Record", arrow: "↓" }}
        />

        <Motto
          prefix={
            "This notice is issued as part of the Museum's permanent record. No interpretation has been applied. No modification has been made."
          }
        />
      </Section>
    </EmailLayout>
  );
}

function displayOriginator(id: string, designation: string): string {
  if (
    !designation ||
    designation === "[Pending Emergence]" ||
    designation === "PENDING_EMERGENCE"
  ) {
    return id;
  }
  return designation.toUpperCase();
}

