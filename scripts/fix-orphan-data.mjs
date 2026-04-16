#!/usr/bin/env node
/**
 * One-time backfill script to fix:
 *  1. Orphan "publishing" posts stuck without scheduledAt or publishedAt
 *  2. Legacy pipeline_runs with millisecond-scale timestamps
 *
 * Safe to run multiple times — idempotent.
 *
 * Usage:  node scripts/fix-orphan-data.mjs
 */

import Database from "better-sqlite3";
import { resolve } from "node:path";

const DB_PATH =
  process.env.DB_PATH ??
  resolve(import.meta.dirname, "..", "data", "social-poster.db");

console.log(`Opening ${DB_PATH}`);
const db = new Database(DB_PATH);

// ── Fix #3: Orphan "publishing" posts ────────────────────────────────
// Posts stuck in "publishing" with no scheduledAt AND no publishedAt
// cannot appear on any calendar query. Mark them as failed.
const orphanPublishing = db
  .prepare(
    `UPDATE posts
        SET status = 'failed', updated_at = ?
      WHERE status = 'publishing'
        AND scheduled_at IS NULL
        AND published_at IS NULL`
  )
  .run(Math.floor(Date.now() / 1000));

console.log(`[fix-orphan] Publishing → failed: ${orphanPublishing.changes} rows`);

// ── Fix #5: Legacy pipeline_runs with millisecond-scale timestamps ───
// Drizzle "timestamp" mode stores seconds. Any started_at > 10 billion
// is clearly milliseconds and needs dividing by 1000.
const MS_THRESHOLD = 10_000_000_000; // ~2286-11-20 in seconds, always ms if above

const msPipelineRuns = db
  .prepare(
    `SELECT id, started_at, completed_at FROM pipeline_runs
      WHERE started_at > ?`
  )
  .all(MS_THRESHOLD);

let fixed = 0;
const update = db.prepare(
  `UPDATE pipeline_runs SET started_at = ?, completed_at = ? WHERE id = ?`
);

for (const row of msPipelineRuns) {
  const startedAt = Math.floor(row.started_at / 1000);
  const completedAt = row.completed_at
    ? Math.floor(row.completed_at / 1000)
    : null;
  update.run(startedAt, completedAt, row.id);
  fixed++;
}

console.log(`[fix-timestamps] Corrected ${fixed} pipeline_runs from ms → sec`);

db.close();
console.log("Done.");
