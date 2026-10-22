import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let tempDir: string | null = null;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

async function seed(opts: { second?: "published" | "marked" } = {}) {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-poster-restart-"));
  vi.stubEnv("DATABASE_URL", path.join(tempDir, "test.db"));
  vi.resetModules();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const { db, sqlite } = await import("@/db");
  const schema = await import("@/db/schema");
  const claim = await import("@/lib/pipeline/publish-claim");
  const recovery = await import("@/lib/pipeline/recover-abandoned-runs");
  const now = new Date();
  const started = new Date(now.getTime() - 60_000);
  await db.insert(schema.organizations).values({ id: "o1", name: "O", slug: "o", createdAt: now, updatedAt: now });
  await db.insert(schema.workspaces).values({ id: "w1", organizationId: "o1", name: "W", slug: "w", createdAt: now, updatedAt: now });
  for (const id of ["p1", "p2"]) {
    await db.insert(schema.platforms).values({ id, workspaceId: "w1", name: id, type: "instagram", provider: "direct", createdAt: now, updatedAt: now });
  }
  await db.insert(schema.posts).values({ id: "post1", workspaceId: "w1", content: "hi", status: "publishing", scheduledAt: started, createdAt: now, updatedAt: started });
  await db.insert(schema.postTargets).values({ id: "t1", postId: "post1", platformId: "p1", status: "publishing", error: null, createdAt: now });
  if (opts.second === "published") {
    await db.insert(schema.postTargets).values({ id: "t2", postId: "post1", platformId: "p2", status: "published", publishedAt: started, platformPostId: "x1", createdAt: now });
  }
  if (opts.second === "marked") {
    await db.insert(schema.postTargets).values({
      id: "t2", postId: "post1", platformId: "p2", status: "publishing",
      error: claim.stampNetworkError("fetch failed", started), createdAt: now,
    });
  }
  await db.insert(schema.pipelineRuns).values({ id: "r1", workspaceId: "w1", postId: "post1", trigger: "api", status: "running", steps: [], startedAt: started });
  const target = async (id: string) =>
    (await db.select().from(schema.postTargets)).find((t) => t.id === id)!;
  return { claim, recovery, target, db, schema, sqlite };
}

describe("restart mid-publish recovery", () => {
  it("marks the interrupted target unknown-delivery; only explicit manual retry reclaims it", async () => {
    const { claim, recovery, target, db, schema, sqlite } = await seed();

    await recovery.recoverAbandonedRuns();

    const t1 = await target("t1");
    expect(t1.status).toBe("publishing");
    expect(t1.error).toMatch(/^network_error:\d{4}-\d{2}-\d{2}T[\d:.]+Z: interrupted by restart; delivery unknown$/);
    const runs = await db.select().from(schema.pipelineRuns);
    expect(runs[0].status).toBe("failed");

    // Scheduler sweep never republishes, even long after the window.
    const later = new Date(Date.now() + 60 * 60_000);
    expect(
      claim.claimPostForPublishing({ workspaceId: "w1", postId: "post1", mode: "scheduled", now: later, retryUnknownDelivery: true }).kind
    ).toBe("publishing");
    // Manual without the flag: blocked.
    expect(
      claim.claimPostForPublishing({ workspaceId: "w1", postId: "post1", mode: "manual", now: later }).kind
    ).toBe("publishing");
    // Manual with the flag but inside the stale window: blocked.
    expect(
      claim.claimPostForPublishing({ workspaceId: "w1", postId: "post1", mode: "manual", retryUnknownDelivery: true }).kind
    ).toBe("publishing");
    // Explicit manual retry after the window: reclaims.
    const result = claim.claimPostForPublishing({ workspaceId: "w1", postId: "post1", mode: "manual", now: later, retryUnknownDelivery: true });
    expect(result.kind).toBe("claimed");
    if (result.kind === "claimed") {
      expect(result.reclaimedUnknownDelivery).toBe(true);
      expect(result.publishTargets.map(({ target: t }) => t.id)).toEqual(["t1"]);
    }
    sqlite.close();
  });

  it("does not touch delivered targets or existing markers, and is idempotent", async () => {
    const { recovery, target, claim, sqlite } = await seed({ second: "marked" });
    const before = (await target("t2")).error;
    await recovery.recoverAbandonedRuns();
    expect((await target("t2")).error).toBe(before);
    expect((await target("t1")).error).toContain("interrupted by restart");
    expect(claim.markInterruptedPublishTargets("post1")).toBe(0);
    sqlite.close();
  });

  it("leaves a delivered target as published", async () => {
    const { recovery, target, sqlite } = await seed({ second: "published" });
    await recovery.recoverAbandonedRuns();
    const t2 = await target("t2");
    expect(t2.status).toBe("published");
    expect(t2.error).toBeNull();
    sqlite.close();
  });
});
