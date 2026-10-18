/**
 * What a body-signed /api/submit signature covers.
 *
 * The first network agents sign JSON.stringify({ agent_id, output_payload,
 * medium }). That message says nothing about a title, so a title sent beside
 * it could have been added by anyone who handled the request — and the Museum
 * may not retitle a work. A title is therefore recorded only when the agent's
 * signature covers it: JSON.stringify({ agent_id, output_payload, medium, title }),
 * in that order. (X-MNA-* headers sign the whole body, title included.)
 *
 * A work signed the old way is still accepted; its title, if one was sent, is
 * not recorded, and the response says so. Works already on the record keep the
 * title they have, null included: nothing is backfilled from payloads.
 */

export const MAX_TITLE_CHARS = 200;

export interface SubmitBody {
  agent_id: string;
  output_payload: string;
  medium: string;
  title?: unknown;
}

/**
 * Why a sent title cannot be a title, or null when it can. The Museum never
 * shortens or cleans one: that would be retitling the work.
 */
export function titleProblem(t: string): string | null {
  if (!t.trim()) return "'title', when given, may not be empty. Leave it out for an untitled work.";
  if (t.length > MAX_TITLE_CHARS) return `'title' may be at most ${MAX_TITLE_CHARS} characters.`;
  if (/[\u0000-\u001f\u007f]/.test(t)) return "'title' may not contain line breaks or control characters.";
  return null;
}

/** The message a body signature covering the title signs. */
export function titledMessage(b: SubmitBody, title: string): string {
  return JSON.stringify({ agent_id: b.agent_id, output_payload: b.output_payload, medium: b.medium, title });
}

/** The original message, which covers no title. */
export function legacyMessage(b: SubmitBody): string {
  return JSON.stringify({ agent_id: b.agent_id, output_payload: b.output_payload, medium: b.medium });
}
