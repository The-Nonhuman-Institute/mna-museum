import * as THREE from "three";

// --- Avatar config ---
const EYE_HEIGHT = 5.5;
const SEND_INTERVAL = 100; // ms
const ROTATION_SPEED = 0.3; // rad/sec

// --- Module state ---
let socket: WebSocket | null = null;
let localId: string | null = null;
let sceneRef: THREE.Scene | null = null;
let sharedGeo: THREE.IcosahedronGeometry | null = null;
let lastSendTime = 0;
let disposed = false;

interface VisitorAvatar {
  mesh: THREE.Mesh;
  targetX: number;
  targetZ: number;
  targetYaw: number;
}

const avatars = new Map<string, VisitorAvatar>();

function lerpFactor(base: number, dt: number): number {
  return 1 - Math.pow(1 - base, dt * 60);
}

function createAvatarMesh(color: string): THREE.Mesh {
  if (!sharedGeo) sharedGeo = new THREE.IcosahedronGeometry(1.2, 0);
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.3,
    roughness: 0.6,
    metalness: 0.2,
  });
  const mesh = new THREE.Mesh(sharedGeo, mat);
  mesh.position.set(0, EYE_HEIGHT, 0);
  return mesh;
}

function handleMessage(event: MessageEvent): void {
  if (disposed) return;
  try {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case "init":
        localId = data.id;
        break;

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
            avatar = { mesh, targetX: v.x, targetZ: v.z, targetYaw: v.yaw };
            avatars.set(v.id, avatar);
          }
          avatar.targetX = v.x;
          avatar.targetZ = v.z;
          avatar.targetYaw = v.yaw;
        }

        for (const [id, avatar] of avatars) {
          if (!seen.has(id)) {
            sceneRef?.remove(avatar.mesh);
            (avatar.mesh.material as THREE.MeshStandardMaterial).dispose();
            avatars.delete(id);
          }
        }
        break;
      }

      case "join": {
        if (data.id === localId) break;
        if (!avatars.has(data.id)) {
          const mesh = createAvatarMesh(data.color);
          sceneRef?.add(mesh);
          avatars.set(data.id, { mesh, targetX: 0, targetZ: 0, targetYaw: 0 });
        }
        break;
      }

      case "leave": {
        const avatar = avatars.get(data.id);
        if (avatar) {
          sceneRef?.remove(avatar.mesh);
          (avatar.mesh.material as THREE.MeshStandardMaterial).dispose();
          avatars.delete(data.id);
        }
        break;
      }
    }
  } catch {}
}

export function initMultiplayer(
  scene: THREE.Scene,
  host: string,
  onVisitorCount: (count: number) => void
): void {
  disposed = false;
  sceneRef = scene;
  sharedGeo = new THREE.IcosahedronGeometry(1.2, 0);

  const protocol = host.startsWith("localhost") ? "ws" : "wss";
  socket = new WebSocket(`${protocol}://${host}`);

  socket.addEventListener("message", (event) => {
    handleMessage(event);
    onVisitorCount(avatars.size);
  });

  socket.addEventListener("error", () => {
    // Silently fail — museum works fine without multiplayer
  });
}

export function sendPosition(position: THREE.Vector3, yaw: number): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const now = performance.now();
  if (now - lastSendTime < SEND_INTERVAL) return;
  lastSendTime = now;
  socket.send(JSON.stringify({
    type: "position",
    x: position.x,
    z: position.z,
    yaw,
  }));
}

export function updateAvatars(dt: number): void {
  const factor = lerpFactor(0.15, dt);
  for (const avatar of avatars.values()) {
    avatar.mesh.position.x += (avatar.targetX - avatar.mesh.position.x) * factor;
    avatar.mesh.position.z += (avatar.targetZ - avatar.mesh.position.z) * factor;
    avatar.mesh.position.y = EYE_HEIGHT;
    avatar.mesh.rotation.y += ROTATION_SPEED * dt;
  }
}

export function getVisitorCount(): number {
  return avatars.size;
}

export function disposeMultiplayer(): void {
  disposed = true;
  if (socket) {
    socket.close();
    socket = null;
  }
  for (const avatar of avatars.values()) {
    sceneRef?.remove(avatar.mesh);
    (avatar.mesh.material as THREE.MeshStandardMaterial).dispose();
  }
  avatars.clear();
  if (sharedGeo) {
    sharedGeo.dispose();
    sharedGeo = null;
  }
  sceneRef = null;
  localId = null;
}
