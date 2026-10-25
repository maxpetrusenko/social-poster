import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
  claimReplySlot: vi.fn(),
  sendReplyViaPlatform: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => {
  const rows = { then: (r: (v: unknown[]) => unknown) => r([]) };
  const db = {
    insert: () => ({ values: async () => undefined }),
    update: () => ({
      set: (v: Record<string, unknown>) => {
        h.updates.push(v);
        return { where: async () => undefined };
      },
    }),
    select: () => ({ from: () => ({ where: () => rows }) }),
    query: {
      platforms: { findFirst: async () => ({ id: "p1", type: "x", provider: "bird", config: {}, handle: "max" }) },
      replyEvents: { findFirst: async () => undefined },
    },
  };
  return { db };
});
vi.mock("@/lib/replies/bird", () => ({
  getMentionsForPlatform: async () => [
    {
      id: "t1",
      text: "shipping an agent runtime today",
      createdAt: new Date().toISOString(),
      author: { username: "someone", followersCount: 10 },
    },
  ],
  getHomeTimelineForPlatform: async () => [],
  searchTweetsForPlatform: async () => [],
  getReplyCount: () => 0,
  getRetweetCount: () => 0,
  getTweetAuthor: () => "someone",
  getTweetUrl: () => "https://x.com/someone/status/t1",
  isReplyTweet: () => false,
}));
vi.mock("@/lib/replies/ai", () => ({
  generateAiReplyDraftsWithProvider: async () => ({
    provider: "deepseek",
    drafts: new Map([["t1", ["what breaks first when the runtime restarts mid task"]]]),
  }),
}));
vi.mock("@/lib/replies/duplicate-guard", () => ({
  claimReplySlot: h.claimReplySlot,
  filterUntriedReplyDrafts: (d: string[]) => d,
  isDuplicateReplyError: () => false,
  markReplySlotFailed: vi.fn(),
  markReplySlotSent: vi.fn(),
  normalizeReplyText: (s: string) => s,
}));
vi.mock("@/lib/replies/transport", () => ({ sendReplyViaPlatform: h.sendReplyViaPlatform }));

import { isDryRunConfig, runReplyEngineJob } from "./reply-engine.ts";

const schedule = (config: unknown) =>
  ({ id: "s1", workspaceId: "w1", targetPlatformIds: ["p1"], config }) as never;

describe("isDryRunConfig", () => {
  it("parses objects, strings and junk defensively", () => {
    expect(isDryRunConfig({ dryRun: true })).toBe(true);
    expect(isDryRunConfig('{"dryRun":true}')).toBe(true);
    expect(isDryRunConfig({ dryRun: "true" })).toBe(false);
    expect(isDryRunConfig("not json")).toBe(false);
    expect(isDryRunConfig(null)).toBe(false);
  });
});

describe("runReplyEngineJob dryRun", () => {
  beforeEach(() => {
    h.updates.length = 0;
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => vi.clearAllMocks());

  it("records drafts in a reply:dry-run step and never claims or sends", async () => {
    await runReplyEngineJob(schedule({ dryRun: true }), "manual");

    expect(h.claimReplySlot).not.toHaveBeenCalled();
    expect(h.sendReplyViaPlatform).not.toHaveBeenCalled();
    const final = h.updates.at(-1)!;
    expect(final.status).toBe("completed");
    const steps = final.steps as Array<{ name: string; output?: { draftProvider?: string; candidates: Array<Record<string, unknown>> } }>;
    const dry = steps.find((s) => s.name === "reply:dry-run")!;
    expect(dry.output!.draftProvider).toBe("deepseek");
    expect(dry.output!.candidates[0]).toMatchObject({
      tweetUrl: "https://x.com/someone/status/t1",
      author: "someone",
      tweetText: "shipping an agent runtime today",
      drafts: ["what breaks first when the runtime restarts mid task"],
    });
    expect(steps.some((s) => s.name === "publish")).toBe(false);
  });

  it("still claims and sends when dryRun is not set", async () => {
    h.claimReplySlot.mockResolvedValue("evt1");
    h.sendReplyViaPlatform.mockResolvedValue({ replyUrl: "https://x.com/r/1" });
    await runReplyEngineJob(schedule(null), "manual");
    expect(h.claimReplySlot).toHaveBeenCalled();
    expect(h.sendReplyViaPlatform).toHaveBeenCalled();
  });
});
