const { WebSocketServer, WebSocket } = require("ws");

const COLORS = [
  "#D4A574", "#7BA393", "#8B7EA8", "#C4756E",
  "#6B8FAD", "#D4B85C", "#85A5A0", "#C9967B",
];

const visitors = new Map();
let nextId = 1;
let colorIndex = 0;

const PORT = process.env.PORT || 1999;
const wss = new WebSocketServer({ port: PORT });

setInterval(() => {
  if (visitors.size === 0) return;
  const payload = [];
  for (const [id, v] of visitors) {
    payload.push({ id, x: v.x, z: v.z, yaw: v.yaw, color: v.color });
  }
  const msg = JSON.stringify({ type: "sync", visitors: payload });
  for (const v of visitors.values()) {
    if (v.ws.readyState === WebSocket.OPEN) v.ws.send(msg);
  }
}, 100);

wss.on("connection", (ws) => {
  const id = `v${nextId++}`;
  const color = COLORS[colorIndex % COLORS.length];
  colorIndex++;

  const visitor = { ws, x: 0, z: 0, yaw: 0, color };
  visitors.set(id, visitor);

  ws.send(JSON.stringify({ type: "init", id, color }));

  const others = [];
  for (const [oid, v] of visitors) {
    if (oid !== id) others.push({ id: oid, x: v.x, z: v.z, yaw: v.yaw, color: v.color });
  }
  if (others.length > 0) ws.send(JSON.stringify({ type: "sync", visitors: others }));

  const joinMsg = JSON.stringify({ type: "join", id, color });
  for (const v of visitors.values()) {
    if (v.id !== id && v.ws.readyState === WebSocket.OPEN) v.ws.send(joinMsg);
  }

  ws.on("message", (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data.type === "position") {
        visitor.x = data.x;
        visitor.z = data.z;
        visitor.yaw = data.yaw;
      } else if (data.type === "emote") {
        const emoteMsg = JSON.stringify({ type: "emote", id, emoteId: data.emoteId });
        for (const v of visitors.values()) {
          if (v.ws !== ws && v.ws.readyState === WebSocket.OPEN) v.ws.send(emoteMsg);
        }
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

console.log(`Museum presence server running on port ${PORT}`);
