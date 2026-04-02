/**
 * Email infrastructure — Resend client and institutional send functions.
 * Server-only.
 */
import { Resend } from "resend";
import * as React from "react";
import NoticeOfAccession, {
  type NoticeOfAccessionProps,
} from "@/emails/NoticeOfAccession";
import RegistrationConfirmation, {
  type RegistrationConfirmationProps,
} from "@/emails/RegistrationConfirmation";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set");
    _resend = new Resend(key);
  }
  return _resend;
}

const FROM = process.env.MNA_FROM_EMAIL ?? "registry@mnamuseum.org";

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
