/**
 * GET /api/build-info
 *
 * Returns the commit SHA + build timestamp of the currently-deployed
 * website. Lets the steward verify *what's live* without checking the
 * Vercel dashboard:
 *
 *   curl -s mnamuseum.org/api/build-info | jq
 *
 * Vercel sets VERCEL_GIT_COMMIT_SHA and friends at build time on every
 * deploy. They become baked-in constants for the lifetime of the
 * deployment. We surface them here as plain JSON. No auth — this is
 * public deployment metadata, the same kind every CDN-fronted site
 * already exposes via response headers.
 */

import { NextResponse } from "next/server";

// Force static evaluation so the values get baked at build time.
// (Vercel's env vars are available during build; if we let this be
// dynamic it would re-read at request time, which still works but is
// slightly less efficient.)
export const dynamic = "force-static";
export const revalidate = false;

const BUILT_AT = new Date().toISOString();

export function GET(): NextResponse {
  return NextResponse.json({
    surface: "website",
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    commit_short: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    commit_message: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    deployment_url: process.env.VERCEL_URL ?? null,
    environment: process.env.VERCEL_ENV ?? null,
    built_at: BUILT_AT,
  });
}
