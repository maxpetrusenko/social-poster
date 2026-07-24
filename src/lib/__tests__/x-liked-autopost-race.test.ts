import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/replies/bird", () => ({
  getLikedTweetsForPlatform: vi.fn(async () => [
    {
      id: "2064478648057610422",
      text: "Claude Fable 5 system prompt leak shows product behavior living in the prompt layer.",
      author: {
        username: "elder_plinius",
        name: "Pliny",
      },
    },
  ]),
  getTweetAuthor: (tweet: { author?: { username?: string } }) =>
    tweet.author?.username ?? "",
  getTweetAuthorName: (tweet: { author?: { name?: string } }) =>
    tweet.author?.name ?? "",
  getTweetImageUrl: () => null,
  getTweetText: (tweet: { text?: string }) => tweet.text ?? "",
  isReplyTweet: () => false,
}));

vi.mock("@/lib/x-liked-autopost-writer", () => ({
  XLikedAutopostWriterError: class XLikedAutopostWriterError extends Error {},
  draftXLikedAutopostContent: vi.fn(
    () =>
      new Promise((resolve) => {
        setTimeout(
          () =>
            resolve({
              content:
                "System prompts are product specs now. The useful part is seeing where behavior, tool routing, and policy actually live.",
              model: "test-model",
              modelSource: "env",
              traceUrl: null,
              review: {
                approved: true,
                issues: [],
                repairInstruction: "",
                model: "test-model",
                modelSource: "env",
                traceUrl: null,
              },
            }),
          25
        );
      })
  ),
}));

vi.mock("@/lib/open-graph-image", () => ({
  fetchOpenGraphImage: vi.fn(async () => null),
}));

vi.mock("@/lib/safe-remote-fetch", () => ({
  safeFetchRemote: vi.fn(async () => null),
}));

vi.mock("@/lib/storage/r2", () => ({
  uploadMediaAsset: vi.fn(async () => null),
}));

let tempDir: string | null = null;

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("X liked autopost race safety", () => {
  it("claims the liked tweet dedupe key before drafting so concurrent workers create one post", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-poster-x-liked-"));
    vi.stubEnv("DATABASE_URL", path.join(tempDir, "test.db"));
    vi.resetModules();

    const { sqlite } = await import("@/db");
    const { runXLikedAutopost } = await import("../x-liked-autopost");
    const now = Math.floor(Date.now() / 1000);

    sqlite
      .prepare(
        `INSERT INTO organizations (id, name, slug, default_timezone, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run("org", "Org", "org", "America/New_York", now, now);
    sqlite
      .prepare(
        `INSERT INTO workspaces (id, organization_id, name, slug, timezone, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run("workspace", "org", "Workspace", "workspace", "America/New_York", now, now);
    sqlite
      .prepare(
        `INSERT INTO profiles (id, workspace_id, name, is_default, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run("profile", "workspace", "Max", 1, now, now);
    sqlite
      .prepare(
        `INSERT INTO platforms (id, workspace_id, name, type, handle, provider, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run("x", "workspace", "X", "twitter", "maxpetrusenko", "bird", 1, now, now);
    sqlite
      .prepare(
        `INSERT INTO platforms (id, workspace_id, name, type, handle, provider, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run("linkedin", "workspace", "LinkedIn", "linkedin_personal", "max", "direct", 1, now, now);

    const [first, second] = await Promise.all([
      runXLikedAutopost({ workspaceId: "workspace", limit: 1, fetchCount: 1 }),
      runXLikedAutopost({ workspaceId: "workspace", limit: 1, fetchCount: 1 }),
    ]);

    expect(first.imported + second.imported).toBe(1);
    expect([...first.skipped, ...second.skipped]).toContainEqual({
      url: "https://x.com/elder_plinius/status/2064478648057610422",
      reason: "already imported",
    });

    expect(
      sqlite.prepare("SELECT COUNT(*) AS count FROM posts").get()
    ).toEqual({ count: 1 });
    expect(
      sqlite.prepare("SELECT COUNT(*) AS count FROM dedup_cache WHERE key = ?").get("x-like:2064478648057610422")
    ).toEqual({ count: 1 });
    expect(
      sqlite.prepare("SELECT COUNT(*) AS count FROM post_targets").get()
    ).toEqual({ count: 2 });

    sqlite.close();
  });
});
