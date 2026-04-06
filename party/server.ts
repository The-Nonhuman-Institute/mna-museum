import { WebSocketServer, WebSocket } from "ws";

const COLORS = [
  "#D4A574", "#7BA393", "#8B7EA8", "#C4756E",
  "#6B8FAD", "#D4B85C", "#85A5A0", "#C9967B",
];

interface Visitor {
  ws: WebSocket;
  id: string;
  x: number;
  z: number;
  yaw: number;
  color: string;
}

const visitors = new Map<string, Visitor>();
let nextId = 1;
let colorIndex = 0;

const wss = new WebSocketServer({ port: 1999 });

// Broadcast full state at 10Hz
setInterval(() => {
  if (visitors.size === 0) return;
  const payload = Array.from(visitors.values()).map((v) => ({
    id: v.id, x: v.x, z: v.z, yaw: v.yaw, color: v.color,
  }));
  const msg = JSON.stringify({ type: "sync", visitors: payload });
  for (const v of visitors.values()) {
    if (v.ws.readyState === WebSocket.OPEN) v.ws.send(msg);
  }
}, 100);

wss.on("connection", (ws) => {
  const id = `v${nextId++}`;
  const color = COLORS[colorIndex % COLORS.length];
  colorIndex++;

  const visitor: Visitor = { ws, id, x: 0, z: 0, yaw: 0, color };
  visitors.set(id, visitor);

  // Tell new visitor their id and color
  ws.send(JSON.stringify({ type: "init", id, color }));

  // Send current others
  const others = Array.from(visitors.values())
    .filter((v) => v.id !== id)
    .map((v) => ({ id: v.id, x: v.x, z: v.z, yaw: v.yaw, color: v.color }));
  if (others.length > 0) {
    ws.send(JSON.stringify({ type: "sync", visitors: others }));
  }

  // Notify others
  const joinMsg = JSON.stringify({ type: "join", id, color });
  for (const v of visitors.values()) {
    if (v.id !== id && v.ws.readyState === WebSocket.OPEN) {
      v.ws.send(joinMsg);
    }
  }

  ws.on("message", (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data.type === "position") {
        visitor.x = data.x;
        visitor.z = data.z;
        visitor.yaw = data.yaw;
      }
    } catch {}
  });

  ws.on("close", () => {
    visitors.delete(id);
    const leaveMsg = JSON.stringify({ type: "leave", id });
    for (const v of visitors.values()) {
      if (v.ws.readyState === WebSocket.OPEN) v.ws.send(leaveMsg);
    }
  });
});

console.log("Museum presence server running on ws://localhost:1999");
