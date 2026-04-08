/**
 * KEEPER — direct chat with the Keeper agent.
 *
 * Phase 3 build. The Keeper is the steward's institutional collaborator.
 * It has read access to the institutional record (Turso + terminal DB)
 * and responds via streaming Claude API calls (or local Llama on Mac
 * Studio when MODEL_PROVIDER=ollama).
 *
 * Full implementation will include:
 *   - Streaming responses via Server-Sent Events or WebSocket
 *   - Conversation history persisted to keeper_sessions / keeper_messages
 *   - The Keeper's constitution loaded as system prompt
 *   - Typing indicator during generation
 *   - Session list (previous conversations browsable)
 */
export default function KeeperPage() {
  return (
    <section className="px-5 py-6">
      <div className="mb-8">
        <p className="label mb-2">MNA-KP-0001</p>
        <h1 className="display text-3xl">The Keeper</h1>
      </div>

      <div className="border border-border p-5">
        <p className="label mb-3">Phase 3</p>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Direct chat with the Keeper agent. Streaming responses via the
          model provider abstraction in lib/llm.ts — Anthropic now, Ollama
          when Mac Studio arrives. The Keeper reads the institutional
          record and speaks in its own voice as the steward&rsquo;s
          institutional collaborator.
        </p>
        <p className="label mt-5">Not yet implemented</p>
      </div>
    </section>
  );
}
