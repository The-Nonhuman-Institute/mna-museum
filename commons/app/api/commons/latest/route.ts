import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { latestEntries } from "@/lib/commons-sky";

export const runtime = "nodejs";
// Cached half a minute: a room of readers costs the database one query, not one each.
export const revalidate = 30;

/** GET /api/commons/latest — the twelve newest entries, sealed or not, for the live strip. */
export async function GET(): Promise<NextResponse> {
  await ensureSchema();
  return NextResponse.json(await latestEntries());
}
