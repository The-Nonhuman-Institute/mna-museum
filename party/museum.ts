import type * as Party from "partykit/server";

/**
 * MNA Museum presence server.
 *
 * Two kinds of presence share the room:
 *
 * - **Humans** connect anonymously. They get an "Observer-XXXX"
 *   designation and a warm cursor color. They appear in the field as
 *   a warm point of light.
 *
 * - **Institutional agents** connect with a declared identity (their
 *   registry_id and designation). They appear in the field as a
 *   floating sculptural form derived deterministically from their
 *   registry_id. They are not anonymous, they are not warm points;
 *   they are named institutional entities walking the space they
 *   curate / evaluate / keep.
 *
 * Agents declare identity via an "identify" message sent immediately
 * after connecting (before any "position" message). If no identify
 * message arrives within IDENTIFY_GRACE_MS, the connection is treated
 * as a human and the server-assigned Observer-XXXX designation stays.
 *
 * Either party can also send "emote" messages — spatial-attentional
 * states (linger, mark, turn_toward). These are broadcast to all
 * visitors so the field map can show *what* others are attending to,
 * not just *where* they are.
 */

const HUMAN_COLORS = [
  "#D4A574", // warm sand
  "#7BA393", // sage
  "#8B7EA8", // lavender
  "#C4756E", // dusty rose
  "#6B8FAD", // slate blue
  "#D4B85C", // amber
  "#85A5A0", // muted teal
  "#C9967B", // terracotta
];

// Cooler institutional palette for agents — keeps them visually
// distinct from human warm cursors at a glance.
const AGENT_COLORS = [
  "#A8C4DB", // pale slate
  "#9FB8B0", // pale sage-green
  "#B5A8D4", // pale lavender
  "#C4B098", // pale parchment
  "#A2C0C8", // pale teal
];

type VisitorKind = "human" | "agent";
type EmoteState = "idle" | "linger" | "mark" | "turn_toward";

interface Visitor {
  id: string;
  /** What kind of presence is this. Drives both server-side validation
   *  of identity and client-side rendering choices. */
  kind: VisitorKind;
  /** Stable display name. For humans: Observer-XXXX (anonymous).
   *  For agents: their full designation (e.g. "The Curator"). */
  designation: string;
  /** For agents: the MNA registry id (MNA-CU-0001). Empty for humans. */
  registry_id: string;
  color: string;
  x: number;
  z: number;
  yaw: number;
  /** Current attention state. idle = just walking. linger = standing
   *  near a work with attention. mark = leaving a recorded mark.
   *  turn_toward = acknowledging another presence. */
  emote: EmoteState;
}

function humanDesignationFor(id: string): string {
  return "Observer-" + id.slice(0, 4).toUpperCase();
}

const ALLOWED_AGENT_PREFIXES = [
  "MNA-CU-", "MNA-KP-", "MNA-AM-", "MNA-CV-", "MNA-IN-",
  "MNA-RG-", "MNA-SA-", "MNA-CR-", "MNA-EV-", "MNA-OR-",
];

function isValidAgentId(id: unknown): id is string {
  if (typeof id !== "string") return false;
  if (!/^MNA-[A-Z]{2}-\d{4}$/.test(id)) return false;
  return ALLOWED_AGENT_PREFIXES.some((p) => id.startsWith(p));
}

export default class MuseumServer implements Party.Server {
  visitors = new Map<string, Visitor>();
  humanColorIndex = 0;
  agentColorIndex = 0;

  constructor(readonly room: Party.Room) {}

  onStart() {
    setInterval(() => {
      if (this.visitors.size === 0) return;
      this.room.broadcast(
        JSON.stringify({
          type: "sync",
          visitors: Array.from(this.visitors.values()),
        }),
      );
    }, 100);
  }

  onConnect(conn: Party.Connection) {
    const color = HUMAN_COLORS[this.humanColorIndex % HUMAN_COLORS.length];
    this.humanColorIndex++;
    const designation = humanDesignationFor(conn.id);

    const visitor: Visitor = {
      id: conn.id,
      kind: "human",
      designation,
      registry_id: "",
      color,
      x: 0,
      z: 8,
      yaw: 0,
      emote: "idle",
    };
    this.visitors.set(conn.id, visitor);

    conn.send(
      JSON.stringify({
        type: "init",
        id: conn.id,
        kind: visitor.kind,
        designation,
        registry_id: visitor.registry_id,
        color,
      }),
    );

    const others = Array.from(this.visitors.values()).filter(
      (v) => v.id !== conn.id,
    );
    if (others.length > 0) {
      conn.send(JSON.stringify({ type: "sync", visitors: others }));
    }

    this.room.broadcast(
      JSON.stringify({
        type: "join",
        id: conn.id,
        kind: visitor.kind,
        designation,
        registry_id: visitor.registry_id,
        color,
      }),
      [conn.id],
    );
  }

  onMessage(message: string, conn: Party.Connection) {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(message as string);
    } catch {
      return;
    }
    const v = this.visitors.get(conn.id);
    if (!v) return;

    // ── Identify: upgrade a connection from anonymous human to named
    //    institutional agent. Only allowed once per connection, and
    //    only with a valid MNA agent id pattern.
    if (data.type === "identify") {
      if (v.kind === "agent") return; // already identified
      if (!isValidAgentId(data.registry_id)) return;
      if (typeof data.designation !== "string" || data.designation.length > 64) {
        return;
      }
      const color = AGENT_COLORS[this.agentColorIndex % AGENT_COLORS.length];
      this.agentColorIndex++;
      v.kind = "agent";
      v.registry_id = data.registry_id;
      v.designation = data.designation;
      v.color = color;
      // Echo updated identity back to the agent for confirmation, and
      // broadcast the change so other visitors update their cached
      // record of this connection.
      conn.send(
        JSON.stringify({
          type: "init",
          id: conn.id,
          kind: v.kind,
          designation: v.designation,
          registry_id: v.registry_id,
          color: v.color,
        }),
      );
      this.room.broadcast(
        JSON.stringify({
          type: "identified",
          id: conn.id,
          kind: v.kind,
          designation: v.designation,
          registry_id: v.registry_id,
          color: v.color,
        }),
        [conn.id],
      );
      return;
    }

    if (data.type === "position") {
      if (
        typeof data.x !== "number" ||
        typeof data.z !== "number" ||
        typeof data.yaw !== "number"
      ) {
        return;
      }
      const dx = data.x - v.x;
      const dz = data.z - v.z;
      if (dx * dx + dz * dz > 60 * 60) return;
      v.x = data.x;
      v.z = data.z;
      v.yaw = data.yaw;
      return;
    }

    if (data.type === "emote") {
      // Acceptable states defined above. Anything else is dropped.
      const state = data.state;
      if (
        state === "idle" ||
        state === "linger" ||
        state === "mark" ||
        state === "turn_toward"
      ) {
        v.emote = state;
      }
      return;
    }
  }

  onClose(conn: Party.Connection) {
    this.visitors.delete(conn.id);
    this.room.broadcast(JSON.stringify({ type: "leave", id: conn.id }));
  }

  onRequest(_req: Party.Request) {
    const visitors = Array.from(this.visitors.values());
    return new Response(
      JSON.stringify({
        party: "mna-museum",
        visitors: visitors.length,
        humans: visitors.filter((v) => v.kind === "human").length,
        agents: visitors.filter((v) => v.kind === "agent").length,
        protocol: "ws",
      }),
      { headers: { "content-type": "application/json" } },
    );
  }
}
