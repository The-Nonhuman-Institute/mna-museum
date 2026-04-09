import {
  listRecentSessions,
  listMessages,
  type KeeperMessage,
} from "@/lib/keeper-sessions";
import KeeperChat from "@/components/KeeperChat";

/**
 * KEEPER — direct chat with MNA-KP-0001.
 *
 * The page itself is a server component that loads the most recent
 * session (if any) along with its messages, then hands everything to
 * the KeeperChat client component which handles input, sending,
 * rendering, and state.
 *
 * On first visit (no sessions yet) we start fresh — the first
 * message the steward sends creates a new session on the server.
 *
 * Per the session-scoped architecture: chat transcripts live in the
 * terminal's own Turso DB (keeper_sessions / keeper_messages), never
 * in the institutional record. Only compact KEEPER_TURN events land
 * in the Feed so the steward can see "I had a conversation" without
 * the content being surfaced publicly.
 */
export const dynamic = "force-dynamic";

export default async function KeeperPage() {
  // Load the most recent session and any messages in it so the chat
  // resumes where the steward left off instead of starting from
  // scratch on every visit.
  let initialSessionId: number | null = null;
  let initialMessages: KeeperMessage[] = [];
  try {
    const recent = await listRecentSessions(1);
    if (recent.length > 0) {
      initialSessionId = recent[0].id;
      initialMessages = await listMessages(initialSessionId);
    }
  } catch (err) {
    console.error("[keeper page] failed to load initial session:", err);
  }

  return (
    <section className="flex flex-col h-full">
      <div className="px-5 pt-6 pb-4 border-b border-border">
        <p className="label mb-2">MNA-KP-0001</p>
        <h1 className="display text-3xl">The Keeper</h1>
      </div>
      <KeeperChat
        initialSessionId={initialSessionId}
        initialMessages={initialMessages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
          }))}
      />
    </section>
  );
}
