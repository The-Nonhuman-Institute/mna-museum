"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";

/**
 * KeeperChat — client component for the Keeper chat tab.
 *
 * State:
 *   - messages: the rolling transcript rendered on screen
 *   - sessionId: current session id (null until first user message)
 *   - input: the textarea value
 *   - sending: true while waiting on the Keeper's reply (typing dot)
 *   - error: last error message from the server, if any
 *
 * Behavior:
 *   - On mount, scrolls the message list to the bottom so the most
 *     recent turn is visible
 *   - Submit posts {session_id, message} to /api/keeper/chat
 *   - On success, appends both the user turn (echo) and the Keeper's
 *     reply, auto-scrolls to bottom
 *   - On failure, surfaces the error above the input
 *
 * Streaming is a follow-up — this first version is request/response.
 * The POST returns the full assistant message at once. Streaming adds
 * a better experience but doesn't change the contract with the
 * server, so we can upgrade in a separate commit.
 */

interface ChatMessage {
  id: number | string;
  role: "user" | "assistant";
  content: string;
}

export default function KeeperChat({
  initialSessionId,
  initialMessages,
}: {
  initialSessionId: number | null;
  initialMessages: ChatMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [sessionId, setSessionId] = useState<number | null>(initialSessionId);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    // Optimistically append the user message so the UI doesn't
    // stall waiting on the round-trip.
    const optimisticId = `opt-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: optimisticId, role: "user", content: text },
    ]);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/keeper/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          message: text,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        session_id: number;
        assistant: string;
      };
      setSessionId(data.session_id);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.assistant,
        },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      // Roll back the optimistic user message so the steward can
      // retry without it being duplicated when the retry succeeds.
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setInput(text); // restore the text into the input
    } finally {
      setSending(false);
    }
  }

  async function handleNewSession() {
    setMessages([]);
    setSessionId(null);
    setError(null);
  }

  return (
    // The authed layout's <main> already adds bottom padding for the
    // tab bar + safe area, so this inner container doesn't need its
    // own. It fills the remaining vertical space and splits into a
    // scrolling message list above a pinned input below.
    <div className="flex-1 flex flex-col min-h-0">
      {/* ── Message list ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-hide">
        {messages.length === 0 ? (
          <div className="border border-border p-5 mt-2">
            <p className="label mb-3">Begin a conversation</p>
            <p className="text-sm text-foreground/70 leading-relaxed">
              The Keeper reads the Museum&rsquo;s institutional record on
              every turn — recent Council verdicts, canon counts,
              pending approvals, active network originators. Ask it
              what the institution is doing, how the Council is
              calibrating, or what needs your attention.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {messages.map((m) => (
              <li key={m.id}>
                <p className="label mb-1">
                  {m.role === "user" ? "Steward" : "The Keeper"}
                </p>
                <div
                  className={
                    m.role === "user"
                      ? "text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap"
                      : "text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap font-serif"
                  }
                >
                  {m.content}
                </div>
              </li>
            ))}
            {sending && (
              <li>
                <p className="label mb-1">The Keeper</p>
                <div className="flex items-center gap-2 h-5">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse" />
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </li>
            )}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Error banner ─────────────────────────────────────────── */}
      {error && (
        <div className="mx-5 mb-2 border border-error p-3">
          <p className="label mb-1">Error</p>
          <p className="text-xs text-error leading-relaxed">{error}</p>
        </div>
      )}

      {/* ── Input ────────────────────────────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-border px-5 py-3 flex items-end gap-2 bg-background"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter submits; plain Enter adds a newline.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit(e as unknown as FormEvent);
            }
          }}
          placeholder="Ask the Keeper…"
          rows={1}
          className="flex-1 bg-surface border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:border-foreground/40 resize-none min-h-[36px] max-h-[120px]"
          disabled={sending}
        />
        <div className="flex flex-col gap-1">
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="label px-3 py-2 border border-border hover:border-foreground/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {sending ? "…" : "Send"}
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleNewSession}
              disabled={sending}
              className="label text-[8px] text-muted hover:text-foreground transition-colors disabled:opacity-30"
            >
              New
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
