import type * as Party from "partykit/server";

const COLORS = [
  "#D4A574", // warm sand
  "#7BA393", // sage
  "#8B7EA8", // lavender
  "#C4756E", // dusty rose
  "#6B8FAD", // slate blue
  "#D4B85C", // amber
  "#85A5A0", // muted teal
  "#C9967B", // terracotta
];

interface Visitor {
  id: string;
  designation: string;
  color: string;
  x: number;
  z: number;
  yaw: number;
}

function designationFor(id: string): string {
  // Stable per connection; visible to other visitors as the anonymous
  // public name (e.g. "Observer-7F4A"). No identity, no persistence.
  return "Observer-" + id.slice(0, 4).toUpperCase();
}

/**
 * MNA Museum presence server. One PartyKit party per room (we use a
 * single shared room "mna-museum") so every visitor sees every other.
 *
 * Class-based style is required for v0.0.115 to correctly route
 * WebSocket-upgrade requests to onConnect — the module-style export
 * fell through to onRequest, which doesn't exist, and Cloudflare
 * surfaced a 522.
 */
export default class MuseumServer implements Party.Server {
  visitors = new Map<string, Visitor>();
  colorIndex = 0;

  constructor(readonly room: Party.Room) {}

  onStart() {
    // Broadcast full visitor state at 10Hz. Cheap — the party only
    // holds in-memory state and serializes a small JSON message.
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
    const color = COLORS[this.colorIndex % COLORS.length];
    this.colorIndex++;
    const designation = designationFor(conn.id);

    const visitor: Visitor = {
      id: conn.id,
      designation,
      color,
      x: 0,
      z: 8,
      yaw: 0,
    };
    this.visitors.set(conn.id, visitor);

    // Tell the new visitor who they are.
    conn.send(
      JSON.stringify({ type: "init", id: conn.id, designation, color }),
    );

    // Snapshot of everyone else so they render immediately.
    const others = Array.from(this.visitors.values()).filter(
      (v) => v.id !== conn.id,
    );
    if (others.length > 0) {
      conn.send(JSON.stringify({ type: "sync", visitors: others }));
    }

    // Notify others. Second arg is an exclude-list.
    this.room.broadcast(
      JSON.stringify({ type: "join", id: conn.id, designation, color }),
      [conn.id],
    );
  }

  onMessage(message: string, conn: Party.Connection) {
    try {
      const data = JSON.parse(message as string);
      if (data.type !== "position") return;
      const v = this.visitors.get(conn.id);
      if (!v) return;
      if (
        typeof data.x !== "number" ||
        typeof data.z !== "number" ||
        typeof data.yaw !== "number"
      ) {
        return;
      }
      // Reject implausible jumps. 60m caps allow legitimate teleports
      // (filter changes, reset view) but reject garbage.
      const dx = data.x - v.x;
      const dz = data.z - v.z;
      if (dx * dx + dz * dz > 60 * 60) return;
      v.x = data.x;
      v.z = data.z;
      v.yaw = data.yaw;
    } catch {
      // ignored
    }
  }

  onClose(conn: Party.Connection) {
    this.visitors.delete(conn.id);
    this.room.broadcast(JSON.stringify({ type: "leave", id: conn.id }));
  }

  /** Health probe — anyone hitting the room as plain HTTP gets a
   *  readable response instead of a 500. The partysocket client uses
   *  WebSocket upgrade and never hits this path. */
  onRequest(_req: Party.Request) {
    return new Response(
      JSON.stringify({
        party: "mna-museum",
        visitors: this.visitors.size,
        protocol: "ws",
      }),
      { headers: { "content-type": "application/json" } },
    );
  }
}
