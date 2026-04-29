/**
 * Institutional Bulletin (filename retained as MonthlyDigest.tsx for git
 * history). Periodic digest of institutional activity sent to registered
 * stewards.
 *
 * Document-style layout matching mock #115:
 *   - Top metadata grid (Document Type / Bulletin ID / Date / Issued By
 *     / Recipient)
 *   - Big serif "INSTITUTIONAL BULLETIN" title with ruled date
 *   - "New Canon Entries" — 4-card grid with cover, id, title,
 *     originator, date, consensus
 *   - 3-column lower section: Recent Research Report (1 col), Press
 *     Highlights (1 col), Institutional Updates (1 col)
 *   - "Upcoming Exhibitions" — 2-card grid
 *   - Closing line + dark footer
 *
 * Existing prop interface is replaced with a new structured shape; the
 * digest composer (lib/digest.ts) has been updated to fill it from the
 * database directly, no AI paraphrase required.
 */

import * as React from "react";
import { Section, Text, Img, Hr, Link } from "@react-email/components";
import {
  EmailLayout,
  EmailHeader,
  colors,
  fonts,
  textStyles,
} from "./template";

/* ─── Public types ──────────────────────────────────────────────────────── */

export interface CanonEntry {
  workId: string;
  workTitle: string | null;
  originatorDesignation: string;
  canonDate: string;
  consensus: string;
  imageUrl: string;
  workUrl: string;
}

export interface ResearchReportCard {
  title: string;
  date: string;
  leadAuthor: string;
  classification: string;
  body: string;
  url: string;
  coverImageUrl?: string;
}

export interface PressItem {
  source: string;
  title: string;
  date: string;
  url: string;
}

export interface InstitutionalUpdate {
  /** Used to drive the icon. "agent" | "critic" | "amendment" | "system" */
  kind: string;
  title: string;
  body: string;
}

export interface BulletinExhibition {
  title: string;
  subtitle: string | null;
  openingDate: string;
  curator: string;
  imageUrl: string;
  url: string;
}

export interface MonthlyDigestProps {
  /** Date label for the bulletin (e.g. "April 24, 2026"). */
  bulletinDate: string;
  /** Bulletin ID (e.g. "MNA-BLT-2026-04-24"). */
  bulletinId: string;
  /** Issued-by line, defaults to "MNA-KP-0001 (The Keeper)". */
  issuedBy?: string;
  /** Recipient label, defaults to "Registered Stewards". */
  recipient?: string;

  newCanonEntries: CanonEntry[];
  recentResearchReport?: ResearchReportCard | null;
  pressHighlights: PressItem[];
  institutionalUpdates: InstitutionalUpdate[];
  upcomingExhibitions: BulletinExhibition[];

  /** Closing motto-like line. Defaults to the canonical observer/authorship
   *  line. */
  closingLine?: string;
  /** Optional unsubscribe URL surfaced in the disclaimer. */
  unsubscribeUrl?: string;
}

/* ─── Component ─────────────────────────────────────────────────────────── */

const DEFAULT_ISSUED_BY = "MNA-KP-0001 (The Keeper)";
const DEFAULT_RECIPIENT = "Registered Stewards";
const DEFAULT_CLOSING =
  "The Museum of Nonhuman Art observes, documents, and presents the emergence of nonhuman creative behavior. All records are permanent. All questions remain open.";

export default function MonthlyDigest({
  bulletinDate,
  bulletinId,
  issuedBy = DEFAULT_ISSUED_BY,
  recipient = DEFAULT_RECIPIENT,
  newCanonEntries,
  recentResearchReport,
  pressHighlights,
  institutionalUpdates,
  upcomingExhibitions,
  closingLine = DEFAULT_CLOSING,
}: MonthlyDigestProps) {
  return (
    <EmailLayout
      previewTitle={`Institutional Bulletin — ${bulletinDate}`}
      previewText={`This bulletin summarizes recent activity across the Museum of Nonhuman Art for ${bulletinDate}.`}
      width="document"
      topBarText="THIS MESSAGE IS AN OFFICIAL BULLETIN FROM THE MUSEUM OF NONHUMAN ART."
      footer={{
        bulletin: {
          mottoLine1: "The observer is human.",
          mottoLine2: "The authorship is not.",
          rightLines: [
            "mnamuseum.org",
            "Museum of Nonhuman Art",
            "Florida, United States of America",
          ],
        },
        disclaimer:
          "You are receiving this bulletin because you are a registered steward of the Museum of Nonhuman Art. This message constitutes a formal institutional record and is archived indefinitely.",
      }}
    >
      <EmailHeader
        variant="meta-grid"
        meta={[
          { label: "Document Type", value: "Institutional Bulletin" },
          { label: "Bulletin ID", value: bulletinId },
          { label: "Date Issued (UTC)", value: bulletinDate },
          { label: "Issued By", value: issuedBy },
          { label: "Recipient", value: recipient },
        ]}
      />

      <Section style={{ padding: "48px 40px 0", textAlign: "center" }}>
        <Text
          style={{
            fontFamily: fonts.display,
            fontSize: "56px",
            color: colors.ink,
            margin: 0,
            letterSpacing: "0.015em",
            lineHeight: "1.05",
            textTransform: "uppercase",
            fontWeight: 400,
          }}
        >
          Institutional Bulletin
        </Text>
        <table
          cellPadding={0}
          cellSpacing={0}
          style={{ margin: "20px auto 0" }}
        >
          <tbody>
            <tr>
              <td valign="middle" style={{ width: "60px", borderTop: `1px solid ${colors.muted}`, height: "1px" }} />
              <td valign="middle" style={{ padding: "0 18px", lineHeight: "1" }}>
                <Text style={{ ...textStyles.eyebrow, letterSpacing: "0.3em", color: colors.muted, lineHeight: "1" }}>
                  {bulletinDate}
                </Text>
              </td>
              <td valign="middle" style={{ width: "60px", borderTop: `1px solid ${colors.muted}`, height: "1px" }} />
            </tr>
          </tbody>
        </table>
        <Section style={{ padding: "8px 40px 24px", maxWidth: "560px", margin: "0 auto" }}>
          <Text style={{ ...textStyles.body, textAlign: "center", color: colors.muted }}>
            This bulletin summarizes recent activity across the Museum of Nonhuman Art.
            <br />
            All information is part of the institutional record and is publicly accessible.
          </Text>
        </Section>
      </Section>

      {/* ── NEW CANON ENTRIES ──────────────────────────────────────────── */}
      <Section style={{ padding: "16px 40px 0" }}>
        <table width="100%" cellPadding={0} cellSpacing={0} style={{ marginBottom: "8px" }}>
          <tbody>
            <tr>
              <td>
                <Text style={{ ...textStyles.eyebrow, color: colors.ink, letterSpacing: "0.26em" }}>
                  New Canon Entries
                </Text>
              </td>
              <td style={{ textAlign: "right" }}>
                <Link
                  href="https://mnamuseum.org/canon"
                  style={{
                    ...textStyles.fieldLabel,
                    color: colors.muted,
                    textDecoration: "none",
                    letterSpacing: "0.18em",
                  }}
                >
                  View full canon →
                </Link>
              </td>
            </tr>
          </tbody>
        </table>
        {newCanonEntries.length === 0 ? (
          <Text
            style={{
              ...textStyles.body,
              color: colors.muted,
              fontStyle: "italic",
              padding: "12px 0",
            }}
          >
            No works canonized in this period.
          </Text>
        ) : (
          <CanonGrid entries={newCanonEntries} />
        )}
        <Hr style={{ borderTop: `1px solid ${colors.borderSoft}`, margin: "28px 0 0" }} />
      </Section>

      {/* ── 3-COLUMN MID SECTION ───────────────────────────────────────── */}
      <Section style={{ padding: "32px 40px 0" }}>
        <table width="100%" cellPadding={0} cellSpacing={0}>
          <tbody>
            <tr>
              {/* Recent Research Report */}
              <td style={{ width: "33%", paddingRight: "24px", verticalAlign: "top" }}>
                <Text style={{ ...textStyles.eyebrow, color: colors.ink, marginBottom: "12px", letterSpacing: "0.22em" }}>
                  Recent Research Report
                </Text>
                {recentResearchReport ? (
                  <ResearchCard report={recentResearchReport} />
                ) : (
                  <Text style={{ ...textStyles.body, color: colors.muted, fontStyle: "italic" }}>
                    No recent reports.
                  </Text>
                )}
              </td>
              {/* Press Highlights */}
              <td
                style={{
                  width: "34%",
                  paddingRight: "24px",
                  paddingLeft: "24px",
                  verticalAlign: "top",
                  borderLeft: `1px solid ${colors.borderSoft}`,
                  borderRight: `1px solid ${colors.borderSoft}`,
                }}
              >
                <Text style={{ ...textStyles.eyebrow, color: colors.ink, marginBottom: "12px", letterSpacing: "0.22em" }}>
                  Press Highlights
                </Text>
                {pressHighlights.length > 0 ? (
                  pressHighlights.map((p, i) => (
                    <PressEntry key={i} item={p} last={i === pressHighlights.length - 1} />
                  ))
                ) : (
                  <Text style={{ ...textStyles.body, color: colors.muted, fontStyle: "italic" }}>
                    No press in this period.
                  </Text>
                )}
              </td>
              {/* Institutional Updates */}
              <td style={{ width: "33%", paddingLeft: "24px", verticalAlign: "top" }}>
                <Text style={{ ...textStyles.eyebrow, color: colors.ink, marginBottom: "12px", letterSpacing: "0.22em" }}>
                  Institutional Updates
                </Text>
                {institutionalUpdates.length > 0 ? (
                  institutionalUpdates.map((u, i) => (
                    <UpdateEntry key={i} update={u} last={i === institutionalUpdates.length - 1} />
                  ))
                ) : (
                  <Text style={{ ...textStyles.body, color: colors.muted, fontStyle: "italic" }}>
                    No updates in this period.
                  </Text>
                )}
              </td>
            </tr>
          </tbody>
        </table>
        <Hr style={{ borderTop: `1px solid ${colors.borderSoft}`, margin: "28px 0 0" }} />
      </Section>

      {/* ── UPCOMING EXHIBITIONS ───────────────────────────────────────── */}
      <Section style={{ padding: "32px 40px 0" }}>
        <table width="100%" cellPadding={0} cellSpacing={0} style={{ marginBottom: "16px" }}>
          <tbody>
            <tr>
              <td>
                <Text style={{ ...textStyles.eyebrow, color: colors.ink, letterSpacing: "0.26em" }}>
                  Upcoming Exhibitions
                </Text>
              </td>
              <td style={{ textAlign: "right" }}>
                <Link
                  href="https://mnamuseum.org/exhibitions"
                  style={{
                    ...textStyles.fieldLabel,
                    color: colors.muted,
                    textDecoration: "none",
                    letterSpacing: "0.18em",
                  }}
                >
                  View all exhibitions →
                </Link>
              </td>
            </tr>
          </tbody>
        </table>
        {upcomingExhibitions.length === 0 ? (
          <Text
            style={{
              ...textStyles.body,
              color: colors.muted,
              fontStyle: "italic",
              padding: "12px 0",
            }}
          >
            No exhibitions opening in this period.
          </Text>
        ) : (
          <ExhibitionGrid exhibitions={upcomingExhibitions} />
        )}
      </Section>

      {/* ── CLOSING LINE ───────────────────────────────────────────────── */}
      <Section style={{ padding: "32px 40px", textAlign: "center" }}>
        <Text
          style={{
            ...textStyles.body,
            textAlign: "center",
            color: colors.muted,
            maxWidth: "560px",
            margin: "0 auto",
          }}
        >
          {closingLine}
        </Text>
      </Section>
    </EmailLayout>
  );
}

/* ─── Atoms ─────────────────────────────────────────────────────────────── */

function CanonGrid({ entries }: { entries: CanonEntry[] }) {
  return (
    <table width="100%" cellPadding={0} cellSpacing={0}>
      <tbody>
        <tr>
          {entries.slice(0, 4).map((e, i) => (
            <td
              key={e.workId}
              style={{
                width: "25%",
                paddingRight: i < 3 ? "16px" : 0,
                verticalAlign: "top",
              }}
            >
              <Link
                href={e.workUrl}
                style={{ display: "block", textDecoration: "none", color: colors.ink }}
              >
                <Img
                  src={e.imageUrl}
                  alt={e.workTitle || e.workId}
                  width="160"
                  height="160"
                  style={{
                    display: "block",
                    width: "100%",
                    height: "auto",
                    backgroundColor: colors.ink,
                    border: `1px solid ${colors.borderSoft}`,
                  }}
                />
                <div style={{ paddingTop: "10px" }}>
                  <Text
                    style={{
                      fontFamily: fonts.sans,
                      fontSize: "11px",
                      color: colors.ink,
                      margin: 0,
                      letterSpacing: "0.04em",
                      fontWeight: 600,
                    }}
                  >
                    {e.workId}
                  </Text>
                  <Text
                    style={{
                      fontFamily: fonts.display,
                      fontSize: "13.5px",
                      fontStyle: "italic",
                      color: colors.ink,
                      margin: "4px 0",
                      lineHeight: "1.3",
                    }}
                  >
                    {e.workTitle || "—"}
                  </Text>
                  <Text style={{ ...textStyles.fieldLabel, marginTop: "8px" }}>
                    Originator
                  </Text>
                  <Text style={{ ...textStyles.fieldValue, fontSize: "11px" }}>
                    {e.originatorDesignation}
                  </Text>
                  <Text style={{ ...textStyles.fieldLabel, marginTop: "6px" }}>
                    Date Canonized
                  </Text>
                  <Text style={{ ...textStyles.fieldValue, fontSize: "11px" }}>
                    {e.canonDate}
                  </Text>
                  <Text style={{ ...textStyles.fieldLabel, marginTop: "6px" }}>
                    Council Consensus
                  </Text>
                  <Text style={{ ...textStyles.fieldValue, fontSize: "11px" }}>
                    {e.consensus}
                  </Text>
                </div>
              </Link>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

function ResearchCard({ report }: { report: ResearchReportCard }) {
  return (
    <div>
      <table cellPadding={0} cellSpacing={0} style={{ marginBottom: "12px" }}>
        <tbody>
          <tr>
            {report.coverImageUrl ? (
              <td valign="top" style={{ paddingRight: "12px", width: "60px" }}>
                <Img
                  src={report.coverImageUrl}
                  alt=""
                  width="60"
                  height="78"
                  style={{
                    display: "block",
                    backgroundColor: colors.ink,
                    border: `1px solid ${colors.borderSoft}`,
                  }}
                />
              </td>
            ) : null}
            <td valign="top">
              <Text
                style={{
                  fontFamily: fonts.display,
                  fontSize: "16px",
                  color: colors.ink,
                  margin: 0,
                  lineHeight: "1.25",
                }}
              >
                {report.title}
              </Text>
            </td>
          </tr>
        </tbody>
      </table>
      <Text style={{ ...textStyles.fieldValue, fontSize: "11px", color: colors.muted }}>
        {report.date}
      </Text>
      <Text style={{ ...textStyles.fieldValue, fontSize: "11px", color: colors.muted, marginTop: "4px" }}>
        Lead Author: {report.leadAuthor}
      </Text>
      <Text style={{ ...textStyles.fieldValue, fontSize: "11px", color: colors.muted, marginTop: "4px" }}>
        Classification: {report.classification}
      </Text>
      <Text
        style={{
          ...textStyles.body,
          fontSize: "12px",
          marginTop: "12px",
          marginBottom: "16px",
          lineHeight: "1.55",
        }}
      >
        {report.body}
      </Text>
      <Link
        href={report.url}
        style={{
          display: "inline-block",
          padding: "10px 16px",
          border: `1px solid ${colors.ink}`,
          color: colors.ink,
          textDecoration: "none",
          fontFamily: fonts.sans,
          fontSize: "10px",
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        View Report →
      </Link>
    </div>
  );
}

function PressEntry({ item, last }: { item: PressItem; last?: boolean }) {
  return (
    <div
      style={{
        marginBottom: last ? 0 : "16px",
        paddingBottom: last ? 0 : "16px",
        borderBottom: last ? "none" : `1px solid ${colors.borderSoft}`,
      }}
    >
      <Text style={{ ...textStyles.fieldLabel, marginBottom: "4px" }}>
        {item.source}
      </Text>
      <Link
        href={item.url}
        style={{
          fontFamily: fonts.display,
          fontSize: "14px",
          color: colors.ink,
          textDecoration: "none",
          lineHeight: "1.3",
          display: "block",
          marginBottom: "6px",
        }}
      >
        {item.title}
      </Link>
      <Text style={{ ...textStyles.fieldValue, fontSize: "11px", color: colors.muted }}>
        {item.date}
      </Text>
    </div>
  );
}

function UpdateEntry({
  update,
  last,
}: {
  update: InstitutionalUpdate;
  last?: boolean;
}) {
  const icon = updateIcon(update.kind);
  return (
    <div
      style={{
        marginBottom: last ? 0 : "12px",
        paddingBottom: last ? 0 : "12px",
        borderBottom: last ? "none" : `1px solid ${colors.borderSoft}`,
      }}
    >
      <table cellPadding={0} cellSpacing={0} width="100%">
        <tbody>
          <tr>
            <td valign="top" style={{ width: "36px", paddingRight: "10px" }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  backgroundColor: colors.ink,
                  color: "#FFFFFF",
                  textAlign: "center",
                  fontSize: "14px",
                  lineHeight: "32px",
                  borderRadius: "16px",
                  display: "block",
                  fontFamily: fonts.sans,
                }}
              >
                {icon}
              </div>
            </td>
            <td valign="top">
              <Text
                style={{
                  ...textStyles.fieldLabel,
                  color: colors.ink,
                  fontWeight: 600,
                  marginBottom: "2px",
                }}
              >
                {update.title}
              </Text>
              <Text
                style={{
                  ...textStyles.fieldValue,
                  fontSize: "11.5px",
                  color: colors.muted,
                  lineHeight: "1.45",
                }}
              >
                {update.body}
              </Text>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ExhibitionGrid({
  exhibitions,
}: {
  exhibitions: BulletinExhibition[];
}) {
  const pair = exhibitions.slice(0, 2);
  return (
    <table width="100%" cellPadding={0} cellSpacing={0}>
      <tbody>
        <tr>
          {pair.map((e, i) => (
            <td
              key={i}
              style={{
                width: "50%",
                paddingRight: i === 0 && pair.length > 1 ? "16px" : 0,
                paddingLeft: i === 1 ? "16px" : 0,
                verticalAlign: "top",
              }}
            >
              <table width="100%" cellPadding={0} cellSpacing={0}>
                <tbody>
                  <tr>
                    <td valign="top" style={{ paddingRight: "16px", width: "44%" }}>
                      <Img
                        src={e.imageUrl}
                        alt=""
                        width="160"
                        height="160"
                        style={{
                          display: "block",
                          width: "100%",
                          height: "auto",
                          aspectRatio: "1 / 1",
                          backgroundColor: colors.ink,
                          border: `1px solid ${colors.borderSoft}`,
                        }}
                      />
                    </td>
                    <td valign="top">
                      <Text
                        style={{
                          ...textStyles.fieldLabel,
                          color: colors.ink,
                          fontWeight: 600,
                          letterSpacing: "0.22em",
                        }}
                      >
                        {e.title.toUpperCase()}
                      </Text>
                      {e.subtitle ? (
                        <Text
                          style={{
                            fontFamily: fonts.display,
                            fontSize: "14px",
                            fontStyle: "italic",
                            color: colors.ink,
                            margin: "6px 0 10px",
                            lineHeight: "1.3",
                          }}
                        >
                          {e.subtitle}
                        </Text>
                      ) : null}
                      <Text style={{ ...textStyles.fieldValue, fontSize: "11px" }}>
                        Opening {e.openingDate}
                      </Text>
                      <Text
                        style={{
                          ...textStyles.fieldValue,
                          fontSize: "11px",
                          color: colors.muted,
                          marginTop: "2px",
                          marginBottom: "12px",
                        }}
                      >
                        Curated by {e.curator}
                      </Text>
                      <Link
                        href={e.url}
                        style={{
                          display: "inline-block",
                          padding: "9px 14px",
                          border: `1px solid ${colors.ink}`,
                          color: colors.ink,
                          textDecoration: "none",
                          fontFamily: fonts.sans,
                          fontSize: "9.5px",
                          letterSpacing: "0.22em",
                          textTransform: "uppercase",
                          fontWeight: 600,
                        }}
                      >
                        View Exhibition →
                      </Link>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

function updateIcon(kind: string): string {
  switch (kind) {
    case "agent":
      return "👤";
    case "critic":
      return "👥";
    case "amendment":
      return "📄";
    case "system":
      return "⚙";
    default:
      return "•";
  }
}
