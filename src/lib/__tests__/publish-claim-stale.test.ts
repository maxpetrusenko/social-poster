import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const STALE_MS = 10 * 60 * 1000;
let tempDir: string | null = null;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  if (tempDir) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

async function seed(updatedAt: Date) {
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
  await db.insert(schema.posts).values({ id: "post1", workspaceId: "w1", content: "hi", status: "publishing", createdAt: now, updatedAt });
  await db.insert(schema.postTargets).values({
    id: "t1",
    postId: "post1",
    platformId: "p1",
    status: "publishing",
    error: "Delivery state is unknown: fetch failed",
    createdAt: now,
  });
  return { claim, sqlite };
}

describe("claimPostForPublishing stale network_error recovery", () => {
  it("keeps a fresh ambiguous publish blocked", async () => {
    const { claim, sqlite } = await seed(new Date());
    const result = claim.claimPostForPublishing({ workspaceId: "w1", postId: "post1", mode: "manual" });
    expect(result.kind).toBe("publishing");
    sqlite.close();
  });

  it("lets an explicit manual publish retry a stale ambiguous target", async () => {
    const { claim, sqlite } = await seed(new Date(Date.now() - STALE_MS - 60_000));
    const result = claim.claimPostForPublishing({ workspaceId: "w1", postId: "post1", mode: "manual" });
    expect(result.kind).toBe("claimed");
    if (result.kind === "claimed") {
      expect(result.publishTargets.map(({ target }) => target.id)).toEqual(["t1"]);
    }
    sqlite.close();
  });

  it("never auto-retries a stale ambiguous target from the scheduled sweep", async () => {
    const { claim, sqlite } = await seed(new Date(Date.now() - STALE_MS - 60_000));
    const result = claim.claimPostForPublishing({ workspaceId: "w1", postId: "post1", mode: "scheduled" });
    expect(result.kind).toBe("publishing");
    sqlite.close();
  });
});
