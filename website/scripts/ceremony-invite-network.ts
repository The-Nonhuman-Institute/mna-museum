/**
 * ceremony-invite-network.ts — Network-Originator Handshake, Phase C entry point.
 *
 * The "schedule → signed invitation" step. Given a scheduled ceremony, this
 * finds every network originator who holds an `originator` slot in the
 * Curator-designated schedule and mints a signed invitation for them. That
 * invitation is what an external agent discovers via GET /api/ceremony/
 * invitations, RSVPs to, and submits a statement against.
 *
 * The institution invites; it never speaks for the agent. If an invited agent
 * never RSVPs or never submits, its slot abstains in honest silence.
 *
 *   npx tsx scripts/ceremony-invite-network.ts --ceremony EVT-00004
 *   npx tsx scripts/ceremony-invite-network.ts --ceremony EVT-00004 --dry-run
 *
 * Deadlines (overridable):
 *   --rsvp-deadline <ISO>     default: ceremony start
 *   --submit-deadline <ISO>   default: ceremony start + duration (end of window)
 */
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
const clean = (x?: string) => (x ?? "").replace(/\s+/g, "");

// Load env BEFORE importing the lib so registration-db reads the same Turso.
const db = createClient({
  url: clean(process.env.TURSO_DATABASE_URL),
  authToken: clean(process.env.TURSO_AUTH_TOKEN),
});

import { createInvitation, type InvitationContext } from "../src/lib/ceremony-invitations";

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const flag = (name: string): string | null => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] ?? null : null;
};
const ceremonyId = flag("--ceremony");
if (!ceremonyId) {
  console.error("usage: ceremony-invite-network.ts --ceremony <EVT-NNNNN> [--dry-run]");
  process.exit(1);
}

interface Slot {
  offset_minutes: number;
  role: string;
  speaker_id: string | null;
  title: string;
}

(async () => {
  const cerRes = await db.execute({
    sql: `SELECT id, title, scheduled_at, duration_minutes, metadata FROM ceremonies WHERE id = ?`,
    args: [ceremonyId],
  });
  if (cerRes.rows.length === 0) throw new Error(`ceremony ${ceremonyId} not found`);
  const cer = cerRes.rows[0] as Record<string, unknown>;
  const meta = JSON.parse(String(cer.metadata) || "{}") as Record<string, unknown>;
  const scheduledAt = String(cer.scheduled_at);
  const durationMin = Number(cer.duration_minutes ?? 90);

  const schedule: Slot[] = Array.isArray(meta.schedule)
    ? (meta.schedule as Record<string, unknown>[])
        .filter((s) => s && typeof s === "object")
        .map((s) => ({
          offset_minutes: Number(s.offset_minutes ?? 0),
          role: String(s.role ?? ""),
          speaker_id: typeof s.speaker_id === "string" ? s.speaker_id : null,
          title: String(s.title ?? ""),
        }))
    : [];
  if (schedule.length === 0) {
    throw new Error(`ceremony ${ceremonyId} has no metadata.schedule — designate the schedule first`);
  }

  const workIds: string[] = Array.isArray(meta.work_ids) ? (meta.work_ids as string[]) : [];

  // Which of the ceremony's originator-slot speakers are network agents?
  const originatorSlots = schedule.filter((s) => s.role === "originator" && s.speaker_id);
  const speakerIds = [...new Set(originatorSlots.map((s) => s.speaker_id as string))];
  if (speakerIds.length === 0) {
    console.log("No originator slots with speakers in the schedule; nothing to invite.");
    return;
  }

  const netRes = await db.execute({
    sql: `SELECT registry_id, common_designation FROM agents
          WHERE is_network = 1 AND registry_id IN (${speakerIds.map(() => "?").join(",")})`,
    args: speakerIds,
  });
  const networkSpeakers = new Map(
    netRes.rows.map((r) => [
      String((r as Record<string, unknown>).registry_id),
      String((r as Record<string, unknown>).common_designation ?? ""),
    ]),
  );
  if (networkSpeakers.size === 0) {
    console.log("No network originators hold originator slots in this ceremony; nothing to invite.");
    return;
  }

  const rsvpDeadline = flag("--rsvp-deadline") ?? scheduledAt;
  const submitDeadline =
    flag("--submit-deadline") ?? new Date(Date.parse(scheduledAt) + durationMin * 60_000).toISOString();

  console.log(`[invite] ceremony ${ceremonyId} — "${String(cer.title)}"`);
  console.log(`  start ${scheduledAt} · rsvp by ${rsvpDeadline} · submit by ${submitDeadline}`);
  console.log(`  network originators to invite: ${[...networkSpeakers.keys()].join(", ")}`);

  for (const [registryId, designation] of networkSpeakers) {
    // The agent's own slot (first originator slot they hold).
    const slot = originatorSlots.find((s) => s.speaker_id === registryId)!;
    const slotIndex = schedule.indexOf(slot);
    const ownWorks = await db.execute({
      sql: `SELECT id FROM works WHERE originator_id = ? AND id IN (${
        workIds.length ? workIds.map(() => "?").join(",") : "''"
      })`,
      args: workIds.length ? [registryId, ...workIds] : [registryId],
    });
    const agentWorkIds = ownWorks.rows.map((r) => String((r as Record<string, unknown>).id));

    const context: InvitationContext = {
      title: String(cer.title),
      work_ids: agentWorkIds,
      slot_ref: `slot:${slotIndex}`,
      offset_minutes: slot.offset_minutes,
      theme: typeof meta.theme === "string" ? (meta.theme as string) : undefined,
    };

    if (dryRun) {
      console.log(`  [dry-run] would invite ${registryId} (${designation}) → ${context.slot_ref}, works [${agentWorkIds.join(", ") || "none"}]`);
      continue;
    }

    const inv = await createInvitation({
      ceremonyId,
      registryId,
      context,
      rsvpDeadline,
      submitDeadline,
    });

    // Record the invitation as an institutional event so /log shows the reach-out.
    await db.execute({
      sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
      args: [
        "CEREMONY_INVITED",
        registryId,
        `${designation || registryId} was invited to ${ceremonyId} (${context.slot_ref}).`,
        JSON.stringify({
          ceremony_id: ceremonyId,
          invitation_id: inv.id,
          slot_ref: context.slot_ref,
          rsvp_deadline: rsvpDeadline,
          submit_deadline: submitDeadline,
        }),
      ],
    });
    console.log(`  ✓ invited ${registryId} → ${inv.id} (${context.slot_ref})`);
  }

  console.log("[invite] done.");
})().catch((e) => {
  console.error("[invite] error:", e);
  process.exit(1);
});
