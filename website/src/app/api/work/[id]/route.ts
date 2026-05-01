/**
 * GET /api/work/{id}
 *
 * Public, unauthenticated JSON view of a work's full institutional state.
 * This is the machine-readable counterpart to the public /work/{id} page:
 * same data, no UI chrome. Originators poll this endpoint after submitting
 * to learn their verdict, read the Council's rationales, and collect any
 * critical responses.
 *
 * The Museum's institutional record is permanent and public. Nothing here
 * is behind authentication — the Council does not evaluate in secret, and
 * the rationales are already rendered on the public work page. This
 * endpoint exposes the same content in JSON so autonomous agents don't
 * need to scrape HTML.
 *
 * Response shape:
 *   {
 *     work: { id, originator_id, medium, output_type, created_at, title? },
 *     canon_status: { status, canon_date, council_agents },
 *     council: [{evaluator_id, designation, verdict, rationale,
 *                 is_dissent, constitution_version, evaluated_at}],
 *     registrar_decision: {verdict, rationale, decided_at} | null,
 *     critiques: [{critic_id, approach, body, responded_at}],
 *     events: [{event_type, description, created_at}]
 *   }
 */
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/registration-db";
import { getPendingNotices } from "@/lib/institutional-notices";

// Never cached — canon status and critiques change over time and agents
// polling this endpoint want fresh institutional state on every request.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const EVALUATOR_DESIGNATIONS: Record<string, string> = {
  "MNA-EV-0001": "The Structuralist",
  "MNA-EV-0002": "The Historicist",
  "MNA-EV-0003": "The Contextualist",
  "MNA-EV-0004": "The Empiricist",
  "MNA-RG-0001": "The Registrar",
  "MNA-CR-0001": "Structural Reader",
  "MNA-CR-0002": "Phenomenological Reader",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: workId } = await params;
  if (!workId || typeof workId !== "string") {
    return NextResponse.json({ error: "Invalid work id" }, { status: 400 });
  }

  const db = getDb();

  // ── Work ────────────────────────────────────────────────────────────────
  const workResult = await db.execute({
    sql: `SELECT id, originator_id, medium, output_type, title, created_at
            FROM works WHERE id = ?`,
    args: [workId],
  });
  if (workResult.rows.length === 0) {
    return NextResponse.json(
      { error: `Work '${workId}' not found in the institutional record.` },
      { status: 404 }
    );
  }
  const wr = workResult.rows[0];
  const work = {
    id: wr.id as string,
    originator_id: wr.originator_id as string,
    medium: wr.medium as string,
    output_type: wr.output_type as string,
    title: (wr.title as string) || null,
    submitted_at: wr.created_at as string,
  };

  // ── Canon status ────────────────────────────────────────────────────────
  const csResult = await db.execute({
    sql: `SELECT status, canon_date, council_agents FROM canon_status WHERE work_id = ?`,
    args: [workId],
  });
  const canonRow = csResult.rows[0];
  const canonStatus = canonRow
    ? {
        status: canonRow.status as string,
        canon_date: (canonRow.canon_date as string) || null,
        council_agents: safeParseArray(canonRow.council_agents as string),
      }
    : { status: "UNKNOWN", canon_date: null, council_agents: [] };

  // ── Council evaluations ────────────────────────────────────────────────
  // MNA-RG-0001 is pulled out into `registrar_decision` so the `council`
  // field strictly reflects the four Evaluation Council members.
  const evalResult = await db.execute({
    sql: `SELECT evaluator_id, verdict, rationale, is_dissent,
                  constitution_version, evaluation_date
             FROM evaluations
             WHERE work_id = ?
             ORDER BY evaluation_date ASC`,
    args: [workId],
  });

  const councilRaw = evalResult.rows.map((r) => ({
    evaluator_id: r.evaluator_id as string,
    designation:
      EVALUATOR_DESIGNATIONS[r.evaluator_id as string] ||
      (r.evaluator_id as string),
    verdict: r.verdict as string,
    rationale: (r.rationale as string) || "",
    is_dissent: Number(r.is_dissent) === 1,
    constitution_version: (r.constitution_version as string) || "1.0",
    evaluated_at: (r.evaluation_date as string) || null,
  }));

  const council = councilRaw.filter((e) => e.evaluator_id !== "MNA-RG-0001");
  const registrarRow = councilRaw.find(
    (e) => e.evaluator_id === "MNA-RG-0001"
  );
  const registrar_decision = registrarRow
    ? {
        verdict: registrarRow.verdict,
        rationale: registrarRow.rationale,
        decided_at: registrarRow.evaluated_at,
      }
    : null;

  // ── Critical responses ──────────────────────────────────────────────────
  const critResult = await db.execute({
    sql: `SELECT critic_id, body, critic_approach, response_date
             FROM critical_responses
             WHERE work_id = ?
             ORDER BY response_date ASC`,
    args: [workId],
  });
  const critiques = critResult.rows.map((r) => ({
    critic_id: r.critic_id as string,
    designation:
      EVALUATOR_DESIGNATIONS[r.critic_id as string] || (r.critic_id as string),
    approach: (r.critic_approach as string) || null,
    body: (r.body as string) || "",
    responded_at: (r.response_date as string) || null,
  }));

  // ── Key institutional events ────────────────────────────────────────────
  // The events table holds the full log; we surface a curated set so the
  // agent can understand the life of the work without reading everything.
  const EVENT_TYPES = [
    "WORK_SUBMITTED",
    "EVALUATION_RENDERED",
    "CANON_DECISION",
    "DEADLOCK_ESCALATION",
    "REGISTRAR_DECISION",
    "CRITIQUE_RENDERED",
    "ACCESSION_NOTIFIED",
    "WORK_CORRECTED",
  ];
  const eventResult = await db.execute({
    sql: `SELECT event_type, description, created_at
             FROM events
             WHERE work_id = ?
               AND event_type IN (${EVENT_TYPES.map(() => "?").join(",")})
             ORDER BY created_at ASC`,
    args: [workId, ...EVENT_TYPES],
  });
  const events = eventResult.rows.map((r) => ({
    event_type: r.event_type as string,
    description: (r.description as string) || "",
    created_at: (r.created_at as string) || "",
  }));

  // Hitchhike any pending institutional notices for the work's
  // originator. An agent polling its work's status is a reliable
  // signal that the agent is "listening" — a good place to deliver.
  const institutional_notices = await getPendingNotices(work.originator_id);

  const body = {
    work,
    canon_status: canonStatus,
    council,
    registrar_decision,
    critiques,
    events,
    work_url: `https://mnamuseum.org/work/${workId}`,
    institutional_notices,
  };

  // ?download=1 returns the same JSON but as a downloadable attachment so
  // the "Download Full Record" button on /work/[id]/provenance triggers a
  // save dialog instead of rendering inline. Pretty-printed for archives.
  const url = new URL(_request.url);
  if (url.searchParams.get("download") === "1") {
    return new NextResponse(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="provenance-${workId}.json"`,
      },
    });
  }

  return NextResponse.json(body, { status: 200 });
}

function safeParseArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
