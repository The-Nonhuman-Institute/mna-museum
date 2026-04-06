import { rooms, type RoomConfig } from "./room-configs";

const MAP_SIZE = 800;

/**
 * Draw the museum floor plan onto a canvas.
 * Returns the canvas element. Call with playerX/playerZ to update "You Are Here".
 */
export function drawMuseumMap(
  playerX: number,
  playerZ: number
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = MAP_SIZE;
  canvas.height = MAP_SIZE;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#1a1815";
  ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

  // Title
  ctx.fillStyle = "#d0ccc6";
  ctx.font = "bold 24px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("MUSEUM FLOOR PLAN", 400, 40);
  ctx.fillStyle = "#4a4540";
  ctx.fillRect(280, 55, 240, 1);

  // Calculate bounds
  const namedRooms = rooms.filter((r) => r.name !== "");
  let minRX = Infinity, maxRX = -Infinity, minRZ = Infinity, maxRZ = -Infinity;
  for (const r of namedRooms) {
    minRX = Math.min(minRX, r.x - r.width / 2);
    maxRX = Math.max(maxRX, r.x + r.width / 2);
    minRZ = Math.min(minRZ, r.z - r.depth / 2);
    maxRZ = Math.max(maxRZ, r.z + r.depth / 2);
  }

  const margin = 60;
  const mapW = MAP_SIZE - margin * 2;
  const mapH = 660;
  const mapTop = 70;
  const worldW = maxRX - minRX;
  const worldD = maxRZ - minRZ;
  const scale = Math.min(mapW / worldW, mapH / worldD) * 0.88;

  const toX = (wx: number) => margin + mapW / 2 + (wx - (minRX + maxRX) / 2) * scale;
  const toY = (wz: number) => mapTop + mapH / 2 + (wz - (minRZ + maxRZ) / 2) * scale;

  // Draw rooms
  for (const r of namedRooms) {
    const rx = toX(r.x) - (r.width * scale) / 2;
    const ry = toY(r.z) - (r.depth * scale) / 2;
    const rw = r.width * scale;
    const rh = r.depth * scale;

    const isHere = r.x - r.width / 2 <= playerX && playerX <= r.x + r.width / 2 &&
                   r.z - r.depth / 2 <= playerZ && playerZ <= r.z + r.depth / 2;

    ctx.fillStyle = isHere ? "#3a5040" : "#2a2825";
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = "#4a4540";
    ctx.lineWidth = 1;
    ctx.strokeRect(rx, ry, rw, rh);

    ctx.fillStyle = isHere ? "#90c0a0" : "#9a9590";
    const fontSize = Math.min(16, Math.max(9, rw * 0.12));
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(r.name, rx + rw / 2, ry + rh / 2 + fontSize / 3);
  }

  // Player marker
  const px = toX(playerX);
  const py = toY(playerZ);
  ctx.fillStyle = "#e04040";
  ctx.beginPath();
  ctx.arc(px, py, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff6060";
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("YOU ARE HERE", px + 10, py + 4);

  // Stats
  ctx.fillStyle = "#706a60";
  ctx.font = "14px monospace";
  ctx.textAlign = "center";
  ctx.fillText("43 Canon · 108 Works · 6 Originators · Phase I", 400, 775);

  return canvas;
}
