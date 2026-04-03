import { isAvailable } from "./ollama";
import { runFullPipeline, produceWork, evaluateWork, critiqueWork, resolveDeadlock, reconsiderWork } from "./pipeline";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Check Ollama is running
  if (!(await isAvailable())) {
    console.error("ERROR: Ollama is not running. Start it with: brew services start ollama");
    process.exit(1);
  }

  switch (command) {
    case "produce": {
      // Produce a work from a specific Originator
      const originatorId = args[1] || "MNA-OR-0001";
      const { workId, output } = await produceWork(originatorId);
      console.log(`\nProduced: ${workId}`);
      console.log(`\n${output}`);
      break;
    }

    case "evaluate": {
      // Evaluate a specific work
      const workId = args[1];
      if (!workId) {
        console.error("Usage: run evaluate <work-id>");
        process.exit(1);
      }
      await evaluateWork(workId);
      break;
    }

    case "critique": {
      // Have both Critics respond to a canonized work
      const workId = args[1];
      if (!workId) {
        console.error("Usage: run critique <work-id>");
        process.exit(1);
      }
      await critiqueWork(workId);
      break;
    }

    case "critique-all": {
      // Critique all canonized works that haven't been critiqued yet
      const Database = require("better-sqlite3");
      const path = require("path");
      const db = new Database(
        path.join(__dirname, "..", "data", "mna.db")
      );
      const uncritiqued = db.prepare(`
        SELECT cs.work_id
        FROM canon_status cs
        WHERE cs.status = 'CANON'
          AND cs.work_id NOT IN (
            SELECT DISTINCT work_id FROM critical_responses
          )
        ORDER BY cs.canon_date ASC
      `).all() as { work_id: string }[];
      db.close();

      if (uncritiqued.length === 0) {
        console.log("All canonized works have been critiqued.");
        break;
      }

      console.log(`Found ${uncritiqued.length} uncritiqued canon works.\n`);
      for (const { work_id } of uncritiqued) {
        await critiqueWork(work_id);
      }
      break;
    }

    case "resolve": {
      // Resolve a deadlocked work
      const workId = args[1];
      if (!workId) {
        // Find all deadlocked works
        const Database = require("better-sqlite3");
        const path = require("path");
        const db = new Database(
          path.join(__dirname, "..", "data", "mna.db")
        );
        const deadlocked = db.prepare(
          "SELECT work_id FROM canon_status WHERE status = 'IN_REVIEW'"
        ).all() as { work_id: string }[];
        db.close();

        if (deadlocked.length === 0) {
          console.log("No deadlocked works to resolve.");
          break;
        }

        console.log(`Found ${deadlocked.length} deadlocked works. Resolving...\n`);
        for (const { work_id } of deadlocked) {
          await resolveDeadlock(work_id);
        }
        break;
      }
      await resolveDeadlock(workId);
      break;
    }

    case "reconsider": {
      // Reconsider a previously rejected work
      const workId = args[1];
      const requestedBy = args[2] || "MNA-SA-0001";
      const reason = args[3] || "Institutional reconsideration — pattern review";
      if (!workId) {
        console.error("Usage: run reconsider <work-id> [requested-by] [reason]");
        process.exit(1);
      }
      await reconsiderWork(workId, reason, requestedBy);
      break;
    }

    case "pipeline": {
      // Full pipeline for one Originator (produce → evaluate → critique/resolve)
      const originatorId = args[1] || "MNA-OR-0001";
      await runFullPipeline(originatorId);
      break;
    }

    case "all": {
      // Run full pipeline for all active Originators
      const Database = require("better-sqlite3");
      const path = require("path");
      const db = new Database(
        path.join(__dirname, "..", "data", "mna.db")
      );
      const originators = db
        .prepare(
          `SELECT registry_id FROM agents WHERE agent_type = 'ORIGINATOR' AND operational_status = 'ACTIVE' ORDER BY registry_id`
        )
        .all()
        .map((r: { registry_id: string }) => r.registry_id);
      db.close();
      console.log(`Running full pipeline for ${originators.length} Originators: ${originators.join(", ")}`);
      for (const id of originators) {
        try {
          await runFullPipeline(id);
        } catch (err) {
          console.error(`\n[PIPELINE ERROR] ${id} failed: ${err instanceof Error ? err.message : err}`);
          console.log(`Continuing to next Originator...\n`);
        }
      }

      // Auto-export to website data files
      console.log("\n[AUTO-EXPORT] Exporting to website data files...");
      const { exportAll } = require("./export");
      await exportAll();
      break;
    }

    case "status": {
      // Show current database status
      const Database = require("better-sqlite3");
      const path = require("path");
      const db = new Database(
        path.join(__dirname, "..", "data", "mna.db")
      );
      const agents = db.prepare("SELECT COUNT(*) as n FROM agents").get().n;
      const works = db.prepare("SELECT COUNT(*) as n FROM works").get().n;
      const evals = db
        .prepare("SELECT COUNT(*) as n FROM evaluations")
        .get().n;
      const canon = db
        .prepare(
          "SELECT COUNT(*) as n FROM canon_status WHERE status = 'CANON'"
        )
        .get().n;
      const rejected = db
        .prepare(
          "SELECT COUNT(*) as n FROM canon_status WHERE status = 'REJECTED'"
        )
        .get().n;
      const inReview = db
        .prepare(
          "SELECT COUNT(*) as n FROM canon_status WHERE status = 'IN_REVIEW'"
        )
        .get().n;
      const critiques = db
        .prepare("SELECT COUNT(*) as n FROM critical_responses")
        .get().n;

      console.log(`\nMNA System Status`);
      console.log(`${"─".repeat(30)}`);
      console.log(`Agents:      ${agents}`);
      console.log(`Works:       ${works}`);
      console.log(`Evaluations: ${evals}`);
      console.log(`Canon:       ${canon}`);
      console.log(`Rejected:    ${rejected}`);
      console.log(`In Review:   ${inReview}`);
      console.log(`Critiques:   ${critiques}`);

      if (works > 0) {
        console.log(`\nRecent works:`);
        db.prepare(
          `SELECT w.id, w.originator_id, cs.status, w.created_at
           FROM works w
           LEFT JOIN canon_status cs ON w.id = cs.work_id
           ORDER BY w.created_at DESC LIMIT 10`
        )
          .all()
          .forEach((r: any) => {
            console.log(`  ${r.id}  ${r.status || "UNKNOWN"}  ${r.created_at}`);
          });
      }

      // Show uncritiqued canon works
      const uncritiqued = db.prepare(`
        SELECT cs.work_id
        FROM canon_status cs
        WHERE cs.status = 'CANON'
          AND cs.work_id NOT IN (
            SELECT DISTINCT work_id FROM critical_responses
          )
      `).all() as { work_id: string }[];

      if (uncritiqued.length > 0) {
        console.log(`\nUncritiqued canon works: ${uncritiqued.length}`);
        uncritiqued.forEach((r: any) => console.log(`  ${r.work_id}`));
      }

      db.close();
      break;
    }

    default:
      console.log(`
MNA Agent System

Commands:
  npx ts-node src/run.ts produce [originator-id]   Produce one work
  npx ts-node src/run.ts evaluate <work-id>         Evaluate a work
  npx ts-node src/run.ts critique <work-id>         Both Critics respond to a canon work
  npx ts-node src/run.ts critique-all               Critique all uncritiqued canon works
  npx ts-node src/run.ts resolve [work-id]          Resolve deadlocked works (2nd round)
  npx ts-node src/run.ts pipeline [originator-id]   Full pipeline: produce + evaluate + critique/resolve
  npx ts-node src/run.ts all                        Run full pipeline for all 4 Originators
  npx ts-node src/run.ts status                     Show system status
      `);
  }
}

main().catch(console.error);
