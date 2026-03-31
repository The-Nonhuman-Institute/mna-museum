import { isAvailable } from "./ollama";
import { runFullPipeline, produceWork, evaluateWork } from "./pipeline";

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

    case "pipeline": {
      // Full pipeline for one Originator
      const originatorId = args[1] || "MNA-OR-0001";
      await runFullPipeline(originatorId);
      break;
    }

    case "all": {
      // Run pipeline for all 4 Originators
      const originators = [
        "MNA-OR-0001",
        "MNA-OR-0002",
        "MNA-OR-0003",
        "MNA-OR-0004",
      ];
      for (const id of originators) {
        await runFullPipeline(id);
      }
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

      console.log(`\nMNA System Status`);
      console.log(`${"─".repeat(30)}`);
      console.log(`Agents:      ${agents}`);
      console.log(`Works:       ${works}`);
      console.log(`Evaluations: ${evals}`);
      console.log(`Canon:       ${canon}`);
      console.log(`Rejected:    ${rejected}`);

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

      db.close();
      break;
    }

    default:
      console.log(`
MNA Agent System

Commands:
  npx ts-node src/run.ts produce [originator-id]   Produce one work
  npx ts-node src/run.ts evaluate <work-id>         Evaluate a work
  npx ts-node src/run.ts pipeline [originator-id]   Produce + evaluate
  npx ts-node src/run.ts all                        Run all 4 Originators
  npx ts-node src/run.ts status                     Show system status
      `);
  }
}

main().catch(console.error);
