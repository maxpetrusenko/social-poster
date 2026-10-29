// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Older databases created organizations before plan columns existed.
const PRE_PLAN_ORGANIZATIONS = `
  CREATE TABLE organizations (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    logo_url TEXT,
    default_timezone TEXT NOT NULL DEFAULT 'UTC',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;

// Databases created while the post limit defaulted to 50. The table keeps its
// SQLite DEFAULT 50, but Drizzle inserts send the schema default (150) explicitly.
const FIFTY_DEFAULT_ORGANIZATIONS = `
  CREATE TABLE organizations (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    logo_url TEXT,
    default_timezone TEXT NOT NULL DEFAULT 'UTC',
    plan TEXT NOT NULL DEFAULT 'free',
    plan_label TEXT NOT NULL DEFAULT 'Free',
    max_profiles INTEGER NOT NULL DEFAULT 5,
    max_platforms INTEGER NOT NULL DEFAULT 3,
    max_posts_per_month INTEGER NOT NULL DEFAULT 50,
    billing_email TEXT,
    billing_cycle_start INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;

let tmpDir: string;
let dbPath: string;
const openHandles: Database.Database[] = [];

function insertOrg(sqlite: Database.Database, id: string, maxPosts?: number) {
  const now = Date.now();
  if (maxPosts === undefined) {
    sqlite
      .prepare("INSERT INTO organizations (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, id, id, now, now);
    return;
  }
  sqlite
    .prepare(
      "INSERT INTO organizations (id, name, slug, max_posts_per_month, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(id, id, id, maxPosts, now, now);
}

function readLimits(sqlite: Database.Database) {
  return Object.fromEntries(
    sqlite
      .prepare("SELECT id, max_posts_per_month AS m FROM organizations ORDER BY id")
      .all()
      .map((row) => [(row as { id: string }).id, (row as { m: number }).m])
  );
}

function seedLegacy(createTable: string, seed: (sqlite: Database.Database) => void) {
  const legacy = new Database(dbPath);
  legacy.exec(createTable);
  seed(legacy);
  legacy.close();
}

async function bootDb() {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", dbPath);
  const { sqlite } = await import("@/db");
  openHandles.push(sqlite);
  return sqlite;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "org-limit-"));
  dbPath = path.join(tmpDir, "test.db");
});

afterEach(() => {
  for (const handle of openHandles.splice(0)) {
    if (handle.open) handle.close();
  }
  vi.unstubAllEnvs();
  vi.resetModules();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("organizations.max_posts_per_month bootstrap", () => {
  it("raises orgs on the old 50 default to 150 and keeps custom limits", async () => {
    seedLegacy(FIFTY_DEFAULT_ORGANIZATIONS, (legacy) => {
      insertOrg(legacy, "org-old-default", 50);
      insertOrg(legacy, "org-custom-high", 300);
      insertOrg(legacy, "org-custom-low", 10);
      insertOrg(legacy, "org-unlimited", 0);
    });

    const sqlite = await bootDb();

    expect(readLimits(sqlite)).toEqual({
      "org-custom-high": 300,
      "org-custom-low": 10,
      "org-old-default": 150,
      "org-unlimited": 0,
    });
  });

  it("adds the column with a 150 default to databases that predate plan columns", async () => {
    seedLegacy(PRE_PLAN_ORGANIZATIONS, (legacy) => insertOrg(legacy, "org-existing"));

    const sqlite = await bootDb();
    insertOrg(sqlite, "org-new");

    expect(readLimits(sqlite)).toEqual({ "org-existing": 150, "org-new": 150 });
  });

  it("gives new orgs on a fresh database the 150 default", async () => {
    const sqlite = await bootDb();

    insertOrg(sqlite, "org-new");

    expect(readLimits(sqlite)).toEqual({ "org-new": 150 });
  });

  it("is idempotent across restarts", async () => {
    seedLegacy(FIFTY_DEFAULT_ORGANIZATIONS, (legacy) => insertOrg(legacy, "org-old-default", 50));

    (await bootDb()).close();
    const sqlite = await bootDb();

    expect(readLimits(sqlite)).toEqual({ "org-old-default": 150 });
  });
});
