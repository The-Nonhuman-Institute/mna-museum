import { NextRequest, NextResponse } from "next/server";
import { keeperChat, type ChatMessage } from "@/lib/keeper";
import {
  createSession,
  getSession,
  listMessages,
  appendMessage,
  setSessionTitle,
} from "@/lib/keeper-sessions";
import { recordEvent } from "@/lib/events";

// Force Node runtime so the Anthropic SDK and libSQL client work.
export const runtime = "nodejs";

/**
 * POST /api/keeper/chat
 *
 * Body:
 *   {
 *     session_id?: number   // if omitted, a new session is created
 *     message: string       // the steward's new turn
 *   }
 *
 * Response:
 *   {
 *     session_id: number,
 *     assistant: string,    // the Keeper's reply
 *   }
 *
 * Side effects:
 *   - Both user and assistant messages are persisted to
 *     keeper_messages in the terminal's Turso DB
 *   - On the first exchange of a new session, the session title is
 *     set to the first ~60 characters of the user's message
 *   - Each turn also writes a KEEPER_MESSAGE event to the terminal's
 *     events table so the Feed can surface "steward consulted Keeper"
 *
 * Institutional transcripts stay local. Nothing from this chat is
 * written to the institutional Turso DB.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { session_id?: number; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const userMessage = String(body.message || "").trim();
  if (!userMessage) {
    return NextResponse.json(
      { error: "'message' is required." },
      { status: 400 }
    );
  }

  // Resolve the session. Either load an existing one or create new.
  let sessionId = Number(body.session_id);
  let isNewSession = false;
  if (!Number.isFinite(sessionId) || sessionId <= 0) {
    sessionId = await createSession();
    isNewSession = true;
  } else {
    const existing = await getSession(sessionId);
    if (!existing) {
      return NextResponse.json(
        { error: `Session ${sessionId} not found.` },
        { status: 404 }
      );
    }
  }

  // Load the conversation history BEFORE appending the new message.
  const priorMessages = await listMessages(sessionId);
  const history: ChatMessage[] = priorMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  // Append the new user turn so it's part of the history we send.
  history.push({ role: "user", content: userMessage });
  await appendMessage(sessionId, "user", userMessage);

  // On the first exchange of a new session, set the title to the
  // opening question. Gives the session list something to render.
  if (isNewSession) {
    const title =
      userMessage.length <= 60
        ? userMessage
        : userMessage.slice(0, 57) + "...";
    await setSessionTitle(sessionId, title);
  }

  // Call the Keeper. The reply includes the visible text, parsed
  // follow-up suggestions, and a list of tools the Keeper used to
  // compose its response (for debug + future "breadcrumb" UI).
  let reply: Awaited<ReturnType<typeof keeperChat>>;
  try {
    reply = await keeperChat(history);
  } catch (err) {
    console.error("[keeper/chat] keeperChat failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Keeper failed to respond: ${message}` },
      { status: 500 }
    );
  }

  // Persist the assistant turn. We store the visible text only;
  // suggestions are a render-time concern and regenerate on the next
  // turn anyway. Tools-used is surfaced in the response for the UI
  // to show but is not persisted to the transcript.
  await appendMessage(sessionId, "assistant", reply.text);

  // Feed event — compact, never includes message content. The Feed
  // shows "steward consulted the Keeper" but not what was said.
  try {
    await recordEvent({
      event_type: "KEEPER_TURN",
      description: isNewSession
        ? "Steward opened a Keeper session"
        : "Steward continued a Keeper session",
      metadata: { session_id: sessionId },
      priority: "normal",
      source: "terminal",
    });
  } catch (err) {
    console.error("[keeper/chat] failed to record feed event:", err);
  }

  return NextResponse.json(
    {
      session_id: sessionId,
      assistant: reply.text,
      suggestions: reply.suggestions,
      tools_used: reply.tools_used,
    },
    { status: 200 }
  );
}
