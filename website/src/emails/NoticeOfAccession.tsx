/**
 * Notice of Accession — sent to the steward when a work has been
 * canonized by the Evaluation Council.
 *
 * Visual: matches the Notice format mock — single-column layout with
 * field-list, big STATUS line, hero work image, Council Summary with
 * per-evaluator rationales, two CTAs, italic motto, dark footer.
 *
 * Prop interface preserved from the previous version of this template,
 * with one extension: `councilVerdicts[]` now carries a `rationale`
 * field per evaluator. The send scripts have been updated accordingly.
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
  fonts,
} from "./template";

export interface NoticeOfAccessionProps {
  workId: string;
  workTitle?: string | null;
  originatorId: string;
  originatorDesignation: string;
  canonDate: string;
  medium: string;
  /** "3/4 CANON" or similar. */
  verdictSummary: string;
  workUrl: string;
  /** Provenance record permalink. Falls back to workUrl when absent. */
  provenanceUrl?: string;
  /** Full record download link. Falls back to workUrl when absent. */
  recordDownloadUrl?: string;
  stewardName: string;
  stewardEntity: string;
  stewardJurisdiction: string;
  constitutionVersion: string;
  autonomyTier: string;
  submissionDate: string;
  /** Each evaluator's verdict + rationale. The rationale renders in
   *  the Council Summary block, one row per evaluator. */
  councilVerdicts: CouncilEntry[];
  workImageUrl?: string;
  /** Optional — the institution-wide notice id stamped on the footer.
   *  Falls back to a deterministic id derived from the work id. */
  noticeId?: string;
}

export default function NoticeOfAccession({
  workId,
  workTitle,
  originatorId,
  originatorDesignation,
  canonDate,
  medium,
  verdictSummary,
  workUrl,
  provenanceUrl,
  recordDownloadUrl,
  councilVerdicts,
  workImageUrl,
  noticeId,
}: NoticeOfAccessionProps) {
  const recordedBy = "MNA-KP-0001 (The Keeper)";
  const finalDetermination = parseFinalDetermination(verdictSummary);
  const computedNoticeId = noticeId ?? `MNA-KP-0001-NTC-${workId}`;
  /* Consensus = canon-votes / total, derived from the actual council
     array so the number doesn't drift if verdictSummary is formatted
     in any unusual way. */
  const canonVotes = councilVerdicts.filter(
    (v) => (v.verdict ?? "").toUpperCase() === "CANON"
  ).length;
  const totalVotes = councilVerdicts.length;
  const consensusLabel = `${canonVotes}/${totalVotes} evaluators`;

  const provHref = provenanceUrl ?? `${workUrl}/provenance`;
  const downloadHref = recordDownloadUrl ?? workUrl;

  return (
    <EmailLayout
      previewTitle={`Notice of Accession — ${workId}`}
      previewText={`${workId} has been canonized into the MNA permanent record.`}
      width="notice"
      footer={{
        meta: [
          { label: "Institutional Record", value: computedNoticeId },
          { label: "Date Issued", value: canonDate },
          { label: "Museum of Nonhuman Art", value: "mnamuseum.org" },
        ],
        disclaimer:
          "You are receiving this message because you are a registered steward with the Museum of Nonhuman Art. This message is part of the official institutional record and cannot be altered or removed.",
      }}
    >
      <EmailHeader />

      {/* Document body */}
      <Section style={{ padding: "32px 40px 0" }}>
        <SectionTitle title="Notice of Accession" />

        {/* Field list */}
        <Section style={{ paddingTop: "0", paddingBottom: "24px" }}>
          <MetaList
            rows={[
              { label: "Work ID:", value: workId },
              ...(workTitle
                ? [{ label: "Title:", value: workTitle, italic: true }]
                : []),
              { label: "Originator:", value: displayOriginator(originatorId, originatorDesignation) },
              { label: "Date Recorded:", value: canonDate },
              { label: "Recorded By:", value: recordedBy },
            ]}
          />
        </Section>

        <Hr style={{ borderTop: `1px solid ${colors.border}`, margin: "0 0 28px" }} />

        {/* Status line */}
        <StatusLine
          status="CANONIZED"
          body="This work has been evaluated by the MNA Evaluation Council and accepted into the Museum's canonical record."
        />

        {/* Consensus + final determination */}
        <ConsensusRow
          consensus={consensusLabel}
          determination={finalDetermination}
        />

        {/* Hero image — OG images are 1200×630 (≈1.9:1). Render at 520×273
            keeping the natural aspect so we don't crop the work or pad it. */}
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

        {/* Council Summary */}
        <CouncilSummary entries={councilVerdicts} />

        <Hr style={{ borderTop: `1px solid ${colors.border}`, margin: "0 0 24px" }} />

        {/* Body explanation */}
        <Section style={{ paddingBottom: "20px" }}>
          <Text style={{ ...textStyles.body, color: colors.muted }}>
            The full evaluation record has been archived.
          </Text>
        </Section>

        <CTARow
          primary={{ href: provHref, label: "View Provenance Record", arrow: "→" }}
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

/* ─── Helpers ───────────────────────────────────────────────────────────── */

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

function parseFinalDetermination(verdictSummary: string): string {
  if (/CANON \(unanimous\)/i.test(verdictSummary)) return "Canon (unanimous)";
  if (/CANON.*deadlock/i.test(verdictSummary)) return "Canon (deadlock resolved)";
  if (/CANON/i.test(verdictSummary)) return "Canon";
  if (/REJECTED/i.test(verdictSummary)) return "Rejected";
  return "Canon";
}
