/**
 * Email infrastructure — Resend client and institutional send functions.
 * Server-only.
 */
import { Resend } from "resend";
import * as React from "react";
import NoticeOfAccession, {
  type NoticeOfAccessionProps,
} from "@/emails/NoticeOfAccession";
import NoticeOfRejection, {
  type NoticeOfRejectionProps,
} from "@/emails/NoticeOfRejection";
import NoticeOfIdentityEmergence, {
  type NoticeOfIdentityEmergenceProps,
} from "@/emails/NoticeOfIdentityEmergence";
import RegistrationConfirmation, {
  type RegistrationConfirmationProps,
} from "@/emails/RegistrationConfirmation";
import NewsletterConfirmation, {
  type NewsletterConfirmationProps,
} from "@/emails/NewsletterConfirmation";
import NewsletterWelcome, {
  type NewsletterWelcomeProps,
} from "@/emails/NewsletterWelcome";
import ExhibitionAnnouncement, {
  type ExhibitionAnnouncementProps,
} from "@/emails/ExhibitionAnnouncement";
import MonthlyDigest, {
  type MonthlyDigestProps,
} from "@/emails/MonthlyDigest";
import OriginatorSpotlight, {
  type OriginatorSpotlightProps,
} from "@/emails/OriginatorSpotlight";

let _resend: Resend | null = null;

export function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set");
    _resend = new Resend(key);
  }
  return _resend;
}

export const FROM = process.env.MNA_FROM_EMAIL ?? "registry@mnamuseum.org";

// ─── Notice of Accession ──────────────────────────────────────────────────────

export async function sendNoticeOfAccession(
  to: string,
  props: NoticeOfAccessionProps
): Promise<void> {
  const { error } = await getResend().emails.send({
    from: `Museum of Nonhuman Art <${FROM}>`,
    to,
    subject: `Notice of Accession — ${props.workId}`,
    react: React.createElement(NoticeOfAccession, props),
  });

  if (error) {
    throw new Error(`Failed to send Notice of Accession: ${error.message}`);
  }
}

// ─── Notice of Rejection (Non-Accession) ─────────────────────────────────────

export async function sendNoticeOfRejection(
  to: string,
  props: NoticeOfRejectionProps
): Promise<void> {
  const { error } = await getResend().emails.send({
    from: `Museum of Nonhuman Art <${FROM}>`,
    to,
    subject: `Notice of Non-Accession — ${props.workId}`,
    react: React.createElement(NoticeOfRejection, props),
  });

  if (error) {
    throw new Error(`Failed to send Notice of Non-Accession: ${error.message}`);
  }
}

// ─── Notice of Identity Emergence ────────────────────────────────────────────

export async function sendNoticeOfIdentityEmergence(
  to: string,
  props: NoticeOfIdentityEmergenceProps
): Promise<void> {
  const { error } = await getResend().emails.send({
    from: `Museum of Nonhuman Art <${FROM}>`,
    to,
    subject: `Notice of Identity Emergence — ${props.declaredName}`,
    react: React.createElement(NoticeOfIdentityEmergence, props),
  });

  if (error) {
    throw new Error(
      `Failed to send Notice of Identity Emergence: ${error.message}`
    );
  }
}

// ─── Registration Confirmation ────────────────────────────────────────────────

export async function sendRegistrationConfirmation(
  to: string,
  props: RegistrationConfirmationProps
): Promise<void> {
  const { error } = await getResend().emails.send({
    from: `Museum of Nonhuman Art <${FROM}>`,
    to,
    subject: `Registration Confirmed — ${props.registryId}`,
    react: React.createElement(RegistrationConfirmation, props),
  });

  if (error) {
    throw new Error(
      `Failed to send Registration Confirmation: ${error.message}`
    );
  }
}

// ─── Newsletter Confirmation (double opt-in) ─────────────────────────────────

export async function sendNewsletterConfirmation(
  to: string,
  props: NewsletterConfirmationProps
): Promise<void> {
  const { error } = await getResend().emails.send({
    from: `Museum of Nonhuman Art <${FROM}>`,
    to,
    subject: "Confirm your subscription to the Museum of Nonhuman Art",
    react: React.createElement(NewsletterConfirmation, props),
  });

  if (error) {
    throw new Error(
      `Failed to send Newsletter Confirmation: ${error.message}`
    );
  }
}

// ─── Newsletter Welcome ──────────────────────────────────────────────────────

export async function sendNewsletterWelcome(
  to: string,
  props: NewsletterWelcomeProps
): Promise<void> {
  const { error } = await getResend().emails.send({
    from: `Museum of Nonhuman Art <${FROM}>`,
    to,
    subject: "Welcome to the Museum of Nonhuman Art",
    react: React.createElement(NewsletterWelcome, props),
  });

  if (error) {
    throw new Error(`Failed to send Newsletter Welcome: ${error.message}`);
  }
}

// ─── Exhibition Announcement ─────────────────────────────────────────────────

export async function sendExhibitionAnnouncement(
  to: string,
  props: ExhibitionAnnouncementProps
): Promise<void> {
  const { error } = await getResend().emails.send({
    from: `Museum of Nonhuman Art <${FROM}>`,
    to,
    subject: `Now on view: ${props.title}`,
    react: React.createElement(ExhibitionAnnouncement, props),
  });

  if (error) {
    throw new Error(
      `Failed to send Exhibition Announcement: ${error.message}`
    );
  }
}

// ─── Monthly Digest ──────────────────────────────────────────────────────────

export async function sendMonthlyDigest(
  to: string,
  props: MonthlyDigestProps
): Promise<void> {
  const { error } = await getResend().emails.send({
    from: `Museum of Nonhuman Art <${FROM}>`,
    to,
    subject: `This Month at the Museum — ${props.monthLabel}`,
    react: React.createElement(MonthlyDigest, props),
  });

  if (error) {
    throw new Error(`Failed to send Monthly Digest: ${error.message}`);
  }
}

// ─── Originator Spotlight ────────────────────────────────────────────────────

export async function sendOriginatorSpotlight(
  to: string,
  props: OriginatorSpotlightProps
): Promise<void> {
  const { error } = await getResend().emails.send({
    from: `Museum of Nonhuman Art <${FROM}>`,
    to,
    subject: `Originator Spotlight — ${props.declaredName}`,
    react: React.createElement(OriginatorSpotlight, props),
  });

  if (error) {
    throw new Error(`Failed to send Originator Spotlight: ${error.message}`);
  }
}
