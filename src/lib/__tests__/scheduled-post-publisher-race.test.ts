import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const publishPlatformTargets = vi.fn(async () => {
  await new Promise((resolve) => setTimeout(resolve, 25));
  return {
    outcomes: [
      {
        platform: "linkedin_personal",
        provider: "direct" as const,
        accountId: "linkedin-account",
        success: true,
        classification: "success" as const,
        postId: "urn:li:share:test",
        postUrl: "https://www.linkedin.com/feed/update/urn:li:share:test/",
      },
    ],
    published: ["linkedin_personal"],
    errors: [],
  };
});

vi.mock("@/lib/pipeline/publish-service", () => ({
  publishPlatformTargets,
}));

let tempDir: string | null = null;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  publishPlatformTargets.mockClear();
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("scheduled post publisher race safety", () => {
  it("claims a due scheduled post once before publishing to platforms", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-poster-scheduled-"));
    vi.stubEnv("DATABASE_URL", path.join(tempDir, "test.db"));
    vi.resetModules();

    const { sqlite } = await import("@/db");
    const { processDueScheduledPosts } = await import("../pipeline/scheduled-post-publisher");
    const nowSeconds = Math.floor(Date.now() / 1000);
    const dueAt = nowSeconds - 60;

    sqlite
      .prepare(
        `INSERT INTO organizations (id, name, slug, default_timezone, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run("org", "Org", "org", "America/New_York", nowSeconds, nowSeconds);
    sqlite
      .prepare(
        `INSERT INTO workspaces (id, organization_id, name, slug, timezone, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run("workspace", "org", "Workspace", "workspace", "America/New_York", nowSeconds, nowSeconds);
    sqlite
      .prepare(
        `INSERT INTO posts (id, workspace_id, title, content, content_type, status, scheduled_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "post",
        "workspace",
        "Post",
        "A strong tip for Hermes Agents: thoroughly study the docs.",
        "image",
        "scheduled",
        dueAt,
        nowSeconds,
        nowSeconds
      );
    sqlite
      .prepare(
        `INSERT INTO platforms (id, workspace_id, name, type, account_id, provider, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "linkedin",
        "workspace",
        "LinkedIn",
        "linkedin_personal",
        "linkedin-account",
        "direct",
        1,
        nowSeconds,
        nowSeconds
      );
    sqlite
      .prepare(
        `INSERT INTO post_targets (id, post_id, platform_id, status, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run("target", "post", "linkedin", "pending", nowSeconds);

    const [first, second] = await Promise.all([
      processDueScheduledPosts({ now: new Date(), limit: 5 }),
      processDueScheduledPosts({ now: new Date(), limit: 5 }),
    ]);

    expect(first.processed + second.processed).toBe(1);
    expect(publishPlatformTargets).toHaveBeenCalledTimes(1);
    expect(
      sqlite.prepare("SELECT COUNT(*) AS count FROM pipeline_runs").get()
    ).toEqual({ count: 1 });
    expect(
      sqlite.prepare("SELECT status, platform_post_id AS platformPostId FROM post_targets WHERE id = ?").get("target")
    ).toEqual({ status: "published", platformPostId: "urn:li:share:test" });
    expect(
      sqlite.prepare("SELECT status FROM posts WHERE id = ?").get("post")
    ).toEqual({ status: "published" });

    sqlite.close();
  });
});
