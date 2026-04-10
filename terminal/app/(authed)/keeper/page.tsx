import {
  listRecentSessions,
  listMessages,
  type KeeperMessage,
  type KeeperSession,
} from "@/lib/keeper-sessions";
import KeeperChat from "@/components/KeeperChat";

/**
 * KEEPER — direct chat with MNA-KP-0001.
 *
 * Loads the most recent session + full session history for the sidebar.
 * The KeeperChat client component handles input, streaming, sessions,
 * and the session-picker UI.
 */
export const dynamic = "force-dynamic";

export default async function KeeperPage() {
  let initialSessionId: number | null = null;
  let initialMessages: KeeperMessage[] = [];
  let sessions: KeeperSession[] = [];

  try {
    sessions = await listRecentSessions(30);
    if (sessions.length > 0) {
      initialSessionId = sessions[0].id;
      initialMessages = await listMessages(initialSessionId);
    }
  } catch (err) {
    console.error("[keeper page] failed to load sessions:", err);
  }

  return (
    <section className="flex flex-col h-full">
      <KeeperChat
        initialSessionId={initialSessionId}
        initialMessages={initialMessages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
          }))}
        initialSessions={sessions.map((s) => ({
          id: s.id,
          title: s.title,
          started_at: s.started_at,
          message_count: s.message_count,
        }))}
      />
    </section>
  );
}
