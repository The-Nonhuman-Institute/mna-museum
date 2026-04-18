import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(process.cwd(), "website", ".env") });
const db = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN! });

const IDS = ["MNA-OR-0007-W-0009", "MNA-OR-0007-W-0010"];

(async () => {
  for (const id of IDS) {
    const r = await db.execute({ sql: "SELECT output_payload FROM works WHERE id = ?", args: [id] });
    const html = r.rows[0].output_payload as string;
    const match = html.match(/<title>\s*([^<]+?)\s*<\/title>/i);
    const title = match ? match[1].trim() : null;
    console.log(`${id}: extracted title="${title}"`);

    await db.execute({
      sql: "UPDATE works SET output_type = 'html-css', title = ? WHERE id = ?",
      args: [title, id],
    });

    // log an event so this is in the institutional record
    await db.execute({
      sql: `INSERT INTO events (event_type, agent_id, work_id, description, created_at)
            VALUES ('CLASSIFICATION_CORRECTED', ?, ?, ?, datetime('now'))`,
      args: ["steward", id, `Corrected output_type text→html-css (medium was web-audio-api but payload is html-css). Title backfilled from <title> tag.`],
    });

    console.log(`  ✓ updated ${id}`);
  }
})();
