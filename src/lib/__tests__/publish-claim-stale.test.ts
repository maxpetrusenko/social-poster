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

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

async function seed(opts: { error: string | null; runStatus?: string }) {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "social-poster-claim-"));
  vi.stubEnv("DATABASE_URL", path.join(tempDir, "test.db"));
  vi.resetModules();
  const { db, sqlite } = await import("@/db");
  const schema = await import("@/db/schema");
  const claim = await import("@/lib/pipeline/publish-claim");
  const now = new Date();
  await db.insert(schema.organizations).values({ id: "o1", name: "O", slug: "o", createdAt: now, updatedAt: now });
  await db.insert(schema.workspaces).values({ id: "w1", organizationId: "o1", name: "W", slug: "w", createdAt: now, updatedAt: now });
  await db.insert(schema.platforms).values({ id: "p1", workspaceId: "w1", name: "IG", type: "instagram", provider: "direct", createdAt: now, updatedAt: now });
  await db.insert(schema.posts).values({ id: "post1", workspaceId: "w1", content: "hi", status: "publishing", createdAt: now, updatedAt: minutesAgo(30) });
  await db.insert(schema.postTargets).values({ id: "t1", postId: "post1", platformId: "p1", status: "publishing", error: opts.error, createdAt: now });
  await db.insert(schema.pipelineRuns).values({
    id: "r1", workspaceId: "w1", postId: "post1", trigger: "api", status: opts.runStatus ?? "failed", steps: [], startedAt: minutesAgo(30),
  });
  return { claim, sqlite };
}

const markerAgo = (claim: { stampNetworkError: (d: string, at: Date) => string }, m: number) =>
  claim.stampNetworkError("fetch failed", minutesAgo(m));

describe("claimPostForPublishing unknown-delivery recovery", () => {
  it("reclaims a finished, stale network_error target on an explicit manual retry", async () => {
    const pre = await import("@/lib/pipeline/publish-claim");
    const { claim, sqlite } = await seed({ error: markerAgo(pre, 30) });
    const result = claim.claimPostForPublishing({ workspaceId: "w1", postId: "post1", mode: "manual", retryUnknownDelivery: true });
    expect(result.kind).toBe("claimed");
    if (result.kind === "claimed") {
      expect(result.reclaimedUnknownDelivery).toBe(true);
      expect(result.publishTargets.map(({ target }) => target.id)).toEqual(["t1"]);
    }
    sqlite.close();
  });

  it("blocks a retry without the retryUnknownDelivery flag", async () => {
    const pre = await import("@/lib/pipeline/publish-claim");
    const { claim, sqlite } = await seed({ error: markerAgo(pre, 30) });
    expect(claim.claimPostForPublishing({ workspaceId: "w1", postId: "post1", mode: "manual" }).kind).toBe("publishing");
    sqlite.close();
  });

  it("keeps a slow in-flight publish (no marker) blocked even past the window", async () => {
    const { claim, sqlite } = await seed({ error: null, runStatus: "running" });
    expect(
      claim.claimPostForPublishing({ workspaceId: "w1", postId: "post1", mode: "manual", retryUnknownDelivery: true }).kind
    ).toBe("publishing");
    sqlite.close();
  });

  it("blocks while a pipeline run is still running, even with a marker", async () => {
    const pre = await import("@/lib/pipeline/publish-claim");
    const { claim, sqlite } = await seed({ error: markerAgo(pre, 30), runStatus: "running" });
    expect(
      claim.claimPostForPublishing({ workspaceId: "w1", postId: "post1", mode: "manual", retryUnknownDelivery: true }).kind
    ).toBe("publishing");
    sqlite.close();
  });

  it("blocks a marker still inside the window", async () => {
    const pre = await import("@/lib/pipeline/publish-claim");
    const { claim, sqlite } = await seed({ error: markerAgo(pre, 2) });
    expect(
      claim.claimPostForPublishing({ workspaceId: "w1", postId: "post1", mode: "manual", retryUnknownDelivery: true }).kind
    ).toBe("publishing");
    sqlite.close();
  });

  it("never retries from the scheduled sweep", async () => {
    const pre = await import("@/lib/pipeline/publish-claim");
    const { claim, sqlite } = await seed({ error: markerAgo(pre, 30) });
    expect(
      claim.claimPostForPublishing({ workspaceId: "w1", postId: "post1", mode: "scheduled", retryUnknownDelivery: true }).kind
    ).toBe("publishing");
    sqlite.close();
  });
});
