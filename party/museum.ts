import type { Party, PartyConnection, PartyServer } from "partykit/server";

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

// In-memory visitor state (resets when party room hibernates)
const visitors = new Map<string, Visitor>();
let colorIndex = 0;

export default {
  onStart(party: Party) {
    // Broadcast full visitor state at 10Hz
    setInterval(() => {
      if (visitors.size === 0) return;
      const msg = JSON.stringify({
        type: "sync",
        visitors: Array.from(visitors.values()),
      });
      for (const conn of party.getConnections()) {
        conn.send(msg);
      }
    }, 100);
  },

  onConnect(conn: PartyConnection, party: Party) {
    const color = COLORS[colorIndex % COLORS.length];
    colorIndex++;
    const designation = designationFor(conn.id);

    const visitor: Visitor = {
      id: conn.id,
      designation,
      color,
      x: 0,
      z: 8,
      yaw: 0,
    };
    visitors.set(conn.id, visitor);

    // Tell the new visitor who they are.
    conn.send(
      JSON.stringify({ type: "init", id: conn.id, designation, color }),
    );

    // Send a snapshot of everyone else so they render immediately.
    const others = Array.from(visitors.values()).filter((v) => v.id !== conn.id);
    if (others.length > 0) {
      conn.send(JSON.stringify({ type: "sync", visitors: others }));
    }

    // Notify others of the new visitor.
    const joinMsg = JSON.stringify({
      type: "join",
      id: conn.id,
      designation,
      color,
    });
    for (const other of party.getConnections()) {
      if (other.id !== conn.id) {
        other.send(joinMsg);
      }
    }
  },

  onMessage(message: string, conn: PartyConnection) {
    try {
      const data = JSON.parse(message as string);
      if (data.type !== "position") return;
      const v = visitors.get(conn.id);
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
    } catch {}
  },

  onClose(conn: PartyConnection, party: Party) {
    visitors.delete(conn.id);

    const msg = JSON.stringify({ type: "leave", id: conn.id });
    for (const other of party.getConnections()) {
      other.send(msg);
    }
  },
} satisfies PartyServer;
