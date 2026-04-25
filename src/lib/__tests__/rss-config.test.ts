import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let tempDir: string | null = null;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

async function setupWorkspace() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-poster-rss-"));
  vi.stubEnv("DATABASE_URL", path.join(tempDir, "test.db"));
  vi.resetModules();

  const { sqlite } = await import("@/db");
  const now = Date.now();
  sqlite
    .prepare(
      `INSERT INTO organizations (id, name, slug, default_timezone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run("org_1", "SMM Agent", "smm-agent", "America/New_York", now, now);
  sqlite
    .prepare(
      `INSERT INTO workspaces (id, organization_id, name, slug, timezone, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run("workspace_1", "org_1", "Primary Workspace", "primary-workspace", "America/New_York", now, now);

  return sqlite;
}

describe("workspace RSS config", () => {
  it("does not insert default feeds or settings when reading a fresh workspace", async () => {
    const sqlite = await setupWorkspace();
    const {
      DEFAULT_RSS_SETTINGS,
      getWorkspaceRssSettings,
      getWorkspaceRssSources,
    } = await import("@/lib/rss-config");

    await expect(getWorkspaceRssSources("workspace_1")).resolves.toEqual([]);
    await expect(getWorkspaceRssSettings("workspace_1")).resolves.toEqual(
      DEFAULT_RSS_SETTINGS
    );

    const sourceCount = sqlite
      .prepare("SELECT COUNT(*) AS count FROM rss_sources WHERE workspace_id = ?")
      .get("workspace_1");
    const settingsCount = sqlite
      .prepare("SELECT COUNT(*) AS count FROM rss_settings WHERE workspace_id = ?")
      .get("workspace_1");

    expect(sourceCount).toEqual({ count: 0 });
    expect(settingsCount).toEqual({ count: 0 });

    sqlite.close();
  });

  it("returns no workspace candidates until the workspace has feeds", async () => {
    const sqlite = await setupWorkspace();
    const { getCandidateStories, getFeedSourceDiagnostics } = await import(
      "@/lib/pipeline/feed-engine"
    );

    await expect(
      getCandidateStories({ workspaceId: "workspace_1" })
    ).resolves.toEqual([]);
    await expect(
      getFeedSourceDiagnostics({ workspaceId: "workspace_1" })
    ).resolves.toEqual([]);

    sqlite.close();
  });
});
