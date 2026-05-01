/**
 * GET /api/work/{id}/pdf
 *
 * Server-rendered PDF of a work's provenance record. Mirrors the JSON
 * payload returned by /api/work/{id} but laid out as a printable
 * institutional document — used by the "Download Full Record" button on
 * /work/{id}/provenance.
 *
 * Pulls the same data straight from Turso, hands it to
 * ProvenancePdfDocument (which uses @react-pdf/renderer), streams the
 * PDF back with Content-Disposition: attachment.
 */

import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { getDb } from "@/lib/registration-db";
import ProvenancePdfDocument, {
  type ProvenanceData,
} from "@/lib/provenance-pdf";

// PDF generation needs to run in Node, not the Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
// Allow up to 30s — large works with long rationales take a few seconds
// to lay out + serialize. (Vercel's default limit is shorter.)
export const maxDuration = 30;

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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: workId } = await params;
  if (!workId || typeof workId !== "string") {
    return NextResponse.json({ error: "Invalid work id" }, { status: 400 });
  }

  const db = getDb();

  // ── Work ──────────────────────────────────────────────────────────────────
  const workResult = await db.execute({
    sql: `SELECT id, originator_id, medium, output_type, title, created_at
            FROM works WHERE id = ?`,
    args: [workId],
  });
  if (workResult.rows.length === 0) {
    return NextResponse.json(
      { error: `Work '${workId}' not found in the institutional record.` },
      { status: 404 },
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

  // ── Canon status ──────────────────────────────────────────────────────────
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

  // ── Council + Registrar ───────────────────────────────────────────────────
  const evalResult = await db.execute({
    sql: `SELECT evaluator_id, verdict, rationale, is_dissent,
                 constitution_version, evaluation_date
            FROM evaluations WHERE work_id = ?
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
  const registrarRow = councilRaw.find((e) => e.evaluator_id === "MNA-RG-0001");
  const registrar_decision = registrarRow
    ? {
        verdict: registrarRow.verdict,
        rationale: registrarRow.rationale,
        decided_at: registrarRow.evaluated_at,
      }
    : null;

  // ── Critical responses ────────────────────────────────────────────────────
  const critResult = await db.execute({
    sql: `SELECT critic_id, body, critic_approach, response_date
            FROM critical_responses WHERE work_id = ?
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

  // Build origin-qualified URLs so the PDF is self-citing.
  const origin = new URL(request.url).origin;
  const data: ProvenanceData = {
    work,
    canon_status: canonStatus,
    council,
    registrar_decision,
    critiques,
    events: [],
    work_url: `${origin}/work/${workId}`,
    preview_url: `${origin}/previews/${workId}.png`,
  };

  // Render the document. ProvenancePdfDocument is a React component
  // describing the PDF layout; renderToBuffer walks it and produces
  // the PDF bytes. The cast quiets renderToBuffer's strict
  // ReactElement<DocumentProps> typing — our Document is the right
  // shape at runtime, the wrapper just hides the generic.
  const element = React.createElement(ProvenancePdfDocument, { data });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(element as any);

  // NextResponse body wants BodyInit. Buffer is a valid runtime body but
  // the Edge type bundle is strict; cast to BodyInit for the constructor.
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="provenance-${workId}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
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
