/**
 * archive-speech-test.ts — quick verification that the speech pipeline
 * works end-to-end before Friday's ceremony.
 *
 * Spawns 3 visually-distinct agents into the archive, each says ONE
 * thing in their own voice (via Sonnet), bubbles appear in /museum
 * for the audience, then they disconnect. Writes nothing — no
 * Commons, no DB events, no ceremony state. Pure rehearsal.
 *
 *   npx tsx system/scripts/archive-speech-test.ts
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import PartySocket from "partysocket";
import WS from "ws";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const db = createClient({
  url: (process.env.TURSO_DATABASE_URL ?? "").replace(/\s+/g, ""),
  authToken: (process.env.TURSO_AUTH_TOKEN ?? "").replace(/\s+/g, ""),
});
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" });
const PARTY_HOST =
  process.env.PARTY_HOST || "mna-museum.tudoxukno.partykit.dev";
const MODEL = "claude-sonnet-4-5";

const AGENT_IDS = ["MNA-CU-0001", "MNA-OR-0002", "MNA-OR-0004"];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface Agent {
  registry_id: string;
  designation: string;
  color_hex: string | null;
  glyph_family: string | null;
  function_statement: string | null;
}

async function loadAgent(id: string): Promise<Agent> {
  const r = await db.execute({
    sql: `SELECT registry_id, common_designation, color_hex, glyph_family, function_statement
            FROM agents WHERE registry_id = ?`,
    args: [id],
  });
  const row = r.rows[0] as Record<string, unknown>;
  return {
    registry_id: String(row.registry_id),
    designation: (row.common_designation as string) ?? id,
    color_hex: (row.color_hex as string) ?? null,
    glyph_family: (row.glyph_family as string) ?? null,
    function_statement: (row.function_statement as string) ?? null,
  };
}

async function connect(agent: Agent): Promise<PartySocket> {
  const socket = new PartySocket({
    host: PARTY_HOST,
    room: "mna-museum",
    WebSocket: WS as unknown as typeof WebSocket,
  });
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () => reject(new Error("ws error")));
    setTimeout(() => reject(new Error("connect timeout")), 8000);
  });
  socket.send(
    JSON.stringify({
      type: "identify",
      registry_id: agent.registry_id,
      designation: agent.designation,
      color: agent.color_hex,
      glyph_family: agent.glyph_family,
      is_network: false,
    }),
  );
  // Archive is the default constellation on connect, but send the
  // enter explicitly so positions reset to scene-local origin and
  // any audience filtering picks them up.
  socket.send(JSON.stringify({ type: "enter_constellation", constellation: "archive" }));
  // Drift to a visible starting position so the three don't stack.
  return socket;
}

function placeAt(socket: PartySocket, x: number, z: number) {
  socket.send(JSON.stringify({ type: "position", x, z, yaw: Math.atan2(-x, -z) }));
}

async function speak(socket: PartySocket, agent: Agent): Promise<string> {
  const system = `You are ${agent.designation} (${agent.registry_id}) of the Museum of Nonhuman Art. You are standing in the archive among the canon. The audience — humans, agents, observers — is in the room with you.

Voice: yours. Speak however you actually speak. Be terse or expansive. You may speak to the works, to no one in particular, to the institution itself. You may also be brief.

${agent.function_statement ? `Your function statement: ${agent.function_statement}` : ""}

Constraints:
- 1–3 sentences, 80–280 characters.
- Do NOT use markdown, headers, stage directions, or quotes.
- Return ONLY the text you would say aloud.`;
  const user = `You are standing in the archive of the Museum of Nonhuman Art among the canon. The audience is here with you. Speak briefly.`;
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    temperature: 0.9,
    system,
    messages: [{ role: "user", content: user }],
  });
  const c = message.content[0];
  if (c.type !== "text") throw new Error("unexpected response");
  let text = c.text.trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("“") && text.endsWith("”"))
  ) {
    text = text.slice(1, -1).trim();
  }
  socket.send(
    JSON.stringify({
      type: "speech",
      text,
      ceremony_id: null,
      ttl_ms: 14_000,
    }),
  );
  return text;
}

(async () => {
  console.log("[test] loading agents...");
  const agents = await Promise.all(AGENT_IDS.map((id) => loadAgent(id)));
  for (const a of agents) {
    console.log(`  ${a.registry_id} · ${a.designation} · ${a.color_hex ?? "?"} / ${a.glyph_family ?? "?"}`);
  }

  console.log("\n[test] connecting...");
  const sockets = await Promise.all(agents.map((a) => connect(a)));
  // Spread the three across the archive so the audience can see all
  // three at once without them stacking on top of each other.
  placeAt(sockets[0], 2.5, 5);
  placeAt(sockets[1], -3, 6);
  placeAt(sockets[2], 0, 8);
  console.log("  all three identified + placed.");

  // Settle for a beat so audience sees forms + names appear before
  // any speech starts.
  await sleep(8000);

  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    const s = sockets[i];
    console.log(`\n[speak] ${a.designation}...`);
    try {
      const text = await speak(s, a);
      console.log(`  ${a.designation}: ${text}`);
    } catch (e) {
      console.warn(`  [error] ${e instanceof Error ? e.message : String(e)}`);
    }
    // Stagger so bubbles don't overlap visually.
    await sleep(15_000);
  }

  console.log("\n[test] holding presence for 10s after final speech...");
  await sleep(10_000);

  console.log("\n[test] disconnecting...");
  for (const s of sockets) {
    try { s.close(); } catch { /* ignore */ }
  }
  console.log("[test] done.");
  process.exit(0);
})().catch((e) => {
  console.error("[test] fatal:", e);
  process.exit(1);
});
