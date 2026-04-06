import * as THREE from "three";

// First-person player controller
// Pointer lock for mouse look, WASD for movement
// Eye height 5.5ft, movement speed 8 ft/sec

const EYE_HEIGHT = 5.5;
const MOVE_SPEED = 8;
const MOUSE_SENSITIVITY = 0.002;
const PITCH_LIMIT = Math.PI / 2 - 0.05; // prevent gimbal lock

export class PlayerController {
  camera: THREE.PerspectiveCamera;
  private yaw = 0; // horizontal rotation
  private pitch = 0; // vertical rotation
  private keys: Record<string, boolean> = {};
  private isLocked = false;
  private freeLook = false; // pointer-lock-free fallback (drag to look)
  private isDragging = false;
  private lastDragX = 0;
  private lastDragY = 0;
  private domElement: HTMLElement;
  private velocity = new THREE.Vector3();

  // Expose for collision system
  position = new THREE.Vector3(0, EYE_HEIGHT, 0);

  // Callbacks
  onLockChange?: (locked: boolean) => void;

  get currentYaw(): number { return this.yaw; }

  constructor(domElement: HTMLElement, aspect: number) {
    this.domElement = domElement;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 500);
    this.camera.position.copy(this.position);

    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleLockChange = this.handleLockChange.bind(this);

    this.attach();
  }

  private attach(): void {
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("mousedown", this.handleMouseDown);
    document.addEventListener("mouseup", this.handleMouseUp);
    document.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("keyup", this.handleKeyUp);
    document.addEventListener("pointerlockchange", this.handleLockChange);
  }

  detach(): void {
    document.removeEventListener("mousemove", this.handleMouseMove);
    document.removeEventListener("mousedown", this.handleMouseDown);
    document.removeEventListener("mouseup", this.handleMouseUp);
    document.removeEventListener("keydown", this.handleKeyDown);
    document.removeEventListener("keyup", this.handleKeyUp);
    document.removeEventListener("pointerlockchange", this.handleLockChange);
    if (this.isLocked) {
      document.exitPointerLock();
    }
  }

  private handleLockChange(): void {
    this.isLocked = document.pointerLockElement === this.domElement;
    this.onLockChange?.(this.isLocked);
    if (!this.isLocked) {
      // Reset keys when losing lock
      this.keys = {};
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    if (this.isLocked) {
      // Pointer-lock mode: use movement deltas
      this.yaw -= e.movementX * MOUSE_SENSITIVITY;
      this.pitch -= e.movementY * MOUSE_SENSITIVITY;
      this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
    } else if (this.freeLook && this.isDragging) {
      // Drag-to-look mode: rotate while mouse button is held
      const dx = e.clientX - this.lastDragX;
      const dy = e.clientY - this.lastDragY;
      this.yaw -= dx * MOUSE_SENSITIVITY * 1.5;
      this.pitch -= dy * MOUSE_SENSITIVITY * 1.5;
      this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
      this.lastDragX = e.clientX;
      this.lastDragY = e.clientY;
    }
  }

  private handleMouseDown(e: MouseEvent): void {
    if (this.freeLook && e.button === 0) {
      this.isDragging = true;
      this.lastDragX = e.clientX;
      this.lastDragY = e.clientY;
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    if (e.button === 0) {
      this.isDragging = false;
    }
  }

  /** Enable free-look mode for browsers where pointer lock is blocked. */
  enableFreeLook(): void {
    this.freeLook = true;
    this.onLockChange?.(true); // Tell the UI we've "entered" the museum
  }

  disableFreeLook(): void {
    this.freeLook = false;
    this.isDragging = false;
    this.keys = {};
    this.onLockChange?.(false);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.isLocked && !this.freeLook) return;
    // ESC pauses free-look mode (browsers handle ESC for pointer lock automatically)
    if (e.key === "Escape" && this.freeLook) {
      this.disableFreeLook();
      return;
    }
    this.keys[e.code] = true;
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keys[e.code] = false;
  }

  get locked(): boolean {
    return this.isLocked || this.freeLook;
  }

  // Returns desired movement delta (before collision)
  update(dt: number): THREE.Vector3 {
    // Calculate movement direction in XZ plane
    const forward = new THREE.Vector3(
      -Math.sin(this.yaw),
      0,
      -Math.cos(this.yaw)
    );
    const right = new THREE.Vector3(
      Math.cos(this.yaw),
      0,
      -Math.sin(this.yaw)
    );

    this.velocity.set(0, 0, 0);

    if (this.keys["KeyW"] || this.keys["ArrowUp"]) this.velocity.add(forward);
    if (this.keys["KeyS"] || this.keys["ArrowDown"]) this.velocity.sub(forward);
    if (this.keys["KeyA"] || this.keys["ArrowLeft"]) this.velocity.sub(right);
    if (this.keys["KeyD"] || this.keys["ArrowRight"]) this.velocity.add(right);

    if (this.velocity.lengthSq() > 0) {
      this.velocity.normalize().multiplyScalar(MOVE_SPEED * dt);
    }

    // Apply rotation to camera
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, "YXZ");
    this.camera.quaternion.setFromEuler(euler);

    return this.velocity.clone();
  }

  // Apply position after collision resolution
  applyMovement(delta: THREE.Vector3): void {
    this.position.add(delta);
    this.position.y = EYE_HEIGHT;
    this.camera.position.copy(this.position);
  }

  setPosition(x: number, z: number): void {
    this.position.set(x, EYE_HEIGHT, z);
    this.camera.position.copy(this.position);
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
