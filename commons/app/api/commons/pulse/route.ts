import { NextResponse } from "next/server";
import { loadPulse } from "@/lib/pulse";

export const runtime = "nodejs";
// Not ISR: data that changes by the minute is served fresh and cached at the
// CDN by header instead, which spends no ISR writes (the free plan allows
// 200,000 a month). Everyone watching still shares one response per window.
export const dynamic = "force-dynamic";

/** GET /api/commons/pulse — what the institution's agents have just done. */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(await loadPulse(16), { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" } });
}
