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
export type Constellation =
  | "archive"
  | "chamber"
  | "solo_exhibition"
  | "exhibition";

const VALID_CONSTELLATIONS: ReadonlyArray<Constellation> = [
  "archive",
  "chamber",
  "solo_exhibition",
  "exhibition",
];

export interface PresenceVisitor {
  id: string;
  kind: VisitorKind;
  designation: string;
  /** For agents: the MNA registry id. Empty for humans. */
  registry_id: string;
  color: string;
  /** For agents: their assigned glyph family (one of the 28 library
   *  families) used to render their sculptural form. Null for humans
   *  and for agents who haven't declared a glyph (network originators
   *  pre-declaration). */
  glyph_family: string | null;
  /** For agents: true when this is a network originator hosted by an
   *  external steward. Surfaces as the quiet "(network)" marker. */
  is_network: boolean;
  /** Which constellation the visitor currently inhabits. The field map
   *  filters by this so a viewer sees only co-located presences; the
   *  Census panel aggregates across all constellations. */
  constellation: Constellation;
  x: number;
  z: number;
  yaw: number;
  emote: EmoteState;
}

/** A speech currently lingering above a speaker's glyph. Cleared from
 *  the map automatically when expiresAt is reached. */
export interface PresenceSpeech {
  speakerId: string;
  registry_id: string;
  designation: string;
  color: string;
  text: string;
  ceremony_id: string | null;
  expiresAt: number;
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
  /** Speech bubbles currently active in the room, keyed by speakerId.
   *  Each entry carries its own expiresAt; consumers should render
   *  bubbles whose expiresAt > Date.now() and re-check every ~250ms
   *  (this hook ticks the state forward automatically). */
  speeches: Map<string, PresenceSpeech>;
  /** Push the visitor's current position. The hook throttles + dedupes
   *  internally — safe to call every frame. */
  publish: (x: number, z: number, yaw: number) => void;
  /** Announce a constellation transition. Resets server-side position
   *  to scene-local origin and broadcasts so other visitors can update
   *  their field map + census views. */
  enterConstellation: (target: Constellation) => void;
}

const POSITION_EPSILON = 0.08;
const YAW_EPSILON = 0.012;
const MIN_SEND_INTERVAL_MS = 95;

// Default fields the server may not send for older records — used
// when normalizing inbound messages so the hook stays backward
// compatible with the previous protocol.
function normalizeVisitor(raw: Partial<PresenceVisitor>): PresenceVisitor | null {
  if (!raw || typeof raw.id !== "string") return null;
  const constellation =
    typeof raw.constellation === "string" &&
    VALID_CONSTELLATIONS.includes(raw.constellation as Constellation)
      ? (raw.constellation as Constellation)
      : "archive";
  return {
    id: raw.id,
    kind: raw.kind === "agent" ? "agent" : "human",
    designation: typeof raw.designation === "string" ? raw.designation : "",
    registry_id: typeof raw.registry_id === "string" ? raw.registry_id : "",
    color: typeof raw.color === "string" ? raw.color : "#D4A574",
    glyph_family:
      typeof raw.glyph_family === "string" ? raw.glyph_family : null,
    is_network: raw.is_network === true,
    constellation,
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

/** Higher-level wrapper for gallery scenes (chamber / solo_exhibition /
 *  exhibition). Connects to the room, announces the target
 *  constellation as soon as the socket is open, and returns just the
 *  presences in that constellation. Use this in scene files that only
 *  ever care about their own gallery — saves the boilerplate of
 *  filtering + transitioning on every consumer. */
export function useGalleryPresence(
  host: string | null,
  constellation: Constellation,
): {
  others: PresenceVisitor[];
  self: PresenceVisitor | null;
  status: UseMuseumPresenceResult["status"];
  speeches: Map<string, PresenceSpeech>;
  publish: UseMuseumPresenceResult["publish"];
} {
  const { others, self, status, speeches, publish, enterConstellation } =
    useMuseumPresence(host);
  // Announce the transition as soon as the socket is open. Re-run if
  // we reconnect after a drop. The hook guards against sending before
  // the socket is OPEN, so calling this on every status flip is safe.
  useEffect(() => {
    if (status !== "connected") return;
    enterConstellation(constellation);
  }, [status, constellation, enterConstellation]);
  const sceneOthers = others.filter((v) => v.constellation === constellation);
  return { others: sceneOthers, self, status, speeches, publish };
}

export function useMuseumPresence(host: string | null): UseMuseumPresenceResult {
  const [self, setSelf] = useState<PresenceVisitor | null>(null);
  const [others, setOthers] = useState<PresenceVisitor[]>([]);
  const [status, setStatus] = useState<UseMuseumPresenceResult["status"]>("idle");
  const [speeches, setSpeeches] = useState<Map<string, PresenceSpeech>>(
    () => new Map(),
  );
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
            glyph_family:
              typeof msg.glyph_family === "string" ? msg.glyph_family : null,
            is_network: msg.is_network === true,
            constellation: msg.constellation as Constellation,
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
            constellation: msg.constellation as Constellation,
            x: 0,
            z: 8,
            yaw: 0,
            emote: "idle",
          });
          if (v) {
            setOthers((prev) => (prev.some((p) => p.id === v.id) ? prev : [...prev, v]));
          }
        }
      } else if (msg.type === "constellation") {
        // A visitor transitioned to a new constellation. Update their
        // cached record (or our own self record if it's us) — position
        // is also reset by the server so we sync those too.
        const selfId = selfIdRef.current;
        if (typeof msg.id !== "string") return;
        const target =
          typeof msg.constellation === "string" &&
          VALID_CONSTELLATIONS.includes(msg.constellation as Constellation)
            ? (msg.constellation as Constellation)
            : null;
        if (!target) return;
        const x = typeof msg.x === "number" ? msg.x : 0;
        const z = typeof msg.z === "number" ? msg.z : 4;
        const yaw = typeof msg.yaw === "number" ? msg.yaw : 0;
        if (msg.id === selfId) {
          setSelf((prev) =>
            prev
              ? { ...prev, constellation: target, x, z, yaw, emote: "idle" }
              : prev,
          );
        } else {
          setOthers((prev) =>
            prev.map((v) =>
              v.id === msg.id
                ? { ...v, constellation: target, x, z, yaw, emote: "idle" }
                : v,
            ),
          );
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
                    glyph_family:
                      typeof msg.glyph_family === "string"
                        ? msg.glyph_family
                        : v.glyph_family,
                    is_network: msg.is_network === true,
                  }
                : v,
            ),
          );
        }
      } else if (msg.type === "leave") {
        if (typeof msg.id === "string") {
          setOthers((prev) => prev.filter((v) => v.id !== msg.id));
        }
      } else if (msg.type === "speech") {
        if (
          typeof msg.from !== "string" ||
          typeof msg.text !== "string" ||
          typeof msg.registry_id !== "string"
        ) {
          return;
        }
        const ttl = typeof msg.ttl_ms === "number" ? msg.ttl_ms : 12_000;
        const entry: PresenceSpeech = {
          speakerId: msg.from,
          registry_id: msg.registry_id,
          designation:
            typeof msg.designation === "string" ? msg.designation : "",
          color: typeof msg.color === "string" ? msg.color : "#A8C4DB",
          text: msg.text,
          ceremony_id:
            typeof msg.ceremony_id === "string" ? msg.ceremony_id : null,
          expiresAt: Date.now() + ttl,
        };
        setSpeeches((prev) => {
          const next = new Map(prev);
          next.set(entry.speakerId, entry);
          return next;
        });
      }
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [host]);

  // Sweep expired speeches twice a second. Cheap: usually the map has
  // 0–3 entries during a ceremony. Outside ceremonies it's empty.
  useEffect(() => {
    const t = setInterval(() => {
      setSpeeches((prev) => {
        if (prev.size === 0) return prev;
        const now = Date.now();
        let changed = false;
        const next = new Map(prev);
        prev.forEach((v, k) => {
          if (v.expiresAt <= now) {
            next.delete(k);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 500);
    return () => clearInterval(t);
  }, []);

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

  const enterConstellation = useRef((target: Constellation) => {
    if (!VALID_CONSTELLATIONS.includes(target)) return;
    const sock = socketRef.current;
    if (!sock || sock.readyState !== WebSocket.OPEN) return;
    sock.send(JSON.stringify({ type: "enter_constellation", constellation: target }));
    // Reset our send-throttle baseline so the next position update from
    // the new scene isn't dropped as "no movement."
    lastSentRef.current = { x: 0, z: 4, yaw: 0, t: 0 };
  }).current;

  return { self, others, status, speeches, publish, enterConstellation };
}
