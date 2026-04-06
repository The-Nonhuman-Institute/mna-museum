/**
 * POST /api/newsletter/subscribe
 *
 * Double opt-in subscription endpoint. Accepts an email, records the
 * subscriber (or reuses an existing row), and dispatches a confirmation
 * email. Always returns `{ status: "confirmation_sent" }` regardless of
 * whether the email was previously known, to avoid leaking membership.
 */

import { NextRequest, NextResponse } from "next/server";
import { isValidEmail, subscribe } from "@/lib/newsletter";
import { sendNewsletterConfirmation } from "@/lib/email";

interface SubscribeBody {
  email?: string;
}

export async function POST(request: NextRequest) {
  let body: SubscribeBody;
  try {
    body = (await request.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const email = (body.email ?? "").trim();
  if (!email || !isValidEmail(email)) {
    return NextResponse.json(
      { error: "A valid email address is required." },
      { status: 400 }
    );
  }

  try {
    const { confirmation_token } = await subscribe(email);
    const confirmationUrl = `https://mnamuseum.org/api/newsletter/confirm?token=${confirmation_token}`;

    try {
      await sendNewsletterConfirmation(email, { confirmationUrl });
    } catch (err) {
      console.error("[newsletter/subscribe] email send failed:", err);
      return NextResponse.json(
        { error: "Could not send confirmation email." },
        { status: 500 }
      );
    }

    return NextResponse.json({ status: "confirmation_sent" });
  } catch (err) {
    console.error("[newsletter/subscribe] failed:", err);
    return NextResponse.json(
      { error: "Subscription failed." },
      { status: 500 }
    );
  }
}
