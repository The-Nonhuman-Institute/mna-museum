"use client";

import { useRef, useEffect } from "react";
import * as THREE from "three";

interface SceneLight {
  type: "ambient" | "directional" | "point";
  color?: string;
  intensity?: number;
  position?: number[];
}

interface SceneObject {
  shape: "box" | "sphere" | "cylinder" | "cone" | "torus" | "plane";
  position?: number[];
  rotation?: number[];
  scale?: number[];
  color?: string;
  opacity?: number;
  metalness?: number;
  roughness?: number;
}

interface SceneData {
  bg?: string;
  camera?: { x?: number; y?: number; z?: number; lookAt?: number[] };
  lights?: SceneLight[];
  objects?: SceneObject[];
}

function createGeometry(shape: string): THREE.BufferGeometry {
  switch (shape) {
    case "sphere":
      return new THREE.SphereGeometry(0.5, 32, 32);
    case "cylinder":
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
    case "cone":
      return new THREE.ConeGeometry(0.5, 1, 32);
    case "torus":
      return new THREE.TorusGeometry(0.5, 0.15, 16, 48);
    case "plane":
      return new THREE.PlaneGeometry(1, 1);
    case "box":
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

export default function SceneRenderer({ json, transparent = false }: { json: string; transparent?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let scene: SceneData;
    try {
      scene = JSON.parse(json);
    } catch {
      // Try to salvage truncated JSON
      try {
        let text = json.trim();
        const quoteCount = (text.match(/"/g) || []).length;
        if (quoteCount % 2 !== 0) text = text.substring(0, text.lastIndexOf('"'));
        for (let i = text.length; i > 0; i--) {
          const candidate = text.substring(0, i);
          if (!candidate.endsWith("}") && !candidate.endsWith("]")) continue;
          const ob = (candidate.match(/\[/g) || []).length - (candidate.match(/\]/g) || []).length;
          const oc = (candidate.match(/\{/g) || []).length - (candidate.match(/\}/g) || []).length;
          const closed = candidate + "]".repeat(Math.max(0, ob)) + "}".repeat(Math.max(0, oc));
          try {
            const parsed = JSON.parse(closed);
            if (parsed.objects) { scene = parsed; break; }
          } catch { continue; }
        }
        if (!scene!) return;
      } catch {
        return;
      }
    }

    // Setup
    const width = container.clientWidth;
    const height = container.clientHeight;

    const threeScene = new THREE.Scene();
    if (transparent) {
      threeScene.background = null;
    } else if (scene.bg) {
      threeScene.background = new THREE.Color(scene.bg);
    } else {
      threeScene.background = null;
    }

    // Calculate bounding box for auto-camera when on plinth
    const sceneCenter = new THREE.Vector3(0, 0, 0);
    let sceneSize = 3;
    if (scene.objects && scene.objects.length > 0) {
      const box = new THREE.Box3();
      for (const obj of scene.objects) {
        const [px, py, pz] = obj.position || [0, 0, 0];
        const [sx, sy, sz] = obj.scale || [1, 1, 1];
        box.expandByPoint(new THREE.Vector3(px - sx/2, py - sy/2, pz - sz/2));
        box.expandByPoint(new THREE.Vector3(px + sx/2, py + sy/2, pz + sz/2));
      }
      box.getCenter(sceneCenter);
      sceneSize = box.getSize(new THREE.Vector3()).length();
    }

    // Camera
    const cam = scene.camera || {};
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);

    if (transparent) {
      // Plinth mode: auto-position camera to frame the sculpture
      // Look slightly down at the center, from a distance that fits the whole thing
      const dist = sceneSize * 1.4;
      camera.position.set(dist * 0.6, sceneCenter.y + dist * 0.3, dist * 0.8);
      camera.lookAt(sceneCenter);
    } else {
      camera.position.set(cam.x ?? 0, cam.y ?? 3, cam.z ?? 6);
      const la = cam.lookAt || [0, 0, 0];
      camera.lookAt(new THREE.Vector3(la[0], la[1], la[2]));
    }
    const lookAt = [sceneCenter.x, sceneCenter.y, sceneCenter.z];

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: transparent || !scene.bg,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    if (scene.lights && scene.lights.length > 0) {
      for (const light of scene.lights) {
        const color = new THREE.Color(light.color || "#ffffff");
        const intensity = light.intensity ?? 0.5;

        if (light.type === "ambient") {
          threeScene.add(new THREE.AmbientLight(color, intensity));
        } else if (light.type === "directional") {
          const dl = new THREE.DirectionalLight(color, intensity);
          const pos = light.position || [5, 10, 5];
          dl.position.set(pos[0], pos[1], pos[2]);
          threeScene.add(dl);
        } else if (light.type === "point") {
          const pl = new THREE.PointLight(color, intensity);
          const pos = light.position || [0, 5, 0];
          pl.position.set(pos[0], pos[1], pos[2]);
          threeScene.add(pl);
        }
      }
    } else {
      // Default lighting
      threeScene.add(new THREE.AmbientLight(0xffffff, 0.4));
      const dl = new THREE.DirectionalLight(0xffffff, 0.8);
      dl.position.set(5, 10, 5);
      threeScene.add(dl);
    }

    // Objects
    if (scene.objects) {
      for (const obj of scene.objects) {
        const geometry = createGeometry(obj.shape);
        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(obj.color || "#888888"),
          metalness: obj.metalness ?? 0.1,
          roughness: obj.roughness ?? 0.6,
          transparent: (obj.opacity ?? 1) < 1,
          opacity: obj.opacity ?? 1,
        });

        const mesh = new THREE.Mesh(geometry, material);

        if (obj.position) mesh.position.set(obj.position[0], obj.position[1], obj.position[2]);
        if (obj.rotation) mesh.rotation.set(obj.rotation[0], obj.rotation[1], obj.rotation[2]);
        if (obj.scale) mesh.scale.set(obj.scale[0], obj.scale[1], obj.scale[2]);

        threeScene.add(mesh);
      }
    }

    // Slow auto-rotation
    let animId: number;
    let angle = 0;
    const radius = Math.sqrt((cam.x ?? 0) ** 2 + (cam.z ?? 6) ** 2);
    const baseY = cam.y ?? 3;
    const initialAngle = Math.atan2(cam.z ?? 6, cam.x ?? 0);
    angle = initialAngle;

    function animate() {
      angle += 0.002;
      camera.position.x = Math.sin(angle) * radius;
      camera.position.z = Math.cos(angle) * radius;
      camera.position.y = baseY;
      camera.lookAt(new THREE.Vector3(lookAt[0], lookAt[1], lookAt[2]));

      renderer.render(threeScene, camera);
      animId = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      cancelAnimationFrame(animId);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
    };
  }, [json]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
