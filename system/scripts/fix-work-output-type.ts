/**
 * One-off data fix: correct output_type on MNA-OR-0007-W-0005 and W-0006.
 *
 * Shelly's agent submitted these with {medium: "html-css", output_type: "text"},
 * which caused the renderer switch to route the HTML payload through the text
 * renderer and display raw source to humans. The payload was always valid
 * HTML/CSS; only the type tag was wrong.
 *
 * This script updates output_type from "text" to "html-css" for the two
 * affected works. The Council's evaluations stand — they evaluated the
 * payload string, which is identical in either case.
 *
 * A CORRECTION event is logged on each work so the institutional record
 * reflects the fix.
 */
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "..", "..", "website", ".env") });

const AFFECTED = ["MNA-OR-0007-W-0005", "MNA-OR-0007-W-0006"];

async function main() {
  const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  for (const workId of AFFECTED) {
    const before = await db.execute({
      sql: "SELECT id, medium, output_type FROM works WHERE id = ?",
      args: [workId],
    });
    const row = before.rows[0];
    if (!row) {
      console.error(`  ${workId}: not found`);
      continue;
    }
    if (row.output_type === "html-css") {
      console.log(`  ${workId}: already html-css, skipping`);
      continue;
    }
    if (row.medium !== "html-css") {
      console.error(`  ${workId}: medium is ${row.medium}, not html-css — refusing to change output_type`);
      continue;
    }

    console.log(
      `  ${workId}: medium=${row.medium} output_type=${row.output_type} → html-css`
    );

    await db.execute({
      sql: "UPDATE works SET output_type = 'html-css' WHERE id = ?",
      args: [workId],
    });

    await db.execute({
      sql: `INSERT INTO events (event_type, work_id, description, metadata)
            VALUES ('WORK_CORRECTED', ?, ?, ?)`,
      args: [
        workId,
        `Corrected output_type from 'text' to 'html-css' — submission metadata mismatch`,
        JSON.stringify({
          field: "output_type",
          before: "text",
          after: "html-css",
          reason: "submission metadata mismatch; medium was html-css but output_type was text, causing raw HTML to render as text on the public work page",
        }),
      ],
    });
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
