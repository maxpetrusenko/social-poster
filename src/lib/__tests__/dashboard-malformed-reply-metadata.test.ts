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

describe("dashboard reply event reads", () => {
  it("ignore malformed metadata when the dashboard does not use it", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-poster-dashboard-"));
    vi.stubEnv("DATABASE_URL", path.join(tempDir, "test.db"));
    vi.resetModules();

    const { sqlite } = await import("@/db");
    const now = Math.floor(Date.now() / 1000);

    sqlite
      .prepare(
        `INSERT INTO organizations (id, name, slug, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run("org_1", "SMM Agent", "smm-agent", now, now);
    sqlite
      .prepare(
        `INSERT INTO workspaces (id, organization_id, name, slug, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run("workspace_1", "org_1", "Primary Workspace", "primary-workspace", now, now);
    sqlite
      .prepare(
        `INSERT INTO platforms (id, workspace_id, name, type, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run("platform_1", "workspace_1", "X", "twitter", 1, now, now);
    sqlite
      .prepare(
        `INSERT INTO reply_events (
           id, workspace_id, platform_id, tweet_url, author_handle, lane, status, metadata, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "reply_1",
        "workspace_1",
        "platform_1",
        "https://x.com/example/status/1",
        "@example",
        "default",
        "sent",
        "{malformed",
        now
      );

    try {
      const { getDashboardInsights } = await import("@/lib/dashboard/insights");
      const { getLatestActionLogRows } = await import("@/lib/dashboard/action-log");

      const insights = await getDashboardInsights("workspace_1");
      const actionRows = await getLatestActionLogRows({
        workspaceId: "workspace_1",
        organizationId: "org_1",
      });

      expect(insights.replyCount30d).toBe(1);
      expect(actionRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "reply:reply_1",
            status: "sent",
          }),
        ])
      );
    } finally {
      sqlite.close();
    }
  });
});
