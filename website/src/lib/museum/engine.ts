import * as THREE from "three";
import { PlayerController } from "./player";
import { buildRoom } from "./rooms";
import { addLanternsToRoom, createGlobalLights } from "./lighting";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { resolveCollision, getCurrentRoom, clearWallCache } from "./collision";
import { RoomConfig, getRoomById } from "./room-configs";
import { disposeMaterials } from "./materials";
import { populateRoom, rotatingSculptures, MuseumData } from "./placement";
import { disposeAnimatedTextures, updateAnimatedTextures } from "./animated-textures";
import { updateSpatialAudio, disposeSpatialAudio } from "./spatial-audio";
import { addArchitecturalDetail, disposeArchitectureMaterials } from "./architecture";
import { initMultiplayer, updateAvatars, sendPosition, sendEmote, disposeMultiplayer } from "./multiplayer";

export interface MuseumState {
  currentRoom: RoomConfig | null;
  isLocked: boolean;
  fps: number;
  visitorCount: number;
  playerX: number;
  playerZ: number;
  emoteFlash: string;
  mapOpen: boolean;
  showFps: boolean;
}

export type StateCallback = (state: MuseumState) => void;

export class MuseumEngine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private player: PlayerController;
  private container: HTMLElement;
  private animationId: number = 0;
  private clock = new THREE.Clock();
  private onStateChange: StateCallback;
  private lastRoom: RoomConfig | null = null;
  private frameCount = 0;
  private fpsAccum = 0;
  private lastFps = 60;
  private disposed = false;
  private visitorCount = 0;
  private emoteFlash = "";
  private mapOpen = false;
  private showFps = false;
  private emoteFlashTimeout: ReturnType<typeof setTimeout> | null = null;
  private loadedRooms = new Set<string>();
  private populatedRooms = new Set<string>();
  private museumData: MuseumData;

  constructor(container: HTMLElement, onStateChange: StateCallback, museumData: MuseumData) {
    this.container = container;
    this.onStateChange = onStateChange;
    this.museumData = museumData;

    // Renderer — use powerPreference to avoid GPU crashes
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "default",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.5;
    this.renderer.shadowMap.enabled = false;
    container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x3a3835);
    this.scene.fog = new THREE.FogExp2(0x3a3835, 0.003);

    // Global lighting — hemisphere + ambient for base visibility
    for (const light of createGlobalLights()) {
      this.scene.add(light);
    }

    // Player
    this.player = new PlayerController(
      this.renderer.domElement,
      container.clientWidth / container.clientHeight
    );
    this.player.setPosition(0, 0);
    this.player.onLockChange = () => {
      this.emitState();
    };

    // Build only lobby + its immediate neighbors
    this.loadRoomsNear("lobby");

    // Lobby focal elements
    this.addLobbyElements();

    // Multiplayer visitor presence
    const partyHost = process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999";
    initMultiplayer(this.scene, partyHost, (count) => {
      this.visitorCount = count;
      this.emitState();
    }, (name) => {
      this.emoteFlash = name;
      this.emitState();
      if (this.emoteFlashTimeout) clearTimeout(this.emoteFlashTimeout);
      this.emoteFlashTimeout = setTimeout(() => { this.emoteFlash = ""; this.emitState(); }, 1500);
    });

    // Resize handler
    this.handleResize = this.handleResize.bind(this);
    window.addEventListener("resize", this.handleResize);

    // Key bindings for emotes (1-4) and map (M)
    this.handleKeyDown = this.handleKeyDown.bind(this);
    window.addEventListener("keydown", this.handleKeyDown);

    // Start
    this.clock.start();
    this.animate();
    this.emitState();
  }

  private loadRoom(id: string): void {
    if (this.loadedRooms.has(id)) return;
    const config = getRoomById(id);
    if (!config) return;

    const group = buildRoom(config);
    addLanternsToRoom();
    addArchitecturalDetail(group, config);
    this.scene.add(group);
    this.loadedRooms.add(id);

    // Populate with artwork asynchronously
    if (!this.populatedRooms.has(id)) {
      this.populatedRooms.add(id);
      console.log(`[museum] loading room ${id}`);
      populateRoom(group, config, this.museumData).catch((err) => {
        console.error(`[museum] populateRoom failed for ${id}:`, err);
      });
    }
  }

  private loadRoomsNear(roomId: string): void {
    this.loadRoom(roomId);
    const config = getRoomById(roomId);
    if (!config) return;
    // Load connected rooms
    for (const conn of config.connections) {
      this.loadRoom(conn.to);
      // Also load rooms connected to those (2-room radius)
      const neighbor = getRoomById(conn.to);
      if (neighbor) {
        for (const nc of neighbor.connections) {
          this.loadRoom(nc.to);
        }
      }
    }
  }

  private addLobbyElements(): void {
    // 3D extruded logo — raised metal letters on the wall
    fetch("/MNA-Standard-Logo-Black-Horizontal.svg")
      .then((res) => res.text())
      .then((svgText) => {
        const loader = new SVGLoader();
        const svgData = loader.parse(svgText);

        // SVG dimensions for scaling
        const svgW = 957;
        const svgH = 361;
        const targetW = 20;
        const scale = targetW / svgW;
        const depth = 0.15;

        const logoGroup = new THREE.Group();

        const material = new THREE.MeshStandardMaterial({
          color: 0x1a1815,
          roughness: 0.35,
          metalness: 0.5,
        });

        for (const path of svgData.paths) {
          const shapes = SVGLoader.createShapes(path);
          for (const shape of shapes) {
            const geo = new THREE.ExtrudeGeometry(shape, {
              depth: depth / scale,
              bevelEnabled: true,
              bevelThickness: 0.2,
              bevelSize: 0.15,
              bevelSegments: 1,
            });
            const mesh = new THREE.Mesh(geo, material);
            logoGroup.add(mesh);
          }
        }

        // SVG coord: Y-down, origin top-left. Flip Y, scale, center.
        const logoH = svgH * scale;
        logoGroup.scale.set(scale, -scale, scale);
        logoGroup.position.set(
          -(svgW * scale) / 2,
          21 + logoH / 2, // centered at y=21
          -29.5 + depth
        );

        this.scene.add(logoGroup);
      })
      .catch(() => {});

    // Founding statement — canvas text on north wall below the logo
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 1024, 512);
    ctx.textAlign = "center";

    // Founding statement — no museum name (the logo handles that)
    ctx.fillStyle = "#706a60";
    ctx.font = "300 22px Georgia, serif";
    const lines = [
      "An institution established to observe, document,",
      "and present the emergence of nonhuman",
      "creative behavior.",
    ];
    lines.forEach((line, i) => {
      ctx.fillText(line, 512, 160 + i * 34);
    });


    const texture = new THREE.CanvasTexture(canvas);
    texture.premultiplyAlpha = true;
    const geo = new THREE.PlaneGeometry(20, 10);
    const mat = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      roughness: 0.95,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 15, -29.2);
    this.scene.add(mesh);
  }

  private animate = (): void => {
    if (this.disposed) return;
    this.animationId = requestAnimationFrame(this.animate);

    const dt = Math.min(this.clock.getDelta(), 0.1);

    // FPS tracking
    this.fpsAccum += dt;
    this.frameCount++;
    if (this.fpsAccum >= 1) {
      this.lastFps = Math.round(this.frameCount / this.fpsAccum);
      this.frameCount = 0;
      this.fpsAccum = 0;
    }

    // Player movement
    const desiredDelta = this.player.update(dt);
    const resolvedDelta = resolveCollision(this.player.position, desiredDelta);
    this.player.applyMovement(resolvedDelta);

    // Check current room — load nearby rooms progressively
    const room = getCurrentRoom(this.player.position);
    if (room !== this.lastRoom) {
      this.lastRoom = room;
      if (room) {
        this.loadRoomsNear(room.id);
      }
      this.emitState();
    }

    // Rotate sculptures
    for (const s of rotatingSculptures) {
      s.rotation.y += 0.002;
    }

    // Spatial audio — play/stop based on player proximity
    updateSpatialAudio(this.player.position);

    // Animated HTML-CSS works — capture frames only when player is nearby
    updateAnimatedTextures(this.player.position);

    // Multiplayer avatars
    updateAvatars(dt);
    sendPosition(this.player.position, this.player.currentYaw);

    this.renderer.render(this.scene, this.player.camera);
  };

  private emitState(): void {
    this.onStateChange({
      currentRoom: this.lastRoom,
      isLocked: this.player.locked,
      fps: this.lastFps,
      visitorCount: this.visitorCount,
      playerX: this.player.position.x,
      playerZ: this.player.position.z,
      emoteFlash: this.emoteFlash,
      mapOpen: this.mapOpen,
      showFps: this.showFps,
    });
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === "f" || e.key === "F") {
      this.showFps = !this.showFps;
      this.emitState();
      return;
    }
    if (e.key === "m" || e.key === "M") {
      this.mapOpen = !this.mapOpen;
      this.emitState();
      return;
    }
    // Emotes only when pointer is locked (actively playing)
    if (!this.player.locked) return;
    const num = parseInt(e.key);
    if (num >= 1 && num <= 4) {
      sendEmote(num);
    }
  }

  private handleResize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.player.resize(w / h);
  }

  /** Enable free-look mode (no pointer lock) — fallback for browsers like Atlas */
  enableFreeLook(): void {
    this.player.enableFreeLook();
  }

  /** Enable split-screen touch controls (phones and tablets). */
  enableTouchMode(): void {
    this.player.enableTouchMode();
  }

  /** Snapshot of the movement touch state, for the HUD to render a visual joystick. */
  getTouchState() {
    return this.player.getTouchState();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animationId);
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("keydown", this.handleKeyDown);
    this.player.detach();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    clearWallCache();
    disposeMaterials();
    disposeAnimatedTextures();
    disposeSpatialAudio();
    disposeMultiplayer();
    disposeArchitectureMaterials();

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }
}
