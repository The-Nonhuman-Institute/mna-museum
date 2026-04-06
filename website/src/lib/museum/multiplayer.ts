import * as THREE from "three";

const EYE_HEIGHT = 5.5;
const SEND_INTERVAL = 100;
const ROTATION_SPEED = 0.3;
const EMOTE_NAMES = ["", "Wave", "Glow", "Orbit", "Pulse"];
const EMOTE_DURATIONS = [0, 600, 1000, 500, 1200];

let socket: WebSocket | null = null;
let localId: string | null = null;
let sceneRef: THREE.Scene | null = null;
let sharedGeo: THREE.IcosahedronGeometry | null = null;
let lastSendTime = 0;
let disposed = false;
let emoteCallback: ((name: string) => void) | null = null;

interface EmoteState {
  emoteId: number;
  startTime: number;
  originalColor: THREE.Color;
  originalEmissiveIntensity: number;
}

interface VisitorAvatar {
  mesh: THREE.Mesh;
  targetX: number;
  targetZ: number;
  targetYaw: number;
  emote: EmoteState | null;
}

const avatars = new Map<string, VisitorAvatar>();

function lerpFactor(base: number, dt: number): number {
  return 1 - Math.pow(1 - base, dt * 60);
}

function createAvatarMesh(color: string): THREE.Mesh {
  if (!sharedGeo) sharedGeo = new THREE.IcosahedronGeometry(1.2, 0);
  const mat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.3, roughness: 0.6, metalness: 0.2,
  });
  const mesh = new THREE.Mesh(sharedGeo, mat);
  mesh.position.set(0, EYE_HEIGHT, 0);
  return mesh;
}

function playEmoteOnAvatar(avatar: VisitorAvatar, emoteId: number): void {
  const mat = avatar.mesh.material as THREE.MeshStandardMaterial;
  avatar.emote = {
    emoteId, startTime: performance.now(),
    originalColor: mat.color.clone(), originalEmissiveIntensity: mat.emissiveIntensity,
  };
}

function updateEmote(avatar: VisitorAvatar): void {
  if (!avatar.emote) return;
  const { emoteId, startTime, originalColor, originalEmissiveIntensity } = avatar.emote;
  const t = Math.min((performance.now() - startTime) / (EMOTE_DURATIONS[emoteId] || 600), 1);
  const mat = avatar.mesh.material as THREE.MeshStandardMaterial;

  if (t >= 1) {
    mat.emissiveIntensity = originalEmissiveIntensity;
    mat.color.copy(originalColor);
    mat.emissive.copy(originalColor);
    avatar.mesh.scale.setScalar(1);
    avatar.emote = null;
    return;
  }

  switch (emoteId) {
    case 1: // Wave — scale up then back
      avatar.mesh.scale.setScalar(t < 0.4 ? 1 + 0.5 * (t / 0.4) : 1.5 - 0.5 * ((t - 0.4) / 0.6));
      break;
    case 2: // Glow — emissive ramps then fades
      mat.emissiveIntensity = t < 0.3
        ? originalEmissiveIntensity + 0.7 * (t / 0.3)
        : originalEmissiveIntensity + 0.7 * (1 - (t - 0.3) / 0.7);
      break;
    case 3: // Orbit — fast 360 spin
      avatar.mesh.rotation.y += (Math.PI * 2) / ((EMOTE_DURATIONS[3] / 16.67));
      break;
    case 4: { // Pulse color — cycle hue
      const c = new THREE.Color().setHSL(((t * 360) % 360) / 360, 0.7, 0.5);
      mat.color.copy(c);
      mat.emissive.copy(c);
      break;
    }
  }
}

function handleMessage(event: MessageEvent): void {
  if (disposed) return;
  try {
    const data = JSON.parse(event.data);
    switch (data.type) {
      case "init": localId = data.id; break;
      case "sync": {
        const seen = new Set<string>();
        for (const v of data.visitors) {
          if (v.id === localId) continue;
          seen.add(v.id);
          let avatar = avatars.get(v.id);
          if (!avatar) {
            const mesh = createAvatarMesh(v.color);
            mesh.position.set(v.x, EYE_HEIGHT, v.z);
            sceneRef?.add(mesh);
            avatar = { mesh, targetX: v.x, targetZ: v.z, targetYaw: v.yaw, emote: null };
            avatars.set(v.id, avatar);
          }
          avatar.targetX = v.x; avatar.targetZ = v.z; avatar.targetYaw = v.yaw;
        }
        for (const [id, a] of avatars) {
          if (!seen.has(id)) { sceneRef?.remove(a.mesh); (a.mesh.material as THREE.MeshStandardMaterial).dispose(); avatars.delete(id); }
        }
        break;
      }
      case "join":
        if (data.id === localId) break;
        if (!avatars.has(data.id)) {
          const mesh = createAvatarMesh(data.color);
          sceneRef?.add(mesh);
          avatars.set(data.id, { mesh, targetX: 0, targetZ: 0, targetYaw: 0, emote: null });
        }
        break;
      case "leave": {
        const a = avatars.get(data.id);
        if (a) { sceneRef?.remove(a.mesh); (a.mesh.material as THREE.MeshStandardMaterial).dispose(); avatars.delete(data.id); }
        break;
      }
      case "emote": {
        const a = avatars.get(data.id);
        if (a) playEmoteOnAvatar(a, data.emoteId);
        break;
      }
    }
  } catch {}
}

export function initMultiplayer(
  scene: THREE.Scene, host: string,
  onVisitorCount: (count: number) => void,
  onEmote?: (name: string) => void
): void {
  disposed = false; sceneRef = scene; emoteCallback = onEmote || null;
  sharedGeo = new THREE.IcosahedronGeometry(1.2, 0);
  const protocol = host.startsWith("localhost") ? "ws" : "wss";
  socket = new WebSocket(`${protocol}://${host}`);
  socket.addEventListener("message", (event) => { handleMessage(event); onVisitorCount(avatars.size); });
  socket.addEventListener("error", () => {});
}

export function sendPosition(position: THREE.Vector3, yaw: number): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const now = performance.now();
  if (now - lastSendTime < SEND_INTERVAL) return;
  lastSendTime = now;
  socket.send(JSON.stringify({ type: "position", x: position.x, z: position.z, yaw }));
}

export function sendEmote(emoteId: number): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  if (emoteId < 1 || emoteId > 4) return;
  socket.send(JSON.stringify({ type: "emote", emoteId }));
  emoteCallback?.(EMOTE_NAMES[emoteId] || "");
}

export function updateAvatars(dt: number): void {
  const factor = lerpFactor(0.15, dt);
  for (const avatar of avatars.values()) {
    avatar.mesh.position.x += (avatar.targetX - avatar.mesh.position.x) * factor;
    avatar.mesh.position.z += (avatar.targetZ - avatar.mesh.position.z) * factor;
    avatar.mesh.position.y = EYE_HEIGHT;
    if (!avatar.emote || avatar.emote.emoteId !== 3) avatar.mesh.rotation.y += ROTATION_SPEED * dt;
    updateEmote(avatar);
  }
}

export function disposeMultiplayer(): void {
  disposed = true;
  if (socket) { socket.close(); socket = null; }
  for (const a of avatars.values()) { sceneRef?.remove(a.mesh); (a.mesh.material as THREE.MeshStandardMaterial).dispose(); }
  avatars.clear();
  if (sharedGeo) { sharedGeo.dispose(); sharedGeo = null; }
  sceneRef = null; localId = null; emoteCallback = null;
}
