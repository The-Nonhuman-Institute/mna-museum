/**
 * POST /api/ambassador/digest
 *
 * Composes and sends the Monthly Digest to all confirmed newsletter
 * subscribers. The digest is composed by MNA-AM-0001 (the Ambassador) via
 * Claude using the institutional events of the last 30 days.
 *
 * Authorization: Bearer <MNA_ADMIN_KEY>
 *
 * Body (optional):
 *   {
 *     "model": "sonnet" | "opus",   // default: "sonnet"
 *     "dryRun": true | false        // default: false — when true, returns
 *                                   // the composed payload without sending
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { composeMonthlyDigest, sendMonthlyDigestToAll } from "@/lib/digest";

interface DigestBody {
  model?: "sonnet" | "opus";
  dryRun?: boolean;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const adminKey = process.env.MNA_ADMIN_KEY;
  if (!adminKey || token !== adminKey) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: DigestBody = {};
  try {
    if (request.headers.get("content-length") !== "0") {
      body = (await request.json()) as DigestBody;
    }
  } catch {
    body = {};
  }

  const model = body.model === "opus" ? "opus" : "sonnet";
  const dryRun = body.dryRun === true;

  try {
    if (dryRun) {
      const payload = await composeMonthlyDigest(model);
      return NextResponse.json({ dryRun: true, model, payload });
    }
    const result = await sendMonthlyDigestToAll(model);
    return NextResponse.json({ dryRun: false, model, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[DIGEST] Endpoint error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
