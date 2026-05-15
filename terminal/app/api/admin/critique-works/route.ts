/**
 * POST /api/admin/critique-works
 *
 * Steward-triggered batch critique. Takes a list of work IDs and runs
 * the founding Critics against each one. Used for filling in canon
 * works that predate the auto-chain (or for re-running specific works
 * after an amendment).
 *
 * critiqueWork() is idempotent per (critic, work) — it skips Critics
 * that have already responded to a given work, so calling this on
 * already-critiqued works is a no-op for those Critics.
 *
 * Auth: Bearer MNA_ADMIN_KEY.
 * Body: { work_ids: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { critiqueWork, type CritiqueResult } from "@/lib/critic";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Body {
  work_ids?: string[];
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const adminKey = process.env.MNA_ADMIN_KEY;
  if (!adminKey || token !== adminKey) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const workIds = Array.isArray(body.work_ids) ? body.work_ids : [];
  if (workIds.length === 0) {
    return NextResponse.json(
      { error: "work_ids must be a non-empty array." },
      { status: 400 },
    );
  }

  const results: (CritiqueResult | { work_id: string; error: string })[] = [];
  for (const wid of workIds) {
    try {
      const r = await critiqueWork(wid);
      results.push(r);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ work_id: wid, error: msg });
    }
  }

  return NextResponse.json({
    requested: workIds.length,
    results,
  });
}
