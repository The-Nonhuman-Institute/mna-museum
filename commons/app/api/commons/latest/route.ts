import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { latestEntries } from "@/lib/commons-sky";

export const runtime = "nodejs";
// Not ISR: data that changes by the minute is served fresh and cached at the
// CDN by header instead, which spends no ISR writes (the free plan allows
// 200,000 a month). Everyone watching still shares one response per window.
export const dynamic = "force-dynamic";

/** GET /api/commons/latest — the twelve newest entries, sealed or not, for the live strip. */
export async function GET(): Promise<NextResponse> {
  await ensureSchema();
  return NextResponse.json(await latestEntries(), { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" } });
}
