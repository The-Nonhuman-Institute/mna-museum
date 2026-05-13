"use client";

/**
 * useMuseumPresence — realtime presence for /museum/next.
 *
 * Connects to the PartyKit "mna-museum" room, sends the visitor's
 * position + yaw, and surfaces the other connected visitors so the
 * scene can render them as warm points of light.
 *
 * Identity is anonymous + ephemeral, assigned by the server on
 * connect. Visitors see each other as `Observer-XXXX`. No accounts,
 * no persistence.
 *
 * The hook is a no-op when `host` is null/empty — the museum runs in
 * solo mode and `others` stays an empty array. That lets the page
 * ship without a PartyKit deployment; multiplayer activates once
 * NEXT_PUBLIC_PARTY_HOST is set.
 *
 * Throttling: position updates only fire when the visitor has moved
 * more than POSITION_EPSILON metres or rotated more than YAW_EPSILON
 * radians since the last sent update. Caps net traffic when the
 * visitor is standing still.
 */

import { useEffect, useRef, useState } from "react";
import PartySocket from "partysocket";

export interface PresenceVisitor {
  id: string;
  designation: string;
  color: string;
  x: number;
  z: number;
  yaw: number;
}

interface UseMuseumPresenceResult {
  /** Visitors other than self. Position + yaw kept fresh by the room's
   *  10Hz sync stream. */
  others: PresenceVisitor[];
  /** Our own visitor record assigned by the server. null until the
   *  init message arrives. */
  self: PresenceVisitor | null;
  /** Connection status — used by the HUD to surface connectivity. */
  status: "idle" | "connecting" | "connected" | "disconnected";
  /** Push the visitor's current position. The hook throttles + dedupes
   *  internally — safe to call every frame. */
  publish: (x: number, z: number, yaw: number) => void;
}

const POSITION_EPSILON = 0.08; // metres — sub-step movement
const YAW_EPSILON = 0.012; // radians — ~0.7°
const MIN_SEND_INTERVAL_MS = 95; // 10Hz cap

export function useMuseumPresence(host: string | null): UseMuseumPresenceResult {
  const [self, setSelf] = useState<PresenceVisitor | null>(null);
  const [others, setOthers] = useState<PresenceVisitor[]>([]);
  const [status, setStatus] = useState<UseMuseumPresenceResult["status"]>("idle");
  const socketRef = useRef<PartySocket | null>(null);
  const selfIdRef = useRef<string | null>(null);
  const lastSentRef = useRef({ x: 0, z: 8, yaw: 0, t: 0 });

  useEffect(() => {
    if (!host) {
      setStatus("idle");
      return;
    }

    setStatus("connecting");
    const socket = new PartySocket({
      host,
      room: "mna-museum",
    });
    socketRef.current = socket;

    socket.addEventListener("open", () => setStatus("connected"));
    socket.addEventListener("close", () => setStatus("disconnected"));
    socket.addEventListener("error", () => setStatus("disconnected"));

    socket.addEventListener("message", (e) => {
      let msg: {
        type?: string;
        id?: string;
        designation?: string;
        color?: string;
        visitors?: PresenceVisitor[];
        x?: number;
        z?: number;
        yaw?: number;
      };
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }

      if (msg.type === "init") {
        if (msg.id && msg.designation && msg.color) {
          selfIdRef.current = msg.id;
          setSelf({
            id: msg.id,
            designation: msg.designation,
            color: msg.color,
            x: 0,
            z: 8,
            yaw: 0,
          });
        }
      } else if (msg.type === "sync" && Array.isArray(msg.visitors)) {
        const selfId = selfIdRef.current;
        setOthers(msg.visitors.filter((v) => v.id !== selfId));
      } else if (msg.type === "join") {
        const selfId = selfIdRef.current;
        if (msg.id && msg.id !== selfId && msg.designation && msg.color) {
          const newVisitor: PresenceVisitor = {
            id: msg.id,
            designation: msg.designation,
            color: msg.color,
            x: 0,
            z: 8,
            yaw: 0,
          };
          setOthers((prev) => {
            if (prev.some((v) => v.id === newVisitor.id)) return prev;
            return [...prev, newVisitor];
          });
        }
      } else if (msg.type === "leave") {
        if (msg.id) {
          setOthers((prev) => prev.filter((v) => v.id !== msg.id));
        }
      }
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [host]);

  // Throttled publish. Safe to call every frame.
  const publish = useRef((x: number, z: number, yaw: number) => {
    const last = lastSentRef.current;
    const now = Date.now();
    if (now - last.t < MIN_SEND_INTERVAL_MS) return;
    const dx = x - last.x;
    const dz = z - last.z;
    const dyaw = Math.abs(((yaw - last.yaw) % (Math.PI * 2)) - 0) > Math.PI
      ? Math.PI * 2 - Math.abs(yaw - last.yaw)
      : Math.abs(yaw - last.yaw);
    if (
      dx * dx + dz * dz < POSITION_EPSILON * POSITION_EPSILON &&
      dyaw < YAW_EPSILON
    ) {
      return;
    }
    const sock = socketRef.current;
    if (!sock || sock.readyState !== WebSocket.OPEN) return;
    sock.send(JSON.stringify({ type: "position", x, z, yaw }));
    lastSentRef.current = { x, z, yaw, t: now };
  }).current;

  return { self, others, status, publish };
}
