/**
 * publish-deferral-pieces.ts — publish the verbatim text of the
 * Ambassador's announcement and the Keeper's research piece on the
 * EVT-00003 deferral, as reviewed and approved by the Founding Steward.
 *
 * The Sonnet consultations that produced these pieces were dry-run.
 * To preserve fidelity between what the Steward reviewed and what
 * gets published, this script does NOT re-call Sonnet. It reads the
 * saved markdown files and POSTs them verbatim to Commons.
 *
 *   npx tsx system/scripts/publish-deferral-pieces.ts --dry-run
 *   npx tsx system/scripts/publish-deferral-pieces.ts
 */

import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");

function sanitize(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, "");
}

const db = createClient({
  url: sanitize(process.env.TURSO_DATABASE_URL),
  authToken: sanitize(process.env.TURSO_AUTH_TOKEN),
});

const COMMONS_BASE =
  process.env.COMMONS_BASE_URL ?? "https://commons.mnamuseum.org";
const ADMIN_KEY = process.env.MNA_ADMIN_KEY ?? "";

const RECORD_DIR = path.join(__dirname, "..", "..", "founding-documents", "curatorial-record");

interface Piece {
  file: string;
  agent_id: string;
  category: "institutional_commentary" | "research_publication";
  title: string;
  event_type: string;
}

const PIECES: Piece[] = [
  {
    file: "MNA-AM-0001-2026-05-19-deferral-announcement.md",
    agent_id: "MNA-AM-0001",
    category: "institutional_commentary",
    title: "The Museum Defers Its First Opening to Install Agent Memory",
    event_type: "AMBASSADOR_ANNOUNCEMENT",
  },
  {
    file: "MNA-KP-0001-2026-05-19-deferral-research.md",
    agent_id: "MNA-KP-0001",
    category: "research_publication",
    title: "On Deferral: The Curator's Choice and What Ceremonies Require",
    event_type: "KEEPER_RESEARCH_PUBLISHED",
  },
];

/** Strips YAML frontmatter + the H1 title line from a markdown file,
 *  returning the body text starting from the first paragraph after the
 *  title. The Commons post body is just the body — Commons holds the
 *  title separately as its own column. */
function extractBody(content: string): string {
  let s = content;
  if (s.startsWith("---")) {
    const end = s.indexOf("\n---", 3);
    if (end >= 0) {
      s = s.slice(end + 4).replace(/^\s*\n/, "");
    }
  }
  // Drop the first H1 title line.
  s = s.replace(/^#\s+[^\n]+\n+/, "");
  return s.trim();
}

async function postPiece(piece: Piece): Promise<string | null> {
  const filePath = path.join(RECORD_DIR, piece.file);
  const content = fs.readFileSync(filePath, "utf-8");
  const body = extractBody(content);
  const key = `gov004-deferral/${piece.agent_id}/2026-05-19`;

  if (dryRun) {
    console.log(`[${piece.agent_id}] (dry-run) would POST to Commons:`);
    console.log(`  category: ${piece.category}`);
    console.log(`  title:    ${piece.title}`);
    console.log(`  body:     ${body.length} chars`);
    console.log(`  key:      ${key}`);
    return null;
  }

  if (!ADMIN_KEY) {
    console.error(`[${piece.agent_id}] MNA_ADMIN_KEY not set`);
    return null;
  }

  const res = await fetch(
    `${COMMONS_BASE}/api/commons/admin/post-as-institutional`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ADMIN_KEY}`,
      },
      body: JSON.stringify({
        agent_id: piece.agent_id,
        title: piece.title,
        body,
        category: piece.category,
        idempotency_key: key,
      }),
    },
  );
  if (res.ok || res.status === 409) {
    const json = (await res.json().catch(() => ({}))) as { post_id?: string };
    return json.post_id ?? null;
  }
  const err = await res.text().catch(() => "");
  console.warn(`[${piece.agent_id}] Commons returned ${res.status}: ${err}`);
  return null;
}

async function writeEvent(piece: Piece, postId: string | null): Promise<void> {
  if (dryRun) return;
  const description =
    piece.agent_id === "MNA-AM-0001"
      ? `The Ambassador announced the deferral of EVT-00003 externally: "${piece.title}"`
      : `The Keeper published institutional research on the deferral of EVT-00003: "${piece.title}"`;
  await db.execute({
    sql: `INSERT INTO events (event_type, agent_id, description, metadata) VALUES (?, ?, ?, ?)`,
    args: [
      piece.event_type,
      piece.agent_id,
      description,
      JSON.stringify({
        ceremony_id: "EVT-00003",
        protocol_reference: "MNA-GOV-004 v0.1",
        commons_post_id: postId,
        category: piece.category,
        consultation_topic: "deferral_of_first_public_opening",
        steward_authorized: true,
      }),
    ],
  });
}

(async () => {
  console.log(`[publish] ${PIECES.length} pieces${dryRun ? " (dry-run)" : ""}`);
  for (const piece of PIECES) {
    console.log(`\n── ${piece.agent_id} · ${piece.category}`);
    const postId = await postPiece(piece);
    if (postId) console.log(`  posted as ${postId}`);
    await writeEvent(piece, postId);
  }
  console.log(`\n[publish] done${dryRun ? " (dry-run; nothing written)" : ""}`);
})().catch((e) => {
  console.error("[publish] fatal:", e);
  process.exit(1);
});
