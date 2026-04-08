import * as THREE from "three";

// First-person player controller
// Pointer lock for mouse look, WASD for movement
// Touch devices: split-screen dual-touch (left half = move, right half = look)
// Eye height 5.5ft, movement speed 8 ft/sec

const EYE_HEIGHT = 5.5;
const MOVE_SPEED = 8;
const MOUSE_SENSITIVITY = 0.002;
const TOUCH_LOOK_SENSITIVITY = 0.005;
const PITCH_LIMIT = Math.PI / 2 - 0.05; // prevent gimbal lock

// Touch movement stick: how far the thumb must drag before full-speed movement
const TOUCH_MOVE_DEAD_ZONE = 8;   // pixels — ignore tiny jitters
const TOUCH_MOVE_MAX_RADIUS = 72; // pixels — beyond this = max speed

interface TouchTrack {
  id: number;
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
}

export interface TouchStateSnapshot {
  active: boolean;
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  maxRadius: number;
}

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

  // Touch input state (mobile/tablet).
  private touchEnabled = false;
  private moveTouch: TouchTrack | null = null;
  private lookTouch: TouchTrack | null = null;
  private touchVelocity = new THREE.Vector3(); // x = strafe, z = forward component

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
    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);

    this.attach();
  }

  private attach(): void {
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("mousedown", this.handleMouseDown);
    document.addEventListener("mouseup", this.handleMouseUp);
    document.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("keyup", this.handleKeyUp);
    document.addEventListener("pointerlockchange", this.handleLockChange);
    // Touch listeners attach to the canvas, not document, so they don't
    // intercept taps on HUD buttons rendered over the canvas.
    this.domElement.addEventListener("touchstart", this.handleTouchStart, { passive: false });
    this.domElement.addEventListener("touchmove", this.handleTouchMove, { passive: false });
    this.domElement.addEventListener("touchend", this.handleTouchEnd, { passive: false });
    this.domElement.addEventListener("touchcancel", this.handleTouchEnd, { passive: false });
  }

  detach(): void {
    document.removeEventListener("mousemove", this.handleMouseMove);
    document.removeEventListener("mousedown", this.handleMouseDown);
    document.removeEventListener("mouseup", this.handleMouseUp);
    document.removeEventListener("keydown", this.handleKeyDown);
    document.removeEventListener("keyup", this.handleKeyUp);
    document.removeEventListener("pointerlockchange", this.handleLockChange);
    this.domElement.removeEventListener("touchstart", this.handleTouchStart);
    this.domElement.removeEventListener("touchmove", this.handleTouchMove);
    this.domElement.removeEventListener("touchend", this.handleTouchEnd);
    this.domElement.removeEventListener("touchcancel", this.handleTouchEnd);
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

  /**
   * Enable touch controls for phones and tablets. Split-screen dual-touch:
   * left half of the canvas becomes a virtual movement stick, right half
   * becomes a look area. Sets touch-action: none on the canvas so browsers
   * don't intercept touches with scroll/zoom gestures.
   */
  enableTouchMode(): void {
    if (this.touchEnabled) return;
    this.touchEnabled = true;
    // Prevent the browser from turning touches into scrolls/zooms on the canvas.
    this.domElement.style.touchAction = "none";
    // Touch mode implies free-look: no pointer-lock, no keyboard WASD.
    if (!this.freeLook) {
      this.enableFreeLook();
    }
  }

  disableTouchMode(): void {
    if (!this.touchEnabled) return;
    this.touchEnabled = false;
    this.domElement.style.touchAction = "";
    this.moveTouch = null;
    this.lookTouch = null;
    this.touchVelocity.set(0, 0, 0);
  }

  /** Return a read-only snapshot of the movement touch state, for the HUD to visualize a joystick. */
  getTouchState(): TouchStateSnapshot {
    const t = this.moveTouch;
    if (!t) {
      return { active: false, originX: 0, originY: 0, currentX: 0, currentY: 0, maxRadius: TOUCH_MOVE_MAX_RADIUS };
    }
    return {
      active: true,
      originX: t.originX,
      originY: t.originY,
      currentX: t.currentX,
      currentY: t.currentY,
      maxRadius: TOUCH_MOVE_MAX_RADIUS,
    };
  }

  private handleTouchStart(e: TouchEvent): void {
    if (!this.touchEnabled) return;
    const rect = this.domElement.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    let claimed = false;

    for (const touch of Array.from(e.changedTouches)) {
      const onLeft = touch.clientX < midX;
      if (onLeft && !this.moveTouch) {
        this.moveTouch = {
          id: touch.identifier,
          originX: touch.clientX,
          originY: touch.clientY,
          currentX: touch.clientX,
          currentY: touch.clientY,
        };
        claimed = true;
      } else if (!onLeft && !this.lookTouch) {
        this.lookTouch = {
          id: touch.identifier,
          originX: touch.clientX,
          originY: touch.clientY,
          currentX: touch.clientX,
          currentY: touch.clientY,
        };
        claimed = true;
      }
    }

    if (claimed) e.preventDefault();
  }

  private handleTouchMove(e: TouchEvent): void {
    if (!this.touchEnabled) return;
    let handled = false;

    for (const touch of Array.from(e.changedTouches)) {
      if (this.moveTouch && touch.identifier === this.moveTouch.id) {
        this.moveTouch.currentX = touch.clientX;
        this.moveTouch.currentY = touch.clientY;
        // Compute normalized stick vector from origin.
        const dx = this.moveTouch.currentX - this.moveTouch.originX;
        const dy = this.moveTouch.currentY - this.moveTouch.originY;
        const mag = Math.sqrt(dx * dx + dy * dy);
        if (mag < TOUCH_MOVE_DEAD_ZONE) {
          this.touchVelocity.set(0, 0, 0);
        } else {
          // Dead-zone-corrected magnitude, capped at 1.
          const effective = Math.min(
            1,
            (mag - TOUCH_MOVE_DEAD_ZONE) / (TOUCH_MOVE_MAX_RADIUS - TOUCH_MOVE_DEAD_ZONE)
          );
          const nx = (dx / mag) * effective;
          const ny = (dy / mag) * effective;
          // touchVelocity.x = strafe right positive, z = forward.
          // Dragging UP on the stick (ny < 0) should move FORWARD in +forward direction;
          // update() below treats z positive as "back in forward direction", so we set
          // touchVelocity.z = ny (drag up → negative → multiplied by -forward → +forward).
          this.touchVelocity.set(nx, 0, ny);
        }
        handled = true;
      } else if (this.lookTouch && touch.identifier === this.lookTouch.id) {
        const dx = touch.clientX - this.lookTouch.currentX;
        const dy = touch.clientY - this.lookTouch.currentY;
        this.yaw -= dx * TOUCH_LOOK_SENSITIVITY;
        this.pitch -= dy * TOUCH_LOOK_SENSITIVITY;
        this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch));
        this.lookTouch.currentX = touch.clientX;
        this.lookTouch.currentY = touch.clientY;
        handled = true;
      }
    }

    if (handled) e.preventDefault();
  }

  private handleTouchEnd(e: TouchEvent): void {
    if (!this.touchEnabled) return;
    for (const touch of Array.from(e.changedTouches)) {
      if (this.moveTouch && touch.identifier === this.moveTouch.id) {
        this.moveTouch = null;
        this.touchVelocity.set(0, 0, 0);
      }
      if (this.lookTouch && touch.identifier === this.lookTouch.id) {
        this.lookTouch = null;
      }
    }
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

    // Keyboard (WASD / arrow) input
    if (this.keys["KeyW"] || this.keys["ArrowUp"]) this.velocity.add(forward);
    if (this.keys["KeyS"] || this.keys["ArrowDown"]) this.velocity.sub(forward);
    if (this.keys["KeyA"] || this.keys["ArrowLeft"]) this.velocity.sub(right);
    if (this.keys["KeyD"] || this.keys["ArrowRight"]) this.velocity.add(right);

    // Touch input — dragged stick position becomes a scaled movement vector.
    // touchVelocity.x = strafe, touchVelocity.z = forward/back (drag up = -z = forward).
    if (this.touchEnabled && this.touchVelocity.lengthSq() > 0.0001) {
      this.velocity.addScaledVector(forward, -this.touchVelocity.z);
      this.velocity.addScaledVector(right, this.touchVelocity.x);
    }

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
