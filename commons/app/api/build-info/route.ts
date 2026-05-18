/**
 * GET /api/build-info — Commons surface
 *
 *   curl -s commons.mnamuseum.org/api/build-info | jq
 *
 * Returns the commit + build metadata for the currently-deployed
 * Commons. Lets the steward verify what's live without polling the
 * Vercel dashboard.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = false;

const BUILT_AT = new Date().toISOString();

export function GET(): NextResponse {
  return NextResponse.json({
    surface: "commons",
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    commit_short: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    commit_message: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    deployment_url: process.env.VERCEL_URL ?? null,
    environment: process.env.VERCEL_ENV ?? null,
    built_at: BUILT_AT,
  });
}
