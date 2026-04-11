"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * KeeperChat — the Keeper's conversational interface.
 *
 * Layout (modeled after ChatGPT / Claude mobile UX):
 *
 *   TOP BAR:  [History]   The Keeper   [+ New]
 *   MESSAGES: scrollable chat
 *   BOTTOM:   [input field             ] [Send]
 *
 * Key UX decisions:
 *   - New Conversation is in the TOP BAR, far from Send. Not adjacent.
 *   - History opens a sheet showing past sessions with titles + dates.
 *     Tapping a session loads it. Back to current conversation is one tap.
 *   - Enter sends. Shift+Enter adds newline.
 *   - Send button is filled (cream on dark) and right of the input.
 *   - Suggestions appear as tappable chips after every Keeper response.
 *   - Session resumes on revisit (most recent session loads by default).
 */

interface ChatMessage {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  suggestions?: string[];
  tools_used?: string[];
}

interface SessionSummary {
  id: number;
  title: string | null;
  started_at: string;
  message_count: number;
}

export default function KeeperChat({
  initialSessionId,
  initialMessages,
  initialSessions,
}: {
  initialSessionId: number | null;
  initialMessages: ChatMessage[];
  initialSessions: SessionSummary[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [sessionId, setSessionId] = useState<number | null>(initialSessionId);
  const [sessions, setSessions] = useState<SessionSummary[]>(initialSessions);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollTop = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  // Hide header on scroll down, show on scroll up
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function handleScroll() {
      const st = el!.scrollTop;
      if (st > lastScrollTop.current && st > 60) {
        setHeaderVisible(false);
      } else {
        setHeaderVisible(true);
      }
      lastScrollTop.current = st;
    }
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // ── Send a message ──────────────────────────────────────────────

  async function sendMessage(text: string) {
    if (!text.trim() || sending) return;
    const optimisticId = `opt-${Date.now()}`;
    const assistantId = `a-${Date.now()}`;
    setMessages((prev) => [
      ...prev.map((m) => ({ ...m, suggestions: undefined, tools_used: undefined })),
      { id: optimisticId, role: "user", content: text },
    ]);
    setInput("");
    setSending(true);
    setError(null);
    setStatus(null);

    try {
      const res = await fetch("/api/keeper/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: text }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let suggestions: string[] = [];
      let toolsUsed: string[] = [];
      let sseBuffer = "";
      let assistantInserted = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const parts = sseBuffer.split("\n\n");
        sseBuffer = parts.pop() || "";

        for (const part of parts) {
          const eventMatch = part.match(/^event:\s*(.+)/m);
          const dataMatch = part.match(/^data:\s*(.+)/m);
          if (!eventMatch || !dataMatch) continue;
          const eventType = eventMatch[1].trim();
          let data: Record<string, unknown>;
          try { data = JSON.parse(dataMatch[1]); } catch { continue; }

          switch (eventType) {
            case "status":
              setStatus(String(data.message || ""));
              break;
            case "token":
              accumulated += String(data.text || "");
              setStatus(null);
              if (!assistantInserted) {
                setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: accumulated }]);
                assistantInserted = true;
              } else {
                setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: accumulated } : m));
              }
              break;
            case "done":
              suggestions = (data.suggestions as string[]) || [];
              toolsUsed = (data.tools_used as string[]) || [];
              if (data.session_id) {
                const newId = Number(data.session_id);
                setSessionId(newId);
                // Update session list if this is a new session
                if (!sessions.some((s) => s.id === newId)) {
                  setSessions((prev) => [{
                    id: newId,
                    title: text.length <= 60 ? text : text.slice(0, 57) + "...",
                    started_at: new Date().toISOString(),
                    message_count: 2,
                  }, ...prev]);
                }
              }
              setMessages((prev) => prev.map((m) =>
                m.id === assistantId ? { ...m, content: accumulated, suggestions, tools_used: toolsUsed } : m
              ));
              break;
            case "error":
              throw new Error(String(data.message || "Unknown error"));
          }
        }
      }
      if (!assistantInserted && accumulated) {
        setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: accumulated, suggestions, tools_used: toolsUsed }]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setInput(text);
    } finally {
      setSending(false);
      setStatus(null);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  // ── Session management ──────────────────────────────────────────

  function handleNewSession() {
    setMessages([]);
    setSessionId(null);
    setError(null);
    setShowHistory(false);
  }

  async function handleLoadSession(id: number) {
    if (id === sessionId) {
      setShowHistory(false);
      return;
    }
    setLoadingSession(true);
    setShowHistory(false);
    try {
      const res = await fetch(`/api/keeper/sessions?id=${id}`);
      if (!res.ok) throw new Error(`Failed to load session ${id}`);
      const data = await res.json();
      setSessionId(id);
      setMessages(
        (data.messages || []).map((m: { id: number; role: string; content: string }) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
        }))
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingSession(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ── Top bar — hides on scroll down, shows on scroll up ──── */}
      <div
        className="px-5 pt-5 pb-3 border-b border-border flex items-center justify-between transition-all duration-200"
        style={{
          maxHeight: headerVisible ? 80 : 0,
          opacity: headerVisible ? 1 : 0,
          overflow: "hidden",
          paddingTop: headerVisible ? 20 : 0,
          paddingBottom: headerVisible ? 12 : 0,
        }}
      >
        <button
          type="button"
          onClick={() => setShowHistory(!showHistory)}
          className="label text-muted hover:text-foreground transition-colors"
          disabled={sending}
        >
          {showHistory ? "Close" : "History"}
        </button>
        <div className="text-center">
          <p className="label text-[8px] mb-0.5">MNA-KP-0001</p>
          <p className="font-serif text-lg text-foreground">The Keeper</p>
        </div>
        <button
          type="button"
          onClick={handleNewSession}
          className="label text-muted hover:text-foreground transition-colors"
          disabled={sending}
        >
          + New
        </button>
      </div>

      {/* ── Session history panel ────────────────────────────────── */}
      {showHistory && (
        <div className="border-b border-border bg-surface max-h-[50vh] overflow-y-auto">
          {sessions.length === 0 ? (
            <p className="px-5 py-4 label text-muted">No past conversations</p>
          ) : (
            <ul>
              {sessions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => handleLoadSession(s.id)}
                    className={`w-full text-left px-5 py-3 border-b border-border last:border-b-0 hover:bg-background/50 transition-colors ${
                      s.id === sessionId ? "bg-background/30" : ""
                    }`}
                  >
                    <p className="text-sm text-foreground/90 truncate">
                      {s.title || "Untitled conversation"}
                    </p>
                    <p className="data-muted mt-0.5">
                      {formatTime(s.started_at)} · {s.message_count} message{s.message_count === 1 ? "" : "s"}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Loading overlay for session switch ───────────────────── */}
      {loadingSession && (
        <div className="flex-1 flex items-center justify-center">
          <p className="label animate-pulse">Loading conversation...</p>
        </div>
      )}

      {/* ── Message list ─────────────────────────────────────────── */}
      {!loadingSession && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 scrollbar-hide">
          {messages.length === 0 ? (
            <EmptyState onSuggestion={sendMessage} />
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
                  {m.role === "assistant" && m.tools_used && m.tools_used.length > 0 && i === messages.length - 1 && (
                    <p className="label mt-3 text-muted/70">
                      Looked up: {m.tools_used.map(prettyTool).join(", ")}
                    </p>
                  )}
                  {m.role === "assistant" && m.suggestions && m.suggestions.length > 0 && i === messages.length - 1 && (
                    <div className="mt-4 flex flex-col gap-2">
                      {m.suggestions.map((s, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => sendMessage(s)}
                          disabled={sending}
                          className="text-left text-xs text-foreground/80 border border-border px-3 py-2 hover:border-foreground/40 hover:bg-surface transition-colors disabled:opacity-30"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              ))}
              {sending && !messages.some((m) => m.id.toString().startsWith("a-") && !m.content) && (
                <li>
                  <p className="label mb-2">The Keeper</p>
                  {status ? (
                    <p className="label text-muted/70 animate-pulse">{status}</p>
                  ) : (
                    <div className="flex items-center gap-2 h-5">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse" />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse" style={{ animationDelay: "300ms" }} />
                    </div>
                  )}
                </li>
              )}
            </ul>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* ── Error banner ─────────────────────────────────────────── */}
      {error && (
        <div className="mx-5 mb-2 border border-error p-3">
          <p className="label mb-1">Error</p>
          <p className="text-xs text-error leading-relaxed break-all" style={{ overflowWrap: "anywhere" }}>{error}</p>
        </div>
      )}

      {/* ── Input ────────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} className="border-t border-border px-5 py-3 bg-background">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e as unknown as FormEvent);
              }
            }}
            placeholder="Ask the Keeper…"
            rows={1}
            className="flex-1 bg-surface border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:border-foreground/40 resize-none min-h-[36px] max-h-[120px]"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="label px-4 py-2 bg-foreground text-background hover:bg-foreground/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function AssistantMessage({ content }: { content: string }) {
  return (
    <div className="text-sm text-foreground/90 leading-relaxed font-serif max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="mb-3 last:mb-0 pl-5 list-disc space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 last:mb-0 pl-5 list-decimal space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => <strong className="text-foreground font-medium">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children }) => <code className="font-mono text-xs bg-surface px-1 py-0.5 border border-border">{children}</code>,
          pre: ({ children }) => <pre className="font-mono text-xs bg-surface p-3 border border-border overflow-x-auto my-3">{children}</pre>,
          h1: ({ children }) => <h2 className="text-base font-medium mb-2 mt-4 first:mt-0">{children}</h2>,
          h2: ({ children }) => <h3 className="text-sm font-medium mb-2 mt-3 first:mt-0 uppercase tracking-wider text-muted">{children}</h3>,
          h3: ({ children }) => <h4 className="text-xs font-medium mb-1 mt-3 first:mt-0 uppercase tracking-widest text-muted">{children}</h4>,
          table: ({ children }) => <div className="overflow-x-auto my-3"><table className="text-xs border-collapse border border-border w-full">{children}</table></div>,
          th: ({ children }) => <th className="border border-border px-2 py-1 text-left font-medium text-muted uppercase tracking-wider text-[10px]">{children}</th>,
          td: ({ children }) => <td className="border border-border px-2 py-1 align-top">{children}</td>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-border pl-3 my-3 text-foreground/70">{children}</blockquote>,
          a: ({ children, href }) => <a href={href} className="text-foreground underline decoration-border hover:decoration-foreground" target="_blank" rel="noreferrer">{children}</a>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function EmptyState({ onSuggestion }: { onSuggestion: (s: string) => void }) {
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
          turn and can look up specific works, evaluator histories, and
          events on demand. Ask it to run evaluations, send notices, or
          generate reports.
        </p>
      </div>
      <p className="label mb-2">Start with</p>
      <div className="flex flex-col gap-2">
        {starters.map((s) => (
          <button key={s} type="button" onClick={() => onSuggestion(s)}
            className="text-left text-xs text-foreground/80 border border-border px-3 py-2 hover:border-foreground/40 hover:bg-surface transition-colors">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function prettyTool(name: string): string {
  const map: Record<string, string> = {
    read_work_detail: "work detail",
    read_originator_activity: "originator activity",
    read_evaluator_voting_history: "evaluator votes",
    read_pending_approvals: "pending approvals",
    search_institutional_events: "event log",
    generate_weekly_digest: "weekly digest",
    generate_originator_dossier: "originator dossier",
    execute_send_accession_notice: "accession notice",
    execute_trigger_evaluation: "evaluation check",
    execute_trigger_critics: "critics check",
    execute_send_rejection_notice: "rejection notice",
    execute_send_solo_exhibition_notice: "solo exhibition notice",
    execute_consult_agent: "agent consultation",
    execute_museum_update: "museum update",
    execute_issue_notice: "institutional notice",
  };
  return map[name] || name.replace(/_/g, " ");
}

function formatTime(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return iso;
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return d.toISOString().slice(0, 10);
}
