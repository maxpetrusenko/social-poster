import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let tempDir: string | null = null;
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

describe("work-to-post schema DDL", () => {
  it("creates isolated core tables in a fresh database", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-poster-work-to-post-"));
    vi.stubEnv("DATABASE_URL", path.join(tempDir, "test.db"));
    const { sqlite } = await import("@/db");
    const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('work_completion_events', 'content_candidates', 'content_lifecycle_events', 'command_receipts', 'dispatch_intents', 'content_reviews', 'person_dossiers')").all() as Array<{ name: string }>;
    expect(tables.map((entry) => entry.name).sort()).toEqual(["command_receipts", "content_candidates", "content_lifecycle_events", "content_reviews", "dispatch_intents", "person_dossiers", "work_completion_events"]);
    sqlite.close();
  });

  it("upgrades a prior work-to-post receipt table with idempotency scope columns", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-poster-work-to-post-upgrade-"));
    const dbPath = path.join(tempDir, "test.db");
    const Database = (await import("better-sqlite3")).default;
    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE command_receipts (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, response TEXT NOT NULL, created_at INTEGER NOT NULL);
      INSERT INTO command_receipts VALUES ('receipt-a', 'workspace-a', 'legacy-key', 'legacy-hash', '{"id":"decision-a"}', 1);
    `);
    legacy.close();
    vi.stubEnv("DATABASE_URL", dbPath);
    const { sqlite } = await import("@/db");
    const columns = sqlite.prepare("PRAGMA table_info(command_receipts)").all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining(["operation", "candidate_id", "revision_number", "command_type", "scope_digest", "state", "lease_expires_at", "attempts", "updated_at"]));
    expect(sqlite.prepare("SELECT state, candidate_id FROM command_receipts WHERE id = 'receipt-a'").get()).toEqual(expect.objectContaining({ state: "completed" }));
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    sqlite.close();
  });

  it("rebuilds legacy dispatch rows with deterministic unique digests and candidate foreign keys", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-poster-work-to-post-dispatch-upgrade-"));
    const dbPath = path.join(tempDir, "test.db");
    const Database = (await import("better-sqlite3")).default;
    const legacy = new Database(dbPath);
    legacy.exec(`
      CREATE TABLE dispatch_intents (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        candidate_id TEXT,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      INSERT INTO dispatch_intents VALUES
        ('dispatch-a', 'workspace-a', '', 'simulated_published', 'simulated_published', 'hash-a', 1),
        ('dispatch-b', 'workspace-a', '', 'simulated_published', 'simulated_published', 'hash-b', 2);
    `);
    legacy.close();
    vi.stubEnv("DATABASE_URL", dbPath);
    const { sqlite } = await import("@/db");
    const rows = sqlite.prepare("SELECT candidate_id, approval_digest FROM dispatch_intents ORDER BY id").all() as Array<{ candidate_id: string; approval_digest: string }>;
    expect(new Set(rows.map((row) => row.approval_digest)).size).toBe(2);
    expect(rows.every((row) => row.approval_digest.length > 0)).toBe(true);
    expect(rows.every((row) => row.candidate_id.length > 0)).toBe(true);
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    const foreignKeys = sqlite.prepare("PRAGMA foreign_key_list(dispatch_intents)").all() as Array<{ from: string; table: string }>;
    expect(foreignKeys).toContainEqual(expect.objectContaining({ from: "candidate_id", table: "content_candidates" }));
    sqlite.close();
  });
});
