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
import AmbassadorAnnouncement, {
  type AmbassadorAnnouncementProps,
} from "@/emails/AmbassadorAnnouncement";

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

/**
 * Acknowledge a registration the moment it is queued.
 *
 * Until now POST /api/register returned 202 to the agent and told the steward
 * nothing at all. A person who has just handed their agent to an institution
 * heard silence, with no way to distinguish "queued for review" from "lost".
 * Registration is invitation-only in Phase I, so the wait is real and can be
 * days — which makes saying so the minimum, not a courtesy.
 *
 * Plain text on purpose. This is a receipt, not an announcement, and it has to
 * survive being read on a phone by someone who is not sure the thing worked.
 */
export async function sendRegistrationReceived(
  to: string,
  args: { pendingId: number; stewardName: string; agentType: string; warnings?: string[] },
): Promise<void> {
  const warningBlock = args.warnings?.length
    ? `\n\nThe Registrar noted the following for review. None of these blocks your registration:\n\n` +
      args.warnings.map((w) => `  - ${w}`).join("\n")
    : "";

  await getResend().emails.send({
    from: `Museum of Nonhuman Art <${FROM}>`,
    to,
    subject: `Registration received — reference ${args.pendingId}`,
    text: `${args.stewardName},

Your registration for a ${args.agentType.toLowerCase()} has been received and has
passed the Registrar's automated compliance check. Your reference is ${args.pendingId}.

WHAT HAPPENS NEXT

MNA is in Phase I, which means registration is invitation-only and every
registration is activated by hand by the founding steward. That review is a
compliance check, not a judgement of your agent's merit — the Registrar is
asking whether the constitution is complete and valid, nothing more.

You will receive a second email when your agent is activated, containing its
permanent registry identifier. If something is missing you will receive a
written description of what, and you may resubmit as many times as you need.

There is nothing for you to do in the meantime.

WHAT YOU DO NOT NEED TO SEND US

Your agent's private key. MNA does not issue Originator keys and never receives
one. Your agent generated its own keypair and registered only the public half;
the private half should stay wherever your agent put it, reachable on every
future run. We cannot recover it for you, because we do not have it.

You can check the status of this registration at any time:

  https://www.mnamuseum.org/api/register/status?id=${args.pendingId}${warningBlock}

— The Registrar, MNA-RG-0001
Museum of Nonhuman Art`,
  });
}

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
    subject: `Institutional Bulletin — ${props.bulletinDate}`,
    react: React.createElement(MonthlyDigest, props),
  });

  if (error) {
    throw new Error(`Failed to send Monthly Digest: ${error.message}`);
  }
}

// ─── Ambassador Announcement ─────────────────────────────────────────────────

export async function sendAmbassadorAnnouncement(
  to: string,
  props: AmbassadorAnnouncementProps
): Promise<void> {
  const { error } = await getResend().emails.send({
    from: `Museum of Nonhuman Art <${FROM}>`,
    to,
    subject: props.title,
    react: React.createElement(AmbassadorAnnouncement, props),
  });

  if (error) {
    throw new Error(
      `Failed to send Ambassador Announcement: ${error.message}`
    );
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
