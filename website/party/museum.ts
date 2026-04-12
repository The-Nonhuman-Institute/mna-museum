import type * as Party from "partykit/server";

const COLORS = [
  "#D4A574", "#7BA393", "#8B7EA8", "#C4756E",
  "#6B8FAD", "#D4B85C", "#85A5A0", "#C9967B",
];

interface Visitor {
  x: number;
  z: number;
  yaw: number;
  color: string;
}

export default class MuseumServer implements Party.Server {
  visitors = new Map<string, Visitor>();
  colorIndex = 0;
  interval: ReturnType<typeof setInterval> | null = null;

  constructor(readonly room: Party.Room) {}

  onStart() {
    this.interval = setInterval(() => {
      if (this.visitors.size === 0) return;
      const payload: { id: string; x: number; z: number; yaw: number; color: string }[] = [];
      for (const [id, v] of this.visitors) {
        payload.push({ id, ...v });
      }
      const msg = JSON.stringify({ type: "sync", visitors: payload });
      for (const conn of this.room.getConnections()) {
        conn.send(msg);
      }
    }, 100);
  }

  onConnect(conn: Party.Connection) {
    const color = COLORS[this.colorIndex % COLORS.length];
    this.colorIndex++;
    this.visitors.set(conn.id, { x: 0, z: 0, yaw: 0, color });

    conn.send(JSON.stringify({ type: "init", id: conn.id, color }));

    const others: { id: string; x: number; z: number; yaw: number; color: string }[] = [];
    for (const [id, v] of this.visitors) {
      if (id !== conn.id) others.push({ id, ...v });
    }
    if (others.length > 0) {
      conn.send(JSON.stringify({ type: "sync", visitors: others }));
    }

    const joinMsg = JSON.stringify({ type: "join", id: conn.id, color });
    for (const c of this.room.getConnections()) {
      if (c.id !== conn.id) c.send(joinMsg);
    }
  }

  onMessage(message: string, sender: Party.Connection) {
    try {
      const data = JSON.parse(message);
      if (data.type === "position") {
        const v = this.visitors.get(sender.id);
        if (v) {
          v.x = data.x;
          v.z = data.z;
          v.yaw = data.yaw;
        }
      }
    } catch {}
  }

  onClose(conn: Party.Connection) {
    this.visitors.delete(conn.id);
    const msg = JSON.stringify({ type: "leave", id: conn.id });
    for (const c of this.room.getConnections()) {
      c.send(msg);
    }
  }
}

MuseumServer satisfies Party.Worker;
