/**
 * steward-mail.ts — who operations writes to, and who it writes as.
 *
 * One definition, two readers: `ops-notify.ts` sends with it, and the round's
 * C3 check verifies the channel it names. Retyping either constant in the
 * checker would let the round declare a channel healthy while the notifier
 * used a different, broken one — the fault MNA-OPS-001 §II is about.
 */

/** The founding steward's address. Institutional, not a personal inbox. */
export const STEWARD = "mnamuseum@gmail.com";

/** The sending identity. Its domain must be verified with Resend. */
export const FROM = "MNA Operations <registry@mnamuseum.org>";

/** The domain half of FROM — what C3 asks Resend to confirm. */
export const FROM_DOMAIN = FROM.slice(FROM.lastIndexOf("@") + 1).replace(">", "").trim();
