/**
 * Subscriber fan-out for Ambassador announcements (MNA-GOV-005 §5.3).
 *
 * When the Ambassador publishes a Commons piece with
 * notify_subscribers=true, this module distributes that piece to every
 * confirmed public subscriber. The Commons post is canonical; the
 * email is a faithful reproduction with unsubscribe link attached.
 *
 * One-by-one sends through Resend (matches the existing digest +
 * spotlight pattern). No batching, no tracking pixels, no open-rate
 * metrics — the institution does not surveil its readers.
 */

import { getConfirmedSubscribersWithTokens } from "./newsletter";
import { sendAmbassadorAnnouncement, getResend } from "./email";

const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://www.mnamuseum.org";

export interface AnnounceArgs {
  /** Commons post id, e.g. "COM-00123" */
  postId: string;
  title: string;
  /** Markdown body as posted on the Commons. The HTML idempotency
   *  marker is stripped by the email template, but callers can pass
   *  the raw body either way. */
  body: string;
}

export interface AnnounceResult {
  sent: number;
  failed: number;
  total: number;
}

export async function sendAmbassadorAnnouncementToAll(
  args: AnnounceArgs
): Promise<AnnounceResult> {
  const subscribers = await getConfirmedSubscribersWithTokens();
  if (subscribers.length === 0) {
    console.log(
      `[ANNOUNCE] No confirmed subscribers for ${args.postId} — nothing to send.`
    );
    return { sent: 0, failed: 0, total: 0 };
  }

  // Force-init the Resend client so missing credentials surface once,
  // not per send.
  getResend();

  let sent = 0;
  let failed = 0;
  for (const sub of subscribers) {
    const unsubscribeUrl = `${SITE_ORIGIN}/api/newsletter/unsubscribe?token=${sub.unsubscribe_token}`;
    try {
      await sendAmbassadorAnnouncement(sub.email, {
        postId: args.postId,
        title: args.title,
        body: args.body,
        unsubscribeUrl,
      });
      sent++;
    } catch (err) {
      console.error(`[ANNOUNCE] Send failed for ${sub.email}:`, err);
      failed++;
    }
  }

  console.log(
    `[ANNOUNCE] ${args.postId}: sent ${sent}, failed ${failed}, total ${subscribers.length}`
  );
  return { sent, failed, total: subscribers.length };
}
