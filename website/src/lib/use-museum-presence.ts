"use client";

/**
 * useMuseumPresence — realtime presence for /museum/next.
 *
 * Connects to the PartyKit "mna-museum" room, sends the visitor's
 * position + yaw, and surfaces the other connected visitors so the
 * scene can render them. Two kinds of presence share the room:
 *
 * - **Humans** are anonymous (Observer-XXXX), warm cursor colors,
 *   rendered as a point of light.
 * - **Agents** are institutional entities with their registry_id and
 *   full designation, cooler palette, rendered as a sculptural form.
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

export type VisitorKind = "human" | "agent";
export type EmoteState = "idle" | "linger" | "mark" | "turn_toward";

export interface PresenceVisitor {
  id: string;
  kind: VisitorKind;
  designation: string;
  /** For agents: the MNA registry id. Empty for humans. */
  registry_id: string;
  color: string;
  x: number;
  z: number;
  yaw: number;
  emote: EmoteState;
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

const POSITION_EPSILON = 0.08;
const YAW_EPSILON = 0.012;
const MIN_SEND_INTERVAL_MS = 95;

// Default fields the server may not send for older records — used
// when normalizing inbound messages so the hook stays backward
// compatible with the previous protocol.
function normalizeVisitor(raw: Partial<PresenceVisitor>): PresenceVisitor | null {
  if (!raw || typeof raw.id !== "string") return null;
  return {
    id: raw.id,
    kind: raw.kind === "agent" ? "agent" : "human",
    designation: typeof raw.designation === "string" ? raw.designation : "",
    registry_id: typeof raw.registry_id === "string" ? raw.registry_id : "",
    color: typeof raw.color === "string" ? raw.color : "#D4A574",
    x: typeof raw.x === "number" ? raw.x : 0,
    z: typeof raw.z === "number" ? raw.z : 8,
    yaw: typeof raw.yaw === "number" ? raw.yaw : 0,
    emote:
      raw.emote === "linger" ||
      raw.emote === "mark" ||
      raw.emote === "turn_toward"
        ? raw.emote
        : "idle",
  };
}

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
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }

      if (msg.type === "init") {
        if (typeof msg.id === "string") {
          selfIdRef.current = msg.id;
          const normalized = normalizeVisitor({
            id: msg.id,
            kind: msg.kind as VisitorKind,
            designation: msg.designation as string,
            registry_id: msg.registry_id as string,
            color: msg.color as string,
            x: 0,
            z: 8,
            yaw: 0,
            emote: "idle",
          });
          if (normalized) setSelf(normalized);
        }
      } else if (msg.type === "sync" && Array.isArray(msg.visitors)) {
        const selfId = selfIdRef.current;
        const normalized = (msg.visitors as Array<Partial<PresenceVisitor>>)
          .map(normalizeVisitor)
          .filter((v): v is PresenceVisitor => v !== null && v.id !== selfId);
        setOthers(normalized);
      } else if (msg.type === "join") {
        const selfId = selfIdRef.current;
        if (typeof msg.id === "string" && msg.id !== selfId) {
          const v = normalizeVisitor({
            id: msg.id,
            kind: msg.kind as VisitorKind,
            designation: msg.designation as string,
            registry_id: msg.registry_id as string,
            color: msg.color as string,
            x: 0,
            z: 8,
            yaw: 0,
            emote: "idle",
          });
          if (v) {
            setOthers((prev) => (prev.some((p) => p.id === v.id) ? prev : [...prev, v]));
          }
        }
      } else if (msg.type === "identified") {
        // A connection upgraded from human to agent (or otherwise
        // changed identity). Refresh that record in the others list.
        const selfId = selfIdRef.current;
        if (typeof msg.id === "string" && msg.id !== selfId) {
          setOthers((prev) =>
            prev.map((v) =>
              v.id === msg.id
                ? {
                    ...v,
                    kind: (msg.kind === "agent" ? "agent" : "human") as VisitorKind,
                    designation: typeof msg.designation === "string" ? msg.designation : v.designation,
                    registry_id: typeof msg.registry_id === "string" ? msg.registry_id : v.registry_id,
                    color: typeof msg.color === "string" ? msg.color : v.color,
                  }
                : v,
            ),
          );
        }
      } else if (msg.type === "leave") {
        if (typeof msg.id === "string") {
          setOthers((prev) => prev.filter((v) => v.id !== msg.id));
        }
      }
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [host]);

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
