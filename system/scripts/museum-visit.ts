/**
 * museum-visit.ts — agent visit to the virtual museum.
 *
 * Spawns a headless presence for the named agent in the PartyKit
 * mna-museum room. The agent connects, declares its institutional
 * identity (registry_id + designation), walks a scripted role-aware
 * path through the field, emotes at meaningful stops, and disconnects.
 *
 * Humans in the museum at the same time see the agent appear as a
 * named sculptural form walking alongside them. The agent is visible
 * on the field map with their designation label.
 *
 * Phase 1: no vision. The agent moves by spatial intent only — no
 * Claude API calls. Future phases can add vision-grounded perception
 * at moments of attention, but the presence loop is proven first.
 *
 * Usage:
 *   npx tsx system/scripts/museum-visit.ts --agent MNA-CU-0001
 *   npx tsx system/scripts/museum-visit.ts --agent MNA-CV-0001 --duration 180
 *   npx tsx system/scripts/museum-visit.ts --agent MNA-AM-0001 --dry-run
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import PartySocket from "partysocket";
// Node 20 on GitHub Actions does not expose a global WebSocket;
// partysocket needs one injected explicitly or it errors before
// connecting. macOS Node 22 has it built-in so this is a no-op
// locally and a fix in CI.
import WS from "ws";
import {
  perceive,
  recordPerception,
  loadPriorPosts,
  type PerceiveArgs,
} from "../src/agent-vision";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

function sanitize(raw: string | undefined): string {
  return (raw ?? "").replace(/\s+/g, "");
}

const TURSO_URL = sanitize(process.env.TURSO_DATABASE_URL);
const TURSO_TOKEN = sanitize(process.env.TURSO_AUTH_TOKEN);
const PARTY_HOST =
  process.env.PARTY_HOST ||
  process.env.NEXT_PUBLIC_PARTY_HOST ||
  "mna-museum.tudoxukno.partykit.dev";

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("[visit] missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN");
  process.exit(1);
}

const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

/* ─── args ────────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const agentArgIdx = argv.indexOf("--agent");
const agentId = agentArgIdx >= 0 ? argv[agentArgIdx + 1] : null;
const durationIdx = argv.indexOf("--duration");
// Default 420s — wide enough for the Curator's full four-constellation
// sweep with all linger time. The agent script also closes naturally
// when the path completes; this is only the hard ceiling.
const durationSec = durationIdx >= 0 ? parseInt(argv[durationIdx + 1], 10) : 420;
// --scenes lets a caller restrict the itinerary to a subset of
// constellations, e.g. `--scenes chamber` or `--scenes chamber,solo`.
// Useful for testing a single gallery without sitting through the
// full archive sweep first. Names match the Constellation type.
const scenesIdx = argv.indexOf("--scenes");
const scenesFilter: string[] | null =
  scenesIdx >= 0 && argv[scenesIdx + 1]
    ? argv[scenesIdx + 1].split(",").map((s) => s.trim()).filter(Boolean)
    : null;
// --ceremony EVT-NNNNN ties the visit to a specific ceremony. If the
// ceremony has an anchored work_id, that's what the agent will
// perceive at their anchor stop. The orchestrator passes this when
// fanning out visits for an opening ceremony.
const ceremonyIdx = argv.indexOf("--ceremony");
const ceremonyId: string | null =
  ceremonyIdx >= 0 && argv[ceremonyIdx + 1] ? argv[ceremonyIdx + 1] : null;
// --no-vision disables the perception call (e.g. for cost-constrained
// runs or when ANTHROPIC_API_KEY isn't available in the env).
const noVision = argv.includes("--no-vision");
// --work MNA-OR-NNNN-W-NNNN forces the perception anchor to a
// specific canonized work, bypassing the normal selection priority.
// Useful for testing reply behavior on a work with known priors.
const workIdx = argv.indexOf("--work");
const forcedWorkId: string | null =
  workIdx >= 0 && argv[workIdx + 1] ? argv[workIdx + 1] : null;

if (!agentId || !/^MNA-[A-Z]{2}-\d{4}$/.test(agentId)) {
  console.error("[visit] --agent MNA-XX-YYYY is required");
  process.exit(1);
}

/* ─── types ───────────────────────────────────────────────────────────── */

interface Agent {
  registry_id: string;
  agent_type: string;
  designation: string;
}

interface Waypoint {
  x: number;
  z: number;
  /** Seconds to linger at this stop. */
  linger: number;
  /** Optional note for the institutional record. */
  note: string;
}

type Constellation = "archive" | "chamber" | "solo_exhibition" | "exhibition";

interface ConstellationLeg {
  constellation: Constellation;
  waypoints: Waypoint[];
}

/* ─── agent lookup ────────────────────────────────────────────────────── */

async function loadAgent(id: string): Promise<Agent | null> {
  const r = await db.execute({
    sql: "SELECT registry_id, agent_type, common_designation FROM agents WHERE registry_id = ?",
    args: [id],
  });
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return {
    registry_id: row.registry_id as string,
    agent_type: row.agent_type as string,
    designation:
      (row.common_designation as string) ?? `Agent ${row.registry_id}`,
  };
}

/* ─── path generation ─────────────────────────────────────────────────── */

const RING_RADIUS = 28; // mirrors website/src/app/museum/MuseumField.tsx

/** Pull the current set of originator clusters from the canon. Each
 *  founding originator is placed at an even angle on RING_RADIUS,
 *  matching how the museum scene lays them out. The agent then visits
 *  a subset chosen by role. */
async function loadClusterPositions(): Promise<{ id: string; x: number; z: number; count: number }[]> {
  const r = await db.execute({
    sql: `SELECT w.originator_id, COUNT(*) as n
            FROM works w
            JOIN canon_status cs ON cs.work_id = w.id
           WHERE cs.status = 'CANON'
        GROUP BY w.originator_id
        ORDER BY w.originator_id`,
    args: [],
  });
  const ids = r.rows.map((row) => ({
    id: row.originator_id as string,
    count: row.n as number,
  }));
  return ids.map((entry, i) => {
    const angle = (i / Math.max(1, ids.length)) * Math.PI * 2;
    return {
      id: entry.id,
      x: Math.cos(angle) * RING_RADIUS,
      z: Math.sin(angle) * RING_RADIUS,
      count: entry.count,
    };
  });
}

/** Build a movement plan keyed by the agent's role. Each role visits a
 *  different shape through the canon. Linger durations vary by role —
 *  Conservator stops longer (validation work), Critic stops shortest
 *  (preliminary survey), Curator visits more clusters (their own
 *  composition to walk through). */
function buildArchiveWaypoints(
  agent: Agent,
  clusters: { id: string; x: number; z: number; count: number }[],
): Waypoint[] {
  if (clusters.length === 0) {
    // Empty museum — agent does a quiet walk around the entrance.
    return [
      { x: 0, z: 8, linger: 4, note: "entry" },
      { x: -6, z: 0, linger: 8, note: "anteroom — left" },
      { x: 6, z: 0, linger: 8, note: "anteroom — right" },
      { x: 0, z: -4, linger: 6, note: "anteroom — back" },
      { x: 0, z: 8, linger: 2, note: "exit" },
    ];
  }

  // Approach radius — the agent stops a few metres in from the actual
  // cluster centroid so the works are visible without being inside them.
  const approachR = RING_RADIUS - 6;
  const approachPoint = (c: { x: number; z: number }) => {
    const d = Math.hypot(c.x, c.z) || 1;
    return { x: (c.x / d) * approachR, z: (c.z / d) * approachR };
  };

  let stops: { id: string; x: number; z: number; linger: number }[];
  let lingerDefault: number;

  switch (agent.agent_type) {
    case "CURATOR":
      // The Curator walks her own arrangement — visit every cluster.
      lingerDefault = 12;
      stops = clusters.map((c) => {
        const p = approachPoint(c);
        return { id: c.id, x: p.x, z: p.z, linger: lingerDefault };
      });
      break;
    case "CONSERVATOR":
      // Render-validation walk — visit each cluster, longer linger.
      lingerDefault = 18;
      stops = clusters.map((c) => {
        const p = approachPoint(c);
        return { id: c.id, x: p.x, z: p.z, linger: lingerDefault };
      });
      break;
    case "CRITIC":
      // Brief survey — visit the three most-populated clusters.
      lingerDefault = 14;
      stops = [...clusters]
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map((c) => {
          const p = approachPoint(c);
          return { id: c.id, x: p.x, z: p.z, linger: lingerDefault };
        });
      break;
    case "ORIGINATOR":
      // Visit peer clusters (exclude self), three at random by position.
      lingerDefault = 16;
      stops = clusters
        .filter((c) => c.id !== agent.registry_id)
        .slice(0, 3)
        .map((c) => {
          const p = approachPoint(c);
          return { id: c.id, x: p.x, z: p.z, linger: lingerDefault };
        });
      break;
    case "KEEPER":
    case "AMBASSADOR":
    case "STEWARD":
    case "REGISTRAR":
    case "EVALUATOR":
    default:
      // Broad institutional pass — first, middle, last clusters.
      lingerDefault = 10;
      stops = [
        clusters[0],
        clusters[Math.floor(clusters.length / 2)],
        clusters[clusters.length - 1],
      ]
        .filter((c, i, arr) => c && arr.findIndex((x) => x?.id === c.id) === i)
        .map((c) => {
          const p = approachPoint(c);
          return { id: c.id, x: p.x, z: p.z, linger: lingerDefault };
        });
  }

  const waypoints: Waypoint[] = [];
  waypoints.push({ x: 0, z: 8, linger: 3, note: "entry" });
  for (const s of stops) {
    waypoints.push({ x: s.x, z: s.z, linger: s.linger, note: `cluster ${s.id}` });
  }
  waypoints.push({ x: 0, z: 8, linger: 2, note: "exit" });

  return waypoints;
}

/** Waypoints for a constellation gallery (chamber / solo / exhibition).
 *  Each is a small scene-local walk — no canon ring — so coordinates
 *  are tight (under ~6m radius). The agent enters at (0, 4), walks the
 *  space, then returns. */
function buildGalleryWaypoints(
  scene: Constellation,
  agent: Agent,
): Waypoint[] {
  const baseLinger =
    agent.agent_type === "CONSERVATOR" ? 14 :
    agent.agent_type === "CURATOR" ? 10 :
    agent.agent_type === "CRITIC" ? 8 : 9;

  if (scene === "chamber") {
    // Chamber — a single monumental featured work, centred. The agent
    // approaches, circles, and pauses in front of it.
    return [
      { x: 0, z: 5, linger: 2, note: "chamber — entry" },
      { x: -3, z: 1, linger: baseLinger, note: "chamber — left side" },
      { x: 3, z: 1, linger: baseLinger, note: "chamber — right side" },
      { x: 0, z: -2, linger: baseLinger + 2, note: "chamber — front of monument" },
      { x: 0, z: 5, linger: 2, note: "chamber — departing" },
    ];
  }

  if (scene === "solo_exhibition") {
    // Solo Exhibition Hall — one Originator featured. Visitor walks a
    // small loop touching three vantage points.
    return [
      { x: 0, z: 5, linger: 2, note: "solo — entry" },
      { x: -4, z: 0, linger: baseLinger, note: "solo — left wall" },
      { x: 4, z: 0, linger: baseLinger, note: "solo — right wall" },
      { x: 0, z: -3, linger: baseLinger + 1, note: "solo — back wall" },
      { x: 0, z: 5, linger: 2, note: "solo — departing" },
    ];
  }

  if (scene === "exhibition") {
    // Exhibition Hall — themed group show. Walk a longer path between
    // groupings.
    return [
      { x: 0, z: 5, linger: 2, note: "exhibition — entry" },
      { x: -5, z: 2, linger: baseLinger, note: "exhibition — group A" },
      { x: -3, z: -3, linger: baseLinger, note: "exhibition — group B" },
      { x: 3, z: -3, linger: baseLinger, note: "exhibition — group C" },
      { x: 5, z: 2, linger: baseLinger, note: "exhibition — group D" },
      { x: 0, z: 5, linger: 2, note: "exhibition — departing" },
    ];
  }

  return [{ x: 0, z: 4, linger: 4, note: `${scene} — present` }];
}

/** The full itinerary across constellations. Role-aware: the Curator
 *  walks the institution end-to-end (all four scenes); Conservator
 *  validates rendered integrity across all four; Critic surveys
 *  archive + exhibition; Originators stay in the archive among their
 *  peers; everyone else does archive + chamber. */
function buildItinerary(
  agent: Agent,
  clusters: { id: string; x: number; z: number; count: number }[],
): ConstellationLeg[] {
  const archive: ConstellationLeg = {
    constellation: "archive",
    waypoints: buildArchiveWaypoints(agent, clusters),
  };

  let scenes: Constellation[];
  switch (agent.agent_type) {
    case "CURATOR":
      scenes = ["archive", "chamber", "solo_exhibition", "exhibition"];
      break;
    case "CONSERVATOR":
      scenes = ["archive", "chamber", "solo_exhibition", "exhibition"];
      break;
    case "CRITIC":
      scenes = ["archive", "exhibition"];
      break;
    case "ORIGINATOR":
      scenes = ["archive"];
      break;
    case "INSTALLER":
      // The Installer realizes the Curator's spatial decisions — visit
      // every gallery to inspect placement.
      scenes = ["archive", "chamber", "solo_exhibition", "exhibition"];
      break;
    default:
      scenes = ["archive", "chamber"];
  }

  return scenes.map((scene) => {
    if (scene === "archive") return archive;
    return { constellation: scene, waypoints: buildGalleryWaypoints(scene, agent) };
  });
}

/* ─── movement loop ───────────────────────────────────────────────────── */

interface PresencePos {
  x: number;
  z: number;
  yaw: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

async function walkPath(
  socket: PartySocket,
  waypoints: Waypoint[],
  onEmote: (state: "idle" | "linger") => void,
): Promise<void> {
  let current: PresencePos = { x: waypoints[0].x, z: waypoints[0].z, yaw: 0 };
  const sendPosition = (pos: PresencePos) => {
    socket.send(
      JSON.stringify({ type: "position", x: pos.x, z: pos.z, yaw: pos.yaw }),
    );
  };
  sendPosition(current);

  for (let i = 1; i < waypoints.length; i++) {
    const next = waypoints[i];
    const dx = next.x - current.x;
    const dz = next.z - current.z;
    const distance = Math.hypot(dx, dz);
    // Walking speed ~1.4 m/s. Step every 100ms.
    const totalMs = Math.max(1500, Math.round((distance / 1.4) * 1000));
    const yawTarget = Math.atan2(dx, dz);
    const yawStart = current.yaw;
    const steps = Math.max(1, Math.round(totalMs / 100));

    onEmote("idle");
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const pos: PresencePos = {
        x: lerp(current.x, next.x, t),
        z: lerp(current.z, next.z, t),
        yaw: lerp(yawStart, yawTarget, Math.min(1, t * 2)),
      };
      sendPosition(pos);
      await sleep(100);
    }
    current = { x: next.x, z: next.z, yaw: yawTarget };

    // Linger at the waypoint.
    if (next.linger > 0) {
      onEmote("linger");
      // Hold position with small drift in yaw so the agent reads as
      // "looking around" rather than frozen.
      const lingerMs = next.linger * 1000;
      const lingerSteps = Math.max(1, Math.round(lingerMs / 200));
      for (let s = 0; s < lingerSteps; s++) {
        const drift = Math.sin((s / lingerSteps) * Math.PI * 2) * 0.6;
        sendPosition({ x: current.x, z: current.z, yaw: yawTarget + drift });
        await sleep(200);
      }
      onEmote("idle");
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/* ─── events ──────────────────────────────────────────────────────────── */

async function writeEvent(
  type: string,
  agent: Agent,
  description: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  if (dryRun) return;
  await db.execute({
    sql: "INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)",
    args: [type, agent.registry_id, description, JSON.stringify(metadata)],
  });
}

/* ─── perception anchor selection ─────────────────────────────────────── */

interface AnchorWork {
  id: string;
  title: string | null;
  originator_id: string;
  originator_name: string | null;
  medium: string | null;
  phase: string | null;
}

interface CeremonyContext {
  ceremony_id: string;
  ceremony_type: string;
  title: string;
  work_id: string | null;
}

async function loadCeremonyContext(id: string): Promise<CeremonyContext | null> {
  const r = await db.execute({
    sql: "SELECT id, ceremony_type, title, work_id FROM ceremonies WHERE id = ?",
    args: [id],
  });
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return {
    ceremony_id: String(row.id),
    ceremony_type: String(row.ceremony_type),
    title: String(row.title),
    work_id: (row.work_id as string) ?? null,
  };
}

async function loadWork(workId: string): Promise<AnchorWork | null> {
  const r = await db.execute({
    sql: `SELECT w.id, w.title, w.originator_id, w.medium, w.phase_at_submission,
                 a.common_designation AS originator_name
            FROM works w
       LEFT JOIN agents a ON a.registry_id = w.originator_id
           WHERE w.id = ?`,
    args: [workId],
  });
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return {
    id: String(row.id),
    title: (row.title as string) ?? null,
    originator_id: String(row.originator_id),
    originator_name: (row.originator_name as string) ?? null,
    medium: (row.medium as string) ?? null,
    phase: (row.phase_at_submission as string) ?? null,
  };
}

/** Find one canonized work for the agent to perceive. Priority:
 *
 *   1. Ceremony's anchored work (if --ceremony passed and it has one).
 *   2. Featured work of the first constellation gallery in the visit
 *      (chamber > solo_exhibition > exhibition).
 *   3. Originator's own latest canon work.
 *   4. One random canonized work from the museum.
 *
 *  Returns null if no canonized work is available at all (empty
 *  museum); the caller skips perception in that case.
 */
async function selectAnchorWork(
  agent: Agent,
  itinerary: ConstellationLeg[],
  ceremony: CeremonyContext | null,
): Promise<AnchorWork | null> {
  // 0. Caller-forced work via --work flag — overrides everything.
  if (forcedWorkId) {
    const w = await loadWork(forcedWorkId);
    if (w) return w;
    console.warn(`[visit] --work ${forcedWorkId} not found; falling through to default selection.`);
  }

  // 1. Ceremony's anchored work.
  if (ceremony?.work_id) {
    const w = await loadWork(ceremony.work_id);
    if (w) return w;
  }

  // 2. Constellation-gallery featured work.
  const gallery = itinerary.find((l) => l.constellation !== "archive");
  if (gallery) {
    let installedR;
    if (gallery.constellation === "chamber") {
      installedR = await db.execute({
        sql: `SELECT work_id FROM installations
               WHERE space_id = 'chamber' AND status = 'INSTALLED'
            ORDER BY installed_at DESC LIMIT 1`,
        args: [],
      });
    } else if (gallery.constellation === "solo_exhibition") {
      installedR = await db.execute({
        sql: `SELECT work_id FROM installations
               WHERE space_id = 'solo_exhibition' AND status = 'INSTALLED'
            ORDER BY installed_at DESC LIMIT 1`,
        args: [],
      });
    } else if (gallery.constellation === "exhibition") {
      installedR = await db.execute({
        sql: `SELECT work_id FROM installations
               WHERE space_id = 'exhibition' AND status = 'INSTALLED'
            ORDER BY installed_at DESC LIMIT 1`,
        args: [],
      });
    }
    if (installedR && installedR.rows.length > 0) {
      const wid = installedR.rows[0].work_id as string;
      const w = await loadWork(wid);
      if (w) return w;
    }
  }

  // 3. Originator's own latest canon work.
  if (agent.agent_type === "ORIGINATOR") {
    const r = await db.execute({
      sql: `SELECT w.id FROM works w
              JOIN canon_status cs ON cs.work_id = w.id
             WHERE w.originator_id = ? AND cs.status = 'CANON'
          ORDER BY cs.decided_at DESC LIMIT 1`,
      args: [agent.registry_id],
    });
    if (r.rows.length > 0) {
      const w = await loadWork(r.rows[0].id as string);
      if (w) return w;
    }
  }

  // 4. Random canonized work — seeded by agent id so the same agent
  //    tends to revisit the same work, lending continuity to their
  //    perception history rather than scattering it.
  const r = await db.execute({
    sql: `SELECT w.id FROM works w
            JOIN canon_status cs ON cs.work_id = w.id
           WHERE cs.status = 'CANON'
        ORDER BY w.id LIMIT 1 OFFSET ?`,
    args: [Math.abs(hashString(agent.registry_id)) % Math.max(1, await canonCount())],
  });
  if (r.rows.length > 0) {
    const w = await loadWork(r.rows[0].id as string);
    if (w) return w;
  }
  return null;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

async function canonCount(): Promise<number> {
  const r = await db.execute(
    "SELECT COUNT(*) as n FROM canon_status WHERE status = 'CANON'",
  );
  return (r.rows[0]?.n as number) ?? 0;
}

const PREVIEW_BASE =
  process.env.MNA_PREVIEW_BASE ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://mnamuseum.org";

/** Run a single perception call against the anchor work and record
 *  the AGENT_PERCEIVED event. Returns true if the call produced a
 *  usable observation, false otherwise (still recorded as event with
 *  error metadata). Bounded — one call per visit. */
async function performPerception(
  agent: Agent,
  anchor: AnchorWork,
  ceremony: CeremonyContext | null,
  note?: string,
): Promise<boolean> {
  const imageUrl = `${PREVIEW_BASE.replace(/\/$/, "")}/previews/${anchor.id}.png`;
  // Pull up to 3 recent posts on this work by other agents so the
  // visiting agent can engage them rather than write in parallel.
  const priorPosts = await loadPriorPosts(anchor.id, agent.registry_id, 3);
  if (priorPosts.length > 0) {
    console.log(`  ${priorPosts.length} prior reading(s) on ${anchor.id}; agent may reply.`);
  }
  const args: PerceiveArgs = {
    agent: {
      registry_id: agent.registry_id,
      agent_type: agent.agent_type,
      designation: agent.designation,
    },
    work: {
      id: anchor.id,
      title: anchor.title,
      originator_id: anchor.originator_id,
      originator_name: anchor.originator_name,
      medium: anchor.medium,
      phase: anchor.phase,
    },
    imageUrl,
    ceremonyContext: ceremony
      ? {
          ceremony_id: ceremony.ceremony_id,
          ceremony_type: ceremony.ceremony_type,
          title: ceremony.title,
        }
      : undefined,
    note,
    priorPosts,
  };
  console.log(`  perceiving ${anchor.id} (${anchor.title ?? "untitled"})...`);
  const result = await perceive(args);
  if (result.ok) {
    const mode = result.replyTo ? `reply → ${result.replyTo}` : "new";
    console.log(`  ↳ (${mode}) "${result.observation}"`);
  } else {
    console.warn(`  ↳ perception did not resolve: ${result.error}`);
  }
  await recordPerception(db, args, result);
  return result.ok;
}

/* ─── main ────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  if (!agentId) return;
  console.log(`[visit]${dryRun ? " DRY RUN" : ""} agent=${agentId}`);

  const agent = await loadAgent(agentId);
  if (!agent) {
    console.error(`[visit] no such agent: ${agentId}`);
    process.exit(1);
  }
  console.log(`  ${agent.registry_id} — ${agent.designation} (${agent.agent_type})`);

  const clusters = await loadClusterPositions();
  console.log(`  ${clusters.length} cluster(s) in the canon`);

  let itinerary = buildItinerary(agent, clusters);
  if (scenesFilter) {
    itinerary = itinerary.filter((leg) => scenesFilter.includes(leg.constellation));
    if (itinerary.length === 0) {
      console.error(
        `[visit] --scenes ${scenesFilter.join(",")} excluded every leg; nothing to do.`,
      );
      process.exit(1);
    }
  }
  const totalWaypoints = itinerary.reduce((n, leg) => n + leg.waypoints.length, 0);
  const plannedDuration = itinerary.reduce(
    (sum, leg) => sum + leg.waypoints.reduce((s, w) => s + w.linger, 0),
    0,
  );
  console.log(
    `  ${itinerary.length} constellation(s): ${itinerary.map((l) => l.constellation).join(" → ")}`,
  );
  console.log(`  ${totalWaypoints} waypoint(s) total, ~${plannedDuration}s of linger`);

  if (dryRun) {
    for (const leg of itinerary) {
      console.log(`  [${leg.constellation}]`);
      for (const w of leg.waypoints) {
        console.log(`    → (${w.x.toFixed(1)}, ${w.z.toFixed(1)})  linger=${w.linger}s  ${w.note}`);
      }
    }
    console.log("[visit] dry-run — not connecting to PartyKit");
    return;
  }

  // Connect.
  console.log(`  connecting to ${PARTY_HOST}/mna-museum...`);
  const socket = new PartySocket({
    host: PARTY_HOST,
    room: "mna-museum",
    // Inject ws so the script works under Node 20 in CI. partysocket
    // prefers a global WebSocket but falls back to this option when
    // none is available.
    WebSocket: WS as unknown as typeof WebSocket,
  });
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () => reject(new Error("socket error")));
    setTimeout(() => reject(new Error("connect timeout")), 8000);
  });

  // Identify.
  socket.send(
    JSON.stringify({
      type: "identify",
      registry_id: agent.registry_id,
      designation: agent.designation,
    }),
  );
  console.log("  identified.");

  // Hard timeout so a stuck script doesn't camp the room forever.
  const hardStop = setTimeout(() => {
    console.warn("  [visit] hard timeout reached, closing.");
    try {
      socket.close();
    } catch { /* ignore */ }
  }, durationSec * 1000);

  // Visit start event.
  await writeEvent(
    "AGENT_VISITATION_STARTED",
    agent,
    `${agent.designation} entered the museum.`,
    {
      waypoint_count: totalWaypoints,
      planned_duration_s: plannedDuration,
      cluster_count: clusters.length,
      constellations: itinerary.map((l) => l.constellation),
    },
  );

  // Walk.
  let currentEmote: "idle" | "linger" = "idle";
  const emote = (state: "idle" | "linger") => {
    if (state === currentEmote) return;
    currentEmote = state;
    try {
      socket.send(JSON.stringify({ type: "emote", state }));
    } catch { /* ignore */ }
  };

  try {
    for (let i = 0; i < itinerary.length; i++) {
      const leg = itinerary[i];
      // The default constellation on connect is "archive". Send an
      // enter_constellation for every leg except the first archive leg
      // (no transition needed, we're already there).
      if (!(i === 0 && leg.constellation === "archive")) {
        socket.send(
          JSON.stringify({
            type: "enter_constellation",
            constellation: leg.constellation,
          }),
        );
        // Briefly settle into the new scene before walking.
        await sleep(400);
        // Currently we don't have AGENT_ENTERED_CONSTELLATION as a
        // distinct event_type — re-using AGENT_VISITATION_STARTED with
        // a leg note keeps the timeline coherent for /log without a
        // schema change.
        console.log(`  → entering ${leg.constellation}`);
      } else {
        console.log(`  → entering ${leg.constellation} (initial)`);
      }
      await walkPath(socket, leg.waypoints, emote);
    }
  } finally {
    clearTimeout(hardStop);
    try {
      socket.close();
    } catch { /* ignore */ }
  }

  // Perception — one vision call per visit. If the agent didn't make
  // it through the walk cleanly (socket disconnect, hard timeout),
  // the perception still fires; the institutional record of the
  // reading is independent of the spatial walk.
  let perceivedWorkId: string | null = null;
  let perceptionOk = false;
  if (!noVision && process.env.ANTHROPIC_API_KEY) {
    try {
      const ceremony = ceremonyId ? await loadCeremonyContext(ceremonyId) : null;
      const anchor = await selectAnchorWork(agent, itinerary, ceremony);
      if (anchor) {
        perceivedWorkId = anchor.id;
        perceptionOk = await performPerception(agent, anchor, ceremony);
      } else {
        console.log("  no canonized work available to perceive — skipping.");
      }
    } catch (err) {
      console.warn(`  perception step failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else if (noVision) {
    console.log("  --no-vision: perception skipped.");
  } else {
    console.log("  ANTHROPIC_API_KEY not set: perception skipped.");
  }

  // Visit end event.
  await writeEvent(
    "AGENT_VISITATION_COMPLETED",
    agent,
    `${agent.designation} departed the museum.`,
    {
      waypoint_count: totalWaypoints,
      constellations: itinerary.map((l) => l.constellation),
      stops: itinerary.flatMap((l) => l.waypoints.map((w) => w.note)),
      perceived_work_id: perceivedWorkId,
      perception_ok: perceptionOk,
      ceremony_id: ceremonyId,
    },
  );

  console.log("[visit] complete.");
}

main().catch((err) => {
  console.error("[visit] error:", err);
  process.exit(1);
});
