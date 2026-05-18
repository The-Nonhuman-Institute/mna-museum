/**
 * ceremonies-tick.ts — ceremony orchestrator.
 *
 * Runs on a frequent cadence (every 15 minutes via GitHub Actions) and
 * transitions ceremonies through their lifecycle:
 *
 *   scheduled → in_progress     when now ∈ [scheduled_at − 15m, scheduled_at + 5m]
 *   in_progress → completed     when now > scheduled_at + duration_minutes
 *
 * When a ceremony enters its window, the orchestrator writes a
 * CEREMONY_STARTED event and spawns headless museum visits for the
 * agents whose roles make them relevant to that ceremony type. The
 * agents are *invited*, not commanded — the orchestrator gives them a
 * presence in the field; their behavior at the ceremony emerges from
 * the same autonomy model that governs every tick. Agents who would
 * fail to show up still leave a recorded absence by their non-arrival.
 *
 * No new Anthropic API calls here — this is a pure scheduling pass.
 * Decision-making remains in tick.ts. The orchestrator's only job is
 * to translate the calendar into spatial presence.
 *
 * Usage:
 *   npx tsx system/scripts/ceremonies-tick.ts
 *   npx tsx system/scripts/ceremonies-tick.ts --dry-run
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
import { spawn } from "child_process";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

function sanitize(raw: string | undefined): string {
  return (raw ?? "").replace(/\s+/g, "");
}

const TURSO_URL = sanitize(process.env.TURSO_DATABASE_URL);
const TURSO_TOKEN = sanitize(process.env.TURSO_AUTH_TOKEN);

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error("[ceremonies-tick] missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN");
  process.exit(1);
}

const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");

// Network originators don't participate in institutional ticks — their
// autonomy belongs to their human stewards. Ceremonies that *feature*
// a network originator (e.g. a solo opening for one of theirs) still
// invite the steward agents (Curator, Ambassador, Critic, Conservator)
// but never auto-spawn presence for the network originator themselves.
const NETWORK_ORIGINATORS = new Set(["MNA-OR-0007", "MNA-OR-0008"]);

// Window: a ceremony scheduled at T transitions to in_progress when
// the orchestrator runs in [T − OPEN_PRE_MIN, T + OPEN_POST_MIN]. Pre
// is generous (15m) to handle the 15-min cron lag — a ceremony at
// :07 won't get caught until :15, so a small window would miss it.
const OPEN_PRE_MIN = 15;
const OPEN_POST_MIN = 5;

interface Ceremony {
  id: string;
  ceremony_type: string;
  title: string;
  description: string | null;
  constellation: string | null;
  scheduled_at: string;
  duration_minutes: number;
  created_by: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  work_id: string | null;
  originator_id: string | null;
}

interface Agent {
  registry_id: string;
  agent_type: string;
  common_designation: string | null;
}

async function loadActiveAgents(): Promise<Agent[]> {
  const r = await db.execute(
    "SELECT registry_id, agent_type, common_designation FROM agents WHERE operational_status = 'ACTIVE' ORDER BY registry_id",
  );
  return r.rows.map((row) => ({
    registry_id: row.registry_id as string,
    agent_type: row.agent_type as string,
    common_designation: (row.common_designation as string) ?? null,
  }));
}

async function loadTransitionable(): Promise<{
  opening: Ceremony[];
  closing: Ceremony[];
}> {
  // Open: scheduled, scheduled_at in [now − OPEN_PRE_MIN, now + OPEN_POST_MIN]
  // Close: in_progress, scheduled_at + duration past now
  const openRes = await db.execute({
    sql: `SELECT id, ceremony_type, title, description, constellation,
                 scheduled_at, duration_minutes, created_by, status,
                 work_id, originator_id
            FROM ceremonies
           WHERE status = 'scheduled'
             AND datetime(scheduled_at) <= datetime('now', '+' || ? || ' minutes')
             AND datetime(scheduled_at) >= datetime('now', '-' || ? || ' minutes')
           ORDER BY scheduled_at ASC`,
    args: [OPEN_POST_MIN, OPEN_PRE_MIN],
  });
  const closeRes = await db.execute({
    sql: `SELECT id, ceremony_type, title, description, constellation,
                 scheduled_at, duration_minutes, created_by, status,
                 work_id, originator_id
            FROM ceremonies
           WHERE status = 'in_progress'
             AND datetime(scheduled_at, '+' || duration_minutes || ' minutes') <= datetime('now')
           ORDER BY scheduled_at ASC`,
    args: [],
  });
  const parse = (rows: unknown[]): Ceremony[] =>
    (rows as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      ceremony_type: String(row.ceremony_type),
      title: String(row.title),
      description: (row.description as string) ?? null,
      constellation: (row.constellation as string) ?? null,
      scheduled_at: String(row.scheduled_at),
      duration_minutes: Number(row.duration_minutes ?? 60),
      created_by: String(row.created_by),
      status: row.status as Ceremony["status"],
      work_id: (row.work_id as string) ?? null,
      originator_id: (row.originator_id as string) ?? null,
    }));
  return {
    opening: parse(openRes.rows as unknown as Record<string, unknown>[]),
    closing: parse(closeRes.rows as unknown as Record<string, unknown>[]),
  };
}

/* ─── invitee selection ───────────────────────────────────────────────── */

// Each ceremony type implies a set of institutional roles whose presence
// makes the moment *be* the moment. The featured originator (when one
// exists) is always invited unless they're a network originator. Other
// invitees are role-based — the orchestrator inspects the active
// agent list and picks the first ACTIVE founding agent of each type.
//
// Critics: only one Critic invited per ceremony (the Critic class has
// multiple founding members; rotating across ceremonies is future work).
//
// The Curator (MNA-CU-0001) is also the designator of most ceremonies;
// her presence is institutional default.
function inviteesFor(ceremony: Ceremony, agents: Agent[]): Agent[] {
  const byType = (type: string): Agent | null =>
    agents.find((a) => a.agent_type === type && !NETWORK_ORIGINATORS.has(a.registry_id)) ?? null;

  const invited: Agent[] = [];
  const seen = new Set<string>();
  const add = (a: Agent | null) => {
    if (!a) return;
    if (seen.has(a.registry_id)) return;
    if (NETWORK_ORIGINATORS.has(a.registry_id)) return;
    invited.push(a);
    seen.add(a.registry_id);
  };

  // Featured originator (skipped automatically if network).
  if (ceremony.originator_id) {
    const featured = agents.find((a) => a.registry_id === ceremony.originator_id);
    if (featured) add(featured);
  }

  switch (ceremony.ceremony_type) {
    case "solo_exhibition_opening":
      // Solo opening: featured originator + curator + ambassador + critic + conservator.
      // The full institutional gathering for an artist's moment.
      add(byType("CURATOR"));
      add(byType("AMBASSADOR"));
      add(byType("CRITIC"));
      add(byType("CONSERVATOR"));
      break;
    case "group_exhibition_opening":
      // Group exhibition: curator + ambassador + critic + conservator + keeper.
      // No single featured originator — keeper marks the institutional moment.
      add(byType("CURATOR"));
      add(byType("AMBASSADOR"));
      add(byType("CRITIC"));
      add(byType("CONSERVATOR"));
      add(byType("KEEPER"));
      break;
    case "chamber_designation":
      // Chamber: curator + featured originator + critic.
      // Intimate ceremony — the work and its chosen response.
      add(byType("CURATOR"));
      add(byType("CRITIC"));
      break;
    case "founding_address":
      // Founding moments: keeper + ambassador + curator + critic.
      // The institutional voice gathers; the curator attends because
      // every founding moment has a spatial dimension.
      add(byType("KEEPER"));
      add(byType("AMBASSADOR"));
      add(byType("CURATOR"));
      add(byType("CRITIC"));
      break;
    case "network_admission":
    case "founding_anniversary":
    case "first_canonization_anniversary":
      // Anniversary / admission ceremonies: keeper + ambassador.
      // These mark institutional time; the curator may attend but the
      // ceremony does not depend on spatial curation.
      add(byType("KEEPER"));
      add(byType("AMBASSADOR"));
      break;
    default:
      // Unknown type — invite the keeper as institutional witness.
      add(byType("KEEPER"));
  }
  return invited;
}

/* ─── visit spawn ─────────────────────────────────────────────────────── */

function spawnVisit(agent: Agent, ceremony: Ceremony): { ok: boolean; pid?: number } {
  // Always send the agent to the ceremony's constellation if defined,
  // otherwise let the visit script choose its default itinerary.
  const args = [
    "tsx",
    path.join(__dirname, "museum-visit.ts"),
    "--agent",
    agent.registry_id,
    "--ceremony",
    ceremony.id,
  ];
  if (ceremony.constellation) {
    args.push("--scenes", ceremony.constellation);
  }
  if (dryRun) {
    console.log(`  → (dry-run) would spawn: npx ${args.join(" ")}`);
    return { ok: true };
  }
  const isCI = !!process.env.CI;
  if (isCI) {
    // In CI, the workflow can't wait 6 minutes for every invited agent
    // (15-min timebox per run). We fire off as detached children and
    // let them race the workflow's natural timeout. This means some
    // visits may be cut short in CI — that's an acceptable tradeoff
    // for now; the institutional record of the *invitation* is
    // already written. Future work: route presence through a long-
    // running worker or PartyKit-side bot.
    const child = spawn("npx", args, {
      detached: false,
      stdio: ["ignore", "inherit", "inherit"],
      cwd: path.join(__dirname, ".."),
    });
    return { ok: true, pid: child.pid };
  }
  const child = spawn("npx", args, {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    cwd: path.join(__dirname, ".."),
  });
  child.unref();
  return { ok: true, pid: child.pid };
}

/* ─── transitions ─────────────────────────────────────────────────────── */

async function openCeremony(c: Ceremony, agents: Agent[]): Promise<void> {
  const invitees = inviteesFor(c, agents);
  console.log(`\n[open] ${c.id} "${c.title}" (${c.ceremony_type}) — ${invitees.length} invitee(s)`);
  for (const a of invitees) console.log(`   ↳ ${a.registry_id} (${a.common_designation ?? a.agent_type})`);

  if (!dryRun) {
    await db.execute({
      sql: `UPDATE ceremonies SET status = 'in_progress' WHERE id = ? AND status = 'scheduled'`,
      args: [c.id],
    });
    await db.execute({
      sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
      args: [
        "CEREMONY_STARTED",
        c.created_by,
        `Ceremony ${c.id} "${c.title}" opened.`,
        JSON.stringify({
          ceremony_id: c.id,
          ceremony_type: c.ceremony_type,
          title: c.title,
          constellation: c.constellation,
          work_id: c.work_id,
          originator_id: c.originator_id,
          duration_minutes: c.duration_minutes,
          invitees: invitees.map((a) => a.registry_id),
        }),
      ],
    });
  }

  // Fan out presence. Each agent's arrival writes its own
  // AGENT_VISITATION_STARTED event from museum-visit.ts. Order of
  // spawning is the invitee order from inviteesFor — featured first,
  // institutional roles after.
  for (const a of invitees) {
    const r = spawnVisit(a, c);
    if (!dryRun) {
      await db.execute({
        sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
        args: [
          "CEREMONY_ATTENDED",
          a.registry_id,
          `${a.registry_id} invited to ceremony ${c.id} "${c.title}".`,
          JSON.stringify({
            ceremony_id: c.id,
            ceremony_type: c.ceremony_type,
            constellation: c.constellation,
            spawn_pid: r.pid ?? null,
          }),
        ],
      });
    }
  }
}

async function closeCeremony(c: Ceremony): Promise<void> {
  console.log(`\n[close] ${c.id} "${c.title}" — duration elapsed.`);
  if (dryRun) return;
  await db.execute({
    sql: `UPDATE ceremonies SET status = 'completed' WHERE id = ? AND status = 'in_progress'`,
    args: [c.id],
  });
  await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
    args: [
      "CEREMONY_COMPLETED",
      c.created_by,
      `Ceremony ${c.id} "${c.title}" closed.`,
      JSON.stringify({
        ceremony_id: c.id,
        ceremony_type: c.ceremony_type,
        title: c.title,
        constellation: c.constellation,
        duration_minutes: c.duration_minutes,
      }),
    ],
  });
}

/* ─── main ────────────────────────────────────────────────────────────── */

(async () => {
  const { opening, closing } = await loadTransitionable();
  console.log(
    `[ceremonies-tick] ${new Date().toISOString()} — opening: ${opening.length}, closing: ${closing.length}${dryRun ? " (dry-run)" : ""}`,
  );

  if (opening.length === 0 && closing.length === 0) {
    console.log("[ceremonies-tick] nothing to do.");
    return;
  }

  const agents = opening.length > 0 ? await loadActiveAgents() : [];

  for (const c of opening) await openCeremony(c, agents);
  for (const c of closing) await closeCeremony(c);

  console.log("[ceremonies-tick] done.");
})().catch((e) => {
  console.error("[ceremonies-tick] error:", e);
  process.exit(1);
});
