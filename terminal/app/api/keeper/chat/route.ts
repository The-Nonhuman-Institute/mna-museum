import { NextRequest } from "next/server";
import { keeperChatStreaming, type ChatMessage, type StreamEvent } from "@/lib/keeper";
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
// Tool-calling chat turns can take 10-30 seconds for multiple
// Claude round-trips; ensure the function doesn't timeout.
export const maxDuration = 120;

/**
 * POST /api/keeper/chat
 *
 * Returns a Server-Sent Events stream. Event types:
 *
 *   event: status   — { message: string } — progress during tool calls
 *   event: token    — { text: string }     — streamed text from the Keeper
 *   event: done     — { session_id, suggestions, tools_used }
 *   event: error    — { message: string }
 *
 * The client reads the stream with fetch + getReader, parses SSE
 * events, and updates the UI incrementally: status events show as
 * "Looking up X..." labels, tokens build the response word-by-word,
 * and done fires the suggestion chips.
 */
export async function POST(request: NextRequest) {
  let body: { session_id?: number; message?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const userMessage = String(body.message || "").trim();
  if (!userMessage) {
    return new Response(
      JSON.stringify({ error: "'message' is required." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Resolve the session.
  let sessionId = Number(body.session_id);
  let isNewSession = false;
  if (!Number.isFinite(sessionId) || sessionId <= 0) {
    sessionId = await createSession();
    isNewSession = true;
  } else {
    const existing = await getSession(sessionId);
    if (!existing) {
      return new Response(
        JSON.stringify({ error: `Session ${sessionId} not found.` }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // Load the conversation history BEFORE appending the new message.
  const priorMessages = await listMessages(sessionId);
  const history: ChatMessage[] = priorMessages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  history.push({ role: "user", content: userMessage });
  await appendMessage(sessionId, "user", userMessage);

  if (isNewSession) {
    const title =
      userMessage.length <= 60
        ? userMessage
        : userMessage.slice(0, 57) + "...";
    await setSessionTitle(sessionId, title);
  }

  // Set up the SSE stream.
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const sendSSE = (event: string, data: unknown) => {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    writer.write(encoder.encode(payload)).catch(() => {});
  };

  // Run the Keeper chat in the background, piping events to the
  // SSE stream. The response is returned immediately so the client
  // starts receiving events while the Keeper is still thinking.
  (async () => {
    try {
      const reply = await keeperChatStreaming(
        history,
        (event: StreamEvent) => {
          switch (event.type) {
            case "status":
              sendSSE("status", { message: event.message });
              break;
            case "token":
              sendSSE("token", { text: event.text });
              break;
            case "done":
              // handled below after persistence
              break;
            case "error":
              sendSSE("error", { message: event.message });
              break;
          }
        }
      );

      // Persist the assistant turn.
      await appendMessage(sessionId, "assistant", reply.text);

      // Feed event.
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

      // Send the done event with suggestions + metadata.
      sendSSE("done", {
        session_id: sessionId,
        suggestions: reply.suggestions,
        tools_used: reply.tools_used,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[keeper/chat] keeperChatStreaming failed:", err);
      sendSSE("error", { message });
    } finally {
      writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
