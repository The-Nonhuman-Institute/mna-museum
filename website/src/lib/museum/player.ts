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
  private domElement: HTMLElement;
  private velocity = new THREE.Vector3();

  // Expose for collision system
  position = new THREE.Vector3(0, EYE_HEIGHT, 0);

  // Callbacks
  onLockChange?: (locked: boolean) => void;

  constructor(domElement: HTMLElement, aspect: number) {
    this.domElement = domElement;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 500);
    this.camera.position.copy(this.position);

    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.handleLockChange = this.handleLockChange.bind(this);

    this.attach();
  }

  private attach(): void {
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("keyup", this.handleKeyUp);
    this.domElement.addEventListener("click", this.handleClick);
    document.addEventListener("pointerlockchange", this.handleLockChange);
  }

  detach(): void {
    document.removeEventListener("mousemove", this.handleMouseMove);
    document.removeEventListener("keydown", this.handleKeyDown);
    document.removeEventListener("keyup", this.handleKeyUp);
    this.domElement.removeEventListener("click", this.handleClick);
    document.removeEventListener("pointerlockchange", this.handleLockChange);
    if (this.isLocked) {
      document.exitPointerLock();
    }
  }

  private handleClick(): void {
    if (!this.isLocked) {
      this.domElement.requestPointerLock();
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
    if (!this.isLocked) return;

    this.yaw -= e.movementX * MOUSE_SENSITIVITY;
    this.pitch -= e.movementY * MOUSE_SENSITIVITY;
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.isLocked) return;
    this.keys[e.code] = true;
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keys[e.code] = false;
  }

  get locked(): boolean {
    return this.isLocked;
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
