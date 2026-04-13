import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = path.resolve(rootDir, process.env.DATABASE_URL ?? "data/social-poster.db");
const db = new Database(dbPath);

const rows = db.prepare("select id, status, steps, error from pipeline_runs").all();
const update = db.prepare("update pipeline_runs set status = ? where id = ?");

let changed = 0;
for (const row of rows) {
  const steps = parseSteps(row.steps);
  const nextStatus = resolvePipelineRunStatus({
    status: row.status,
    steps,
    error: row.error,
  });

  if (nextStatus !== row.status) {
    update.run(nextStatus, row.id);
    changed += 1;
  }
}

console.log(JSON.stringify({ total: rows.length, changed }, null, 2));

function parseSteps(value) {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function resolvePipelineRunStatus(input) {
  if (input.status === "running") return "running";
  if (input.error) return "failed";

  const steps = input.steps ?? [];
  if (
    steps.some(
      (step) => step.status === "failed" || (step.status === "skipped" && Boolean(step.error))
    )
  ) {
    return "failed";
  }

  return input.status === "failed" ? "failed" : "completed";
}
