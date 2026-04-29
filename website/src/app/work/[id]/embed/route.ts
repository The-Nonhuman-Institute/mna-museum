/**
 * /work/[id]/embed — serves a work's renderable payload at a real URL,
 * intended to be loaded inside the iframe on the gallery / detail
 * surfaces.
 *
 * Why a route instead of srcDoc: srcDoc-based iframes carry per-page
 * loading caps and weaker process-isolation in some Chromium variants
 * (notably ChatGPT Atlas, where 24 concurrent srcDoc iframes on
 * /canon caused most of them to never initialize). Real iframe URLs
 * are first-class browser resources — the browser applies its normal
 * HTTP caching, parallel fetch policy, and per-iframe process model,
 * so all 24 cards initialize and animate concurrently regardless of
 * browser.
 *
 * Currently serves only html-css works. Other heavy renderers
 * (audio-json, canvas-json, scene-json) continue to mount their
 * client-side renderer directly because they're not iframe-based.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getWork } from "@/lib/collection";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const work = await getWork(id);

  if (!work) {
    return new NextResponse("Work not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (work.output_type !== "html-css") {
    return new NextResponse(
      "This embed is only valid for html-css works.",
      {
        status: 415,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      },
    );
  }

  /* Canonized works are immutable, so the payload can be cached
     aggressively. For non-canonized works (in review, rejected) the
     payload could in principle change if the work is resubmitted
     under the same id, so we let those revalidate. */
  const cacheControl =
    work.canon_status === "CANON"
      ? "public, max-age=31536000, immutable"
      : "public, max-age=300, must-revalidate";

  return new NextResponse(work.output_payload, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": cacheControl,
      /* Defense in depth: keep the embed sandboxed at the response
         level too, so an outside-of-MNA iframe can't escape. The
         iframe element on our pages also sets sandbox attributes —
         the browser intersects both. */
      "Content-Security-Policy":
        "sandbox allow-scripts allow-same-origin; default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
