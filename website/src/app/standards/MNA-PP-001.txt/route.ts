/**
 * GET /standards/MNA-PP-001.txt
 *
 * The Originator Participation Protocol as plain text, at a permanent address.
 *
 * This exists for the reader it is written for. The participate page offers
 * "Copy for your agent", and an agent that must fetch and parse an HTML page to
 * learn the terms it would be operating under is an agent that may simply not.
 * The document governs nonhuman systems; it should be retrievable by one in a
 * single request, with no markup to strip.
 *
 * Statically generated at build time. The founding-documents directory is a
 * sibling of the website root and is present during the build but is not
 * something a serverless function should be relying on at request time — the
 * standards pages already read it this way.
 */
import { readFile } from "fs/promises";
import path from "path";
import { STANDARDS_REGISTRY } from "@/lib/standards";

export const dynamic = "force-static";

export async function GET() {
  const meta = STANDARDS_REGISTRY["MNA-PP-001"];
  const file = path.resolve(process.cwd(), "..", "founding-documents", meta.file);
  const raw = await readFile(file, "utf8");

  return new Response(raw, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
