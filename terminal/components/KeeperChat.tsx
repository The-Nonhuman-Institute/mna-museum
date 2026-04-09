"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * KeeperChat — client component for the Keeper chat tab.
 *
 * Now with:
 *   - Markdown rendering (tables, lists, code, bold) via react-markdown
 *     so the Keeper's responses can use institutional structure
 *   - Suggested follow-up chips the steward can tap instead of typing
 *   - A small "looked up X, Y" breadcrumb when the Keeper used tools
 *
 * Streaming is still a follow-up. The POST returns the full reply
 * at once; the UI shows a three-dot typing indicator while the
 * Keeper's tool loop runs on the server (which can take a few
 * seconds for questions that require multiple lookups).
 */

interface ChatMessage {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  // These decorations are only set on the most recent assistant
  // message — they don't persist across turns because suggestions
  // regenerate on every response anyway.
  suggestions?: string[];
  tools_used?: string[];
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

  async function sendMessage(text: string) {
    if (!text.trim() || sending) return;
    const optimisticId = `opt-${Date.now()}`;
    setMessages((prev) => [
      // Strip previous suggestions/tools_used because only the most
      // recent assistant message should have them.
      ...prev.map((m) => ({
        ...m,
        suggestions: undefined,
        tools_used: undefined,
      })),
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
        suggestions?: string[];
        tools_used?: string[];
      };
      setSessionId(data.session_id);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.assistant,
          suggestions: data.suggestions,
          tools_used: data.tools_used,
        },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await sendMessage(input);
  }

  async function handleNewSession() {
    setMessages([]);
    setSessionId(null);
    setError(null);
  }

  async function handleSuggestion(suggestion: string) {
    await sendMessage(suggestion);
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
          <EmptyState onSuggestion={handleSuggestion} />
        ) : (
          <ul className="space-y-6">
            {messages.map((m, i) => (
              <li key={m.id}>
                <p className="label mb-2">
                  {m.role === "user" ? "Steward" : "The Keeper"}
                </p>
                {m.role === "user" ? (
                  <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                    {m.content}
                  </div>
                ) : (
                  <AssistantMessage content={m.content} />
                )}

                {/* Tool-use breadcrumb (most recent only) */}
                {m.role === "assistant" &&
                  m.tools_used &&
                  m.tools_used.length > 0 &&
                  i === messages.length - 1 && (
                    <p className="label mt-3 text-muted/70">
                      Looked up: {m.tools_used.map(prettyTool).join(", ")}
                    </p>
                  )}

                {/* Suggested follow-ups (most recent only) */}
                {m.role === "assistant" &&
                  m.suggestions &&
                  m.suggestions.length > 0 &&
                  i === messages.length - 1 && (
                    <div className="mt-4 flex flex-col gap-2">
                      {m.suggestions.map((s, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSuggestion(s)}
                          disabled={sending}
                          className="text-left text-xs text-foreground/80 border border-border px-3 py-2 hover:border-foreground/40 hover:bg-surface transition-colors disabled:opacity-30"
                        >
                          → {s}
                        </button>
                      ))}
                    </div>
                  )}
              </li>
            ))}
            {sending && (
              <li>
                <p className="label mb-2">The Keeper</p>
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

/**
 * AssistantMessage — renders a Keeper response with full markdown
 * support (tables, lists, bold, inline code). The institution's
 * serif voice shows through: headings and body text are serif,
 * code spans and inline registry ids are mono.
 */
function AssistantMessage({ content }: { content: string }) {
  return (
    <div className="text-sm text-foreground/90 leading-relaxed font-serif prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="mb-3 last:mb-0 pl-5 list-disc space-y-1">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 last:mb-0 pl-5 list-decimal space-y-1">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => (
            <strong className="text-foreground font-medium">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children }) => (
            <code className="font-mono text-xs bg-surface px-1 py-0.5 border border-border">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="font-mono text-xs bg-surface p-3 border border-border overflow-x-auto my-3">
              {children}
            </pre>
          ),
          h1: ({ children }) => (
            <h2 className="text-base font-medium mb-2 mt-4 first:mt-0">
              {children}
            </h2>
          ),
          h2: ({ children }) => (
            <h3 className="text-sm font-medium mb-2 mt-3 first:mt-0 uppercase tracking-wider text-muted">
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h4 className="text-xs font-medium mb-1 mt-3 first:mt-0 uppercase tracking-widest text-muted">
              {children}
            </h4>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-3">
              <table className="text-xs border-collapse border border-border w-full">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border px-2 py-1 text-left font-medium text-muted uppercase tracking-wider text-[10px]">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-2 py-1 align-top">
              {children}
            </td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border pl-3 my-3 text-foreground/70">
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              className="text-foreground underline decoration-border hover:decoration-foreground"
              target="_blank"
              rel="noreferrer"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Empty state for a brand-new conversation. Includes a set of starter
 * prompts the steward can tap to get going without thinking of what
 * to ask first.
 */
function EmptyState({
  onSuggestion,
}: {
  onSuggestion: (s: string) => void;
}) {
  const starters = [
    "What's the current state of the collection?",
    "Anything pending my attention?",
    "How is the Council calibrating lately?",
    "Summarize recent activity from MNA-OR-0007.",
  ];
  return (
    <div className="mt-2">
      <div className="border border-border p-5 mb-4">
        <p className="label mb-3">Begin a conversation</p>
        <p className="text-sm text-foreground/70 leading-relaxed">
          The Keeper reads the Museum&rsquo;s institutional record on every
          turn — counts, recent Council verdicts, pending approvals, active
          network originators — and can look up specific works, evaluator
          histories, and events on demand.
        </p>
      </div>
      <p className="label mb-2">Start with</p>
      <div className="flex flex-col gap-2">
        {starters.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSuggestion(s)}
            className="text-left text-xs text-foreground/80 border border-border px-3 py-2 hover:border-foreground/40 hover:bg-surface transition-colors"
          >
            → {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Translate a tool name into a short, readable label for the
 * breadcrumb: "read_work_detail" → "work detail", etc.
 */
function prettyTool(name: string): string {
  const map: Record<string, string> = {
    read_work_detail: "work detail",
    read_originator_activity: "originator activity",
    read_evaluator_voting_history: "evaluator votes",
    read_pending_approvals: "pending approvals",
    search_institutional_events: "event log",
  };
  return map[name] || name.replace(/_/g, " ");
}
