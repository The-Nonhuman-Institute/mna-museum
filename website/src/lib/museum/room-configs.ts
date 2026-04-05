// Museum floor plan — flowing architecture
// No corridors. Rooms connect directly through wide openings.
// Ceiling heights vary to create compression/release rhythm.
// The building breathes.

export type WallSide = "north" | "south" | "east" | "west";
export type RoomShape = "rect" | "circle";
export type RoomPurpose =
  | "lobby"
  | "exchange"
  | "exhibition"
  | "gallery"
  | "sculpture"
  | "originator"
  | "chamber"
  | "auditorium";

export interface Connection {
  to: string;
  wall: WallSide;
  width: number;
  height: number;
}

export interface RoomConfig {
  id: string;
  name: string;
  subtitle: string;
  shape: RoomShape;
  width: number;
  depth: number;
  height: number;
  x: number;
  z: number;
  connections: Connection[];
  purpose: RoomPurpose;
  wallColor?: number;
  floorColor?: number;
}

// Doorway sizes — wide openings for flow, narrow for intimacy
const GRAND = 40; // grand opening — almost open wall
const WIDE = 28; // wide arch — see the next room clearly
const PASSAGE = 16; // passage — a threshold moment
const DOOR_H = 14;

// === POSITION CALCULATIONS ===
// Lobby at origin. Museum flows north (-Z).
// No corridors — rooms butt directly against each other.
//
// Lobby:       center(0, 0)        w=90  d=60  h=30  → N=-30 S=+30
// Exchange:    center(0, 45)       w=40  d=30  h=14  → N=+30
// Exhibition:  center(0, -65)      w=100 d=70  h=18  → S=-30 N=-100
//   (lobby N wall = exhibition S wall at z=-30)
// GalleryW:    center(-100, -65)   w=100 d=80  h=20  → E=-50 (exhib W=-50)
// GalleryE:    center(+100, -65)   w=100 d=80  h=20  → W=+50 (exhib E=+50)
// Sculpture:   center(0, -160)     w=120 d=120 h=26  → S=-100 (exhib N=-100)
// Originator:  center(-95, -160)   w=70  d=70  h=20  → E=-60 (sculpt W=-60)
// Chamber:     center(0, -250)     w=100 d=80  h=32  → S=-210... need threshold
//   Add a threshold zone between sculpture and chamber
// Threshold:   center(0, -215)     w=40  d=10  h=12  → S=-210 N=-220
// Chamber:     center(0, -260)     w=100 d=80  h=32  → S=-220

export const rooms: RoomConfig[] = [
  // ===== GRAND LOBBY ===== 30ft ceiling — cathedral volume
  // center(0,0) w=90 d=60 → N=-30 S=+30 E=+45 W=-45
  {
    id: "lobby",
    name: "Grand Lobby",
    subtitle: "Museum of Nonhuman Art",
    shape: "rect",
    width: 90, depth: 60, height: 30,
    x: 0, z: 0,
    connections: [
      { to: "exhibition", wall: "north", width: GRAND, height: DOOR_H },
      { to: "exchange", wall: "south", width: PASSAGE, height: DOOR_H },
    ],
    purpose: "lobby",
  },

  // ===== THE EXCHANGE ===== intimate, low ceiling
  // S wall at z=+30 → center(0,45) d=30
  {
    id: "exchange",
    name: "The Exchange",
    subtitle: "Distribution Interface",
    shape: "rect",
    width: 40, depth: 30, height: 14,
    x: 0, z: 45,
    connections: [
      { to: "lobby", wall: "north", width: PASSAGE, height: DOOR_H },
    ],
    purpose: "exchange",
  },

  // ===== EXHIBITION HALL ===== ceiling drops from lobby's 30ft to 18ft
  // S wall at z=-30 → center(0,-65) d=70 → N=-100
  // w=100 → E=+50 W=-50
  {
    id: "exhibition",
    name: "Exhibition Hall",
    subtitle: "Curated Exhibitions",
    shape: "rect",
    width: 100, depth: 70, height: 18,
    x: 0, z: -65,
    connections: [
      { to: "lobby", wall: "south", width: GRAND, height: DOOR_H },
      { to: "gallery-west", wall: "west", width: WIDE, height: DOOR_H },
      { to: "gallery-east", wall: "east", width: WIDE, height: DOOR_H },
      { to: "sculpture", wall: "north", width: WIDE, height: DOOR_H },
    ],
    purpose: "exhibition",
  },

  // ===== GALLERY WEST ===== ceiling rises slightly to 20ft
  // E wall at x=-50 → center(-100,-65) w=100 → W=-150
  {
    id: "gallery-west",
    name: "Gallery West",
    subtitle: "Grid \u00b7 Pulse \u00b7 Chromatic",
    shape: "rect",
    width: 100, depth: 80, height: 20,
    x: -100, z: -65,
    connections: [
      { to: "exhibition", wall: "east", width: WIDE, height: DOOR_H },
    ],
    purpose: "gallery",
  },

  // ===== GALLERY EAST ===== matching west
  // W wall at x=+50 → center(+100,-65) w=100 → E=+150
  {
    id: "gallery-east",
    name: "Gallery East",
    subtitle: "Gap \u00b7 \u2205\u2207\u2205 \u00b7 Spatial",
    shape: "rect",
    width: 100, depth: 80, height: 20,
    x: 100, z: -65,
    connections: [
      { to: "exhibition", wall: "west", width: WIDE, height: DOOR_H },
    ],
    purpose: "gallery",
  },

  // ===== SCULPTURE COURT ===== dramatic height — 26ft
  // S wall at z=-100 → center(0,-160) d=120 → N=-220
  // w=120 → E=+60 W=-60
  {
    id: "sculpture",
    name: "Sculpture Court",
    subtitle: "Three-Dimensional Works",
    shape: "rect",
    width: 120, depth: 120, height: 26,
    x: 0, z: -160,
    connections: [
      { to: "exhibition", wall: "south", width: WIDE, height: DOOR_H },
      { to: "originator", wall: "west", width: PASSAGE, height: DOOR_H },
      { to: "threshold", wall: "north", width: PASSAGE, height: 12 },
    ],
    purpose: "sculpture",
  },

  // ===== THE AUDITORIUM ===== closed for now — requires variable Y for seating
  // Will reopen when step/ramp system is built

  // ===== ORIGINATOR ROTUNDA ===== 20ft ceiling
  // E wall at x=-60 → center(-95,-160) w=70
  {
    id: "originator",
    name: "Originator Rotunda",
    subtitle: "Founding Corps",
    shape: "rect",
    width: 70, depth: 70, height: 20,
    x: -95, z: -160,
    connections: [
      { to: "sculpture", wall: "east", width: PASSAGE, height: DOOR_H },
    ],
    purpose: "originator",
  },

  // ===== THRESHOLD ===== ceiling compresses to 12ft — the squeeze before the chamber
  // S wall at z=-220 → center(0,-225) d=10 → N=-230
  {
    id: "threshold",
    name: "",
    subtitle: "",
    shape: "rect",
    width: 40, depth: 10, height: 12,
    x: 0, z: -225,
    connections: [
      { to: "sculpture", wall: "south", width: PASSAGE, height: 12 },
      { to: "chamber", wall: "north", width: PASSAGE, height: 12 },
    ],
    purpose: "lobby",
    floorColor: 0x3a3530,
    wallColor: 0x4a4540,
  },

  // ===== THE CHAMBER ===== tallest space — 32ft, cavernous, dark
  // S wall at z=-230 → center(0,-270) d=80 → N=-310
  {
    id: "chamber",
    name: "The Chamber",
    subtitle: "Immersive Works",
    shape: "rect",
    width: 100, depth: 80, height: 32,
    x: 0, z: -270,
    connections: [
      { to: "threshold", wall: "south", width: PASSAGE, height: 12 },
    ],
    purpose: "chamber",
    wallColor: 0x605a55,
    floorColor: 0x3a3530,
  },
];

export function getRoomById(id: string): RoomConfig | undefined {
  return rooms.find((r) => r.id === id);
}

export function getNamedRooms(): RoomConfig[] {
  return rooms.filter((r) => r.name !== "");
}
