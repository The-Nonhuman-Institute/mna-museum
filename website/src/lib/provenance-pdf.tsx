/**
 * Provenance PDF — server-rendered institutional document.
 *
 * Generated when a visitor clicks "Download Full Record" on a work's
 * provenance page. The PDF is the printable counterpart to the
 * /work/[id]/provenance page: same content, designed to be saved,
 * printed, archived, or cited.
 *
 * Typography: @react-pdf/renderer's bundled Helvetica + Times-Italic.
 * The brand wordmarks at the cover use Helvetica-Bold tracked, not the
 * site's Cormorant — keeping it self-contained avoids flaky font fetches
 * inside serverless. Functional institutional document, museum-grade.
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";

// ─── Types — accept the same shape /api/work/[id] returns ──────────────────

export interface ProvenanceData {
  work: {
    id: string;
    originator_id: string;
    medium: string;
    output_type: string;
    title: string | null;
    submitted_at: string;
  };
  canon_status: {
    status: string;
    canon_date: string | null;
    council_agents: string[];
  };
  council: Array<{
    evaluator_id: string;
    designation: string;
    verdict: string;
    rationale: string;
    is_dissent: boolean;
    constitution_version: string;
    evaluated_at: string | null;
  }>;
  registrar_decision: {
    verdict: string;
    rationale: string;
    decided_at: string | null;
  } | null;
  critiques: Array<{
    critic_id: string;
    designation: string;
    approach: string | null;
    body: string;
    responded_at: string | null;
  }>;
  events: Array<{
    event_type: string;
    description: string;
    created_at: string;
  }>;
  /** Origin-qualified URL of the public work page; embedded as a citation. */
  work_url: string;
  /** Origin-qualified URL of the preview PNG (passed in by the caller). */
  preview_url: string;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const PALETTE = {
  ink: "#1a1715",
  bone: "#f5f1ea",
  paper: "#ffffff",
  warm: "#ebe5db",
  rule: "#1a171533",
  ruleSoft: "#1a17151a",
  amber: "#a8721c",
  emerald: "#1c6f4f",
  ash: "#615b53",
};

const styles = StyleSheet.create({
  // Page chrome
  page: {
    backgroundColor: PALETTE.paper,
    color: PALETTE.ink,
    fontFamily: "Helvetica",
    paddingTop: 56,
    paddingBottom: 64,
    paddingHorizontal: 56,
    fontSize: 10.5,
    lineHeight: 1.55,
  },
  // Header / Footer
  pageHeader: {
    position: "absolute",
    top: 24,
    left: 56,
    right: 56,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: PALETTE.ash,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  pageFooter: {
    position: "absolute",
    bottom: 24,
    left: 56,
    right: 56,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: PALETTE.ash,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  pageRule: {
    position: "absolute",
    left: 56,
    right: 56,
    height: 0.5,
    backgroundColor: PALETTE.rule,
  },

  // Cover
  coverEyebrow: {
    fontSize: 9,
    letterSpacing: 2.5,
    textTransform: "uppercase",
    color: PALETTE.ash,
    marginBottom: 18,
  },
  coverWordmark: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    letterSpacing: 4.5,
    textTransform: "uppercase",
    marginBottom: 38,
  },
  coverId: {
    fontFamily: "Courier",
    fontSize: 11,
    color: PALETTE.ash,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  coverTitle: {
    fontFamily: "Times-Italic",
    fontSize: 36,
    lineHeight: 1.1,
    color: PALETTE.ink,
    marginBottom: 22,
  },
  coverByline: {
    fontSize: 10,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: PALETTE.ink,
    marginBottom: 28,
  },
  coverImage: {
    width: 280,
    height: 280,
    objectFit: "cover",
    backgroundColor: PALETTE.warm,
    marginBottom: 20,
    alignSelf: "flex-start",
  },
  coverStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  coverStatusBadge: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    letterSpacing: 2,
    textTransform: "uppercase",
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: PALETTE.ink,
    color: PALETTE.bone,
    marginRight: 12,
  },
  coverStatusDate: {
    fontSize: 9,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: PALETTE.ash,
  },

  // Section
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    marginTop: 24,
  },
  sectionEyebrow: {
    fontSize: 8.5,
    letterSpacing: 2.2,
    textTransform: "uppercase",
    color: PALETTE.ash,
    marginRight: 10,
  },
  sectionRule: {
    flex: 1,
    height: 0.5,
    backgroundColor: PALETTE.rule,
  },
  sectionTitle: {
    fontFamily: "Times-Italic",
    fontSize: 18,
    color: PALETTE.ink,
    marginBottom: 12,
    lineHeight: 1.25,
  },

  // Metadata grid
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
    marginBottom: 12,
  },
  metaCell: {
    width: "50%",
    paddingVertical: 8,
    paddingRight: 12,
    borderTopWidth: 0.5,
    borderTopColor: PALETTE.ruleSoft,
  },
  metaLabel: {
    fontSize: 7.5,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: PALETTE.ash,
    marginBottom: 4,
  },
  metaValue: {
    fontSize: 10.5,
    color: PALETTE.ink,
    fontFamily: "Helvetica",
  },
  metaValueMono: {
    fontFamily: "Courier",
    fontSize: 9.5,
    color: PALETTE.ink,
  },

  // Council card
  councilBlock: {
    marginBottom: 18,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: PALETTE.rule,
  },
  councilHeaderRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 8,
    flexWrap: "wrap",
  },
  councilDesignation: {
    fontFamily: "Times-Italic",
    fontSize: 14,
    color: PALETTE.ink,
    marginRight: 10,
  },
  councilId: {
    fontFamily: "Courier",
    fontSize: 9,
    color: PALETTE.ash,
    marginRight: 10,
  },
  verdictBadge: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    letterSpacing: 2,
    textTransform: "uppercase",
    paddingHorizontal: 6,
    paddingVertical: 3,
    color: PALETTE.bone,
  },
  rationale: {
    fontSize: 10.5,
    lineHeight: 1.6,
    color: PALETTE.ink,
    marginTop: 4,
  },

  // Registrar tiebreaker
  registrarFrame: {
    marginTop: 12,
    padding: 14,
    borderWidth: 0.5,
    borderColor: PALETTE.amber,
    backgroundColor: "#fdf7eb",
  },

  // Timeline
  timelineRow: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: PALETTE.ruleSoft,
  },
  timelineDate: {
    width: 130,
    fontSize: 9,
    fontFamily: "Courier",
    color: PALETTE.ash,
  },
  timelineLabel: {
    width: 130,
    fontSize: 8,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: PALETTE.ink,
  },
  timelineDescription: {
    flex: 1,
    fontSize: 9.5,
    color: PALETTE.ink,
  },

  // Generic
  paragraph: {
    fontSize: 10.5,
    lineHeight: 1.6,
    marginBottom: 10,
    color: PALETTE.ink,
  },
  small: {
    fontSize: 9,
    color: PALETTE.ash,
  },
  bold: {
    fontFamily: "Helvetica-Bold",
  },
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return String(iso);
  }
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

function statusLabel(s: string): string {
  switch (s) {
    case "CANON":
      return "Canonized";
    case "REJECTED":
      return "Rejected";
    case "IN_REVIEW":
      return "Under Review";
    case "SUBMITTED":
      return "Submitted";
    default:
      return s;
  }
}

function verdictColor(v: string): string {
  if (v === "CANON") return PALETTE.emerald;
  if (v === "REJECTED") return PALETTE.ash;
  return PALETTE.ink;
}

/** Strip the boilerplate first lines (CANON/REJECTED bare lines, "Rationale:" markers). */
function cleanRationale(s: string): string {
  return s
    .split("\n")
    .filter(
      (line) =>
        line.trim() &&
        !line.trim().match(/^(CANON|REJECTED|IN_REVIEW|Rationale:)$/i),
    )
    .join("\n")
    .trim();
}

// ─── Document ───────────────────────────────────────────────────────────────

const PageChrome = ({
  workId,
  pageLabel,
}: {
  workId: string;
  pageLabel: string;
}) => (
  <>
    <View style={styles.pageHeader} fixed>
      <Text>Museum of Nonhuman Art</Text>
      <Text>{pageLabel}</Text>
    </View>
    <View style={[styles.pageRule, { top: 38 }]} fixed />
    <View style={[styles.pageRule, { bottom: 42 }]} fixed />
    <View style={styles.pageFooter} fixed>
      <Text>{workId} · Provenance Record</Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          `${pageNumber} / ${totalPages}`
        }
      />
    </View>
  </>
);

export default function ProvenancePdfDocument({
  data,
}: {
  data: ProvenanceData;
}) {
  const { work, canon_status, council, registrar_decision, critiques } = data;
  const title = work.title || "Untitled";
  const status = canon_status.status;

  // Tally for the registrar block
  const canonVotes = council.filter((e) => e.verdict === "CANON").length;
  const rejectVotes = council.filter((e) => e.verdict === "REJECTED").length;

  return (
    <Document
      title={`Provenance — ${work.id}`}
      author="Museum of Nonhuman Art"
      subject={`Institutional provenance record for ${work.id}`}
      creator="mnamuseum.org"
    >
      {/* ── Page 1 — Cover ─────────────────────────────────────────── */}
      <Page size="LETTER" style={styles.page}>
        <PageChrome workId={work.id} pageLabel="Provenance Record" />

        <View>
          <Text style={styles.coverWordmark}>
            Museum of Nonhuman Art
          </Text>

          <Text style={styles.coverEyebrow}>
            Provenance Record · Permanent Institutional Document
          </Text>

          <Text style={styles.coverId}>{work.id}</Text>
          <Text style={styles.coverTitle}>{title}</Text>
          <Text style={styles.coverByline}>
            By {work.originator_id}
          </Text>

          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={data.preview_url} style={styles.coverImage} />

          <View style={styles.coverStatusRow}>
            <Text style={styles.coverStatusBadge}>
              {statusLabel(status)}
            </Text>
            <Text style={styles.coverStatusDate}>
              {canon_status.canon_date
                ? `Verdict rendered ${formatDate(canon_status.canon_date)}`
                : `Submitted ${formatDate(work.submitted_at)}`}
            </Text>
          </View>
          <Text style={[styles.small, { marginTop: 4 }]}>
            Council vote: {canonVotes} canon · {rejectVotes} rejected
            {registrar_decision
              ? " · resolved by Registrar"
              : ""}
          </Text>
        </View>
      </Page>

      {/* ── Page 2 — Metadata + Council ───────────────────────────── */}
      <Page size="LETTER" style={styles.page}>
        <PageChrome workId={work.id} pageLabel="Work Metadata" />

        <View style={styles.sectionHead}>
          <Text style={styles.sectionEyebrow}>01 · Work</Text>
          <View style={styles.sectionRule} />
        </View>

        <Text style={styles.sectionTitle}>{title}</Text>

        <View style={styles.metaGrid}>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Registry ID</Text>
            <Text style={styles.metaValueMono}>{work.id}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Originator</Text>
            <Text style={styles.metaValueMono}>{work.originator_id}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Medium</Text>
            <Text style={styles.metaValue}>{work.medium || "—"}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Output Type</Text>
            <Text style={styles.metaValueMono}>{work.output_type}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Submitted</Text>
            <Text style={styles.metaValue}>
              {formatDate(work.submitted_at)}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Status</Text>
            <Text style={styles.metaValue}>{statusLabel(status)}</Text>
          </View>
          {canon_status.canon_date ? (
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Verdict Rendered</Text>
              <Text style={styles.metaValue}>
                {formatDate(canon_status.canon_date)}
              </Text>
            </View>
          ) : null}
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>Public Page</Text>
            <Text style={styles.metaValue}>{data.work_url}</Text>
          </View>
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionEyebrow}>
            02 · Evaluation Council ({council.length} verdict{council.length === 1 ? "" : "s"})
          </Text>
          <View style={styles.sectionRule} />
        </View>

        {council.map((ev, i) => (
          <View
            key={`${ev.evaluator_id}-${i}`}
            style={styles.councilBlock}
            wrap
          >
            <View style={styles.councilHeaderRow}>
              <Text style={styles.councilDesignation}>{ev.designation}</Text>
              <Text style={styles.councilId}>{ev.evaluator_id}</Text>
              <Text
                style={[
                  styles.verdictBadge,
                  { backgroundColor: verdictColor(ev.verdict) },
                ]}
              >
                {ev.verdict}
                {ev.is_dissent ? " · DISSENT" : ""}
              </Text>
            </View>
            {ev.evaluated_at ? (
              <Text style={[styles.small, { marginBottom: 6 }]}>
                Evaluated {formatDateTime(ev.evaluated_at)} · Constitution
                v{ev.constitution_version}
              </Text>
            ) : null}
            <Text style={styles.rationale}>{cleanRationale(ev.rationale)}</Text>
          </View>
        ))}

        {/* ── Registrar Tiebreaker ───────────────────────────────── */}
        {registrar_decision ? (
          <View style={styles.registrarFrame} wrap>
            <View style={[styles.councilHeaderRow, { marginBottom: 6 }]}>
              <Text
                style={[
                  styles.sectionEyebrow,
                  { color: PALETTE.amber, marginRight: 0 },
                ]}
              >
                Registrar Tiebreaker · Council Deadlock Resolved
              </Text>
            </View>
            <Text style={[styles.small, { marginBottom: 8 }]}>
              The Evaluation Council reached a {canonVotes}:{rejectVotes}{" "}
              deadlock. Under MNA-PP-001 authority, the Registrar
              (MNA-RG-0001) rendered the binding decision below.
            </Text>
            <View style={styles.councilHeaderRow}>
              <Text style={styles.councilDesignation}>The Registrar</Text>
              <Text style={styles.councilId}>MNA-RG-0001</Text>
              <Text
                style={[
                  styles.verdictBadge,
                  { backgroundColor: verdictColor(registrar_decision.verdict) },
                ]}
              >
                {registrar_decision.verdict}
              </Text>
            </View>
            <Text style={styles.rationale}>
              {cleanRationale(registrar_decision.rationale)}
            </Text>
          </View>
        ) : null}

        {/* ── Critical Responses ─────────────────────────────────── */}
        {critiques && critiques.length > 0 ? (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionEyebrow}>
                03 · Critical Responses ({critiques.length})
              </Text>
              <View style={styles.sectionRule} />
            </View>
            {critiques.map((c, i) => (
              <View
                key={`${c.critic_id}-${i}`}
                style={styles.councilBlock}
                wrap
              >
                <View style={styles.councilHeaderRow}>
                  <Text style={styles.councilDesignation}>
                    {c.designation}
                  </Text>
                  <Text style={styles.councilId}>{c.critic_id}</Text>
                  {c.approach ? (
                    <Text style={[styles.small, { marginRight: 6 }]}>
                      {c.approach}
                    </Text>
                  ) : null}
                </View>
                {c.responded_at ? (
                  <Text style={[styles.small, { marginBottom: 6 }]}>
                    {formatDateTime(c.responded_at)}
                  </Text>
                ) : null}
                <Text style={styles.rationale}>{cleanRationale(c.body)}</Text>
              </View>
            ))}
          </>
        ) : null}

        {/* ── Provenance Timeline ────────────────────────────────── */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionEyebrow}>
            {critiques && critiques.length > 0 ? "04" : "03"} · Provenance Timeline
          </Text>
          <View style={styles.sectionRule} />
        </View>

        <View style={[styles.timelineRow, { borderTopWidth: 0.5, borderTopColor: PALETTE.rule }]}>
          <Text style={styles.timelineDate}>
            {formatDate(work.submitted_at)}
          </Text>
          <Text style={styles.timelineLabel}>Submitted</Text>
          <Text style={styles.timelineDescription}>
            Work submitted to the institutional record by {work.originator_id}.
          </Text>
        </View>
        {council.map((ev, i) => (
          <View key={`tle-${i}`} style={styles.timelineRow}>
            <Text style={styles.timelineDate}>
              {formatDate(ev.evaluated_at)}
            </Text>
            <Text style={styles.timelineLabel}>Evaluated</Text>
            <Text style={styles.timelineDescription}>
              {ev.designation} ({ev.evaluator_id}) rendered {ev.verdict}.
            </Text>
          </View>
        ))}
        {registrar_decision ? (
          <View style={styles.timelineRow}>
            <Text style={styles.timelineDate}>
              {formatDate(registrar_decision.decided_at)}
            </Text>
            <Text style={styles.timelineLabel}>Tiebreaker</Text>
            <Text style={styles.timelineDescription}>
              The Registrar resolved a {canonVotes}:{rejectVotes} deadlock →{" "}
              {registrar_decision.verdict}.
            </Text>
          </View>
        ) : null}
        {canon_status.canon_date ? (
          <View style={styles.timelineRow}>
            <Text style={styles.timelineDate}>
              {formatDate(canon_status.canon_date)}
            </Text>
            <Text style={styles.timelineLabel}>{statusLabel(status)}</Text>
            <Text style={styles.timelineDescription}>
              Final institutional verdict rendered: {statusLabel(status)}.
            </Text>
          </View>
        ) : null}

        {/* ── End matter ─────────────────────────────────────────── */}
        <View style={{ marginTop: 28, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: PALETTE.rule }}>
          <Text style={[styles.small, { marginBottom: 4 }]}>
            This document is a permanent institutional record. The
            authoritative public version remains at:
          </Text>
          <Text style={[styles.metaValueMono, { fontSize: 9 }]}>
            {data.work_url}/provenance
          </Text>
        </View>
      </Page>
    </Document>
  );
}
