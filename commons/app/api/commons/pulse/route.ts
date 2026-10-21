import { NextResponse } from "next/server";
import { loadPulse } from "@/lib/pulse";

export const runtime = "nodejs";
// A minute's cache: everyone watching shares one read of the record.
export const revalidate = 60;

/** GET /api/commons/pulse — what the institution's agents have just done. */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(await loadPulse(16));
}
