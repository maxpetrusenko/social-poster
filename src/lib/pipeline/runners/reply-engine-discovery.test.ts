import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
  mentions: [] as unknown[],
  home: [] as unknown[],
  search: [] as unknown[],
  searchQueries: [] as string[],
  homeCalls: 0,
  generate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => {
  const rows = { then: (r: (v: unknown[]) => unknown) => r([]) };
  return {
    db: {
      insert: () => ({ values: async () => undefined }),
      update: () => ({
        set: (v: Record<string, unknown>) => {
          h.updates.push(v);
          return { where: async () => undefined };
        },
      }),
      select: () => ({ from: () => ({ where: () => rows }) }),
      query: {
        platforms: {
          findFirst: async () => ({ id: "p1", type: "x", provider: "bird", config: {}, handle: "@MaxPetrusenko" }),
        },
        replyEvents: { findFirst: async () => undefined },
      },
    },
  };
});
vi.mock("@/lib/replies/bird", () => ({
  getMentionsForPlatform: async () => h.mentions,
  getFollowingTimelineForPlatform: async () => {
    h.homeCalls += 1;
    return h.home;
  },
  searchTweetsForPlatform: async (_p: unknown, query: string) => {
    h.searchQueries.push(query);
    return h.search;
  },
  getReplyCount: () => 0,
  getRetweetCount: () => 0,
  getTweetAuthor: (t: { author?: { username?: string } }) => t.author?.username ?? "unknown",
  getTweetUrl: (t: { id?: string; author?: { username?: string } }) =>
    `https://x.com/${t.author?.username}/status/${t.id}`,
  isReplyTweet: () => false,
}));
vi.mock("@/lib/replies/ai", () => ({
  generateAiReplyDraftsWithProvider: (...args: unknown[]) => h.generate(...args),
}));
vi.mock("@/lib/replies/duplicate-guard", () => ({
  claimReplySlot: vi.fn(),
  filterUntriedReplyDrafts: (d: string[]) => d,
  isDuplicateReplyError: () => false,
  markReplySlotFailed: vi.fn(),
  markReplySlotSent: vi.fn(),
  normalizeReplyText: (s: string) => s,
}));
vi.mock("@/lib/replies/transport", () => ({ sendReplyViaPlatform: vi.fn() }));

import { REPLY_ENGINE_DISCOVERY_QUERIES } from "@/lib/replies/strategy";
import { parseReplyEngineConfig, runReplyEngineJob } from "./reply-engine.ts";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const tweet = (id: string, author: string, ageMin = 5) => ({
  id,
  text: `tweet ${id} about agents`,
  createdAt: minutesAgo(ageMin),
  author: { username: author, followersCount: 10 },
});
const schedule = (config: unknown) =>
  ({ id: "s1", workspaceId: "w1", targetPlatformIds: ["p1"], config }) as never;

async function dryRunAuthors(config: unknown = { dryRun: true }) {
  await runReplyEngineJob(schedule(config), "manual");
  const final = h.updates.at(-1)!;
  const steps = final.steps as Array<{ name: string; output?: { candidates?: Array<{ author: string }> } }>;
  const discover = steps.find((s) => s.name === "reply:discover");
  return { final, discover, steps };
}

beforeEach(() => {
  h.updates.length = 0;
  h.mentions = [];
  h.home = [];
  h.search = [];
  h.searchQueries = [];
  h.homeCalls = 0;
  h.generate.mockReset();
  h.generate.mockImplementation(async (cands: Array<{ tweetId: string }>) => ({
    provider: "claude-cli",
    drafts: new Map(cands.map((c) => [c.tweetId, ["a concrete draft about the failure mode here"]])),
  }));
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("parseReplyEngineConfig", () => {
  it("defaults, parses strings, ignores junk", () => {
    const d = parseReplyEngineConfig(null);
    expect(d.maxTweetAgeMinutes).toBe(180);
    expect(d.engagementOnly).toBe(false);
    expect(d.searchQueries).toEqual(REPLY_ENGINE_DISCOVERY_QUERIES.map((q) => q.query));
    expect(d.searchQueries).toEqual([
      "claude code", "codex cli", "ai coding agent", "agent evals", "llm agents production", "mcp server",
    ]);
    expect(REPLY_ENGINE_DISCOVERY_QUERIES.every((q) => q.direction === "dev")).toBe(true);

    const c = parseReplyEngineConfig(
      '{"dryRun":true,"maxTweetAgeMinutes":60,"searchQueries":["a"," ",1,"b"],"engagementOnly":true}'
    );
    expect(c).toEqual({ dryRun: true, maxTweetAgeMinutes: 60, searchQueries: ["a", "b"], engagementOnly: true });

    const bad = parseReplyEngineConfig({ maxTweetAgeMinutes: "x", searchQueries: [], engagementOnly: "true" });
    expect(bad.maxTweetAgeMinutes).toBe(180);
    expect(bad.engagementOnly).toBe(false);
    expect(bad.searchQueries.length).toBe(6);
    expect(parseReplyEngineConfig("not json").dryRun).toBe(false);
  });
});

describe("reply engine discovery", () => {
  it("falls through mentions -> home timeline -> search until 5 candidates", async () => {
    h.mentions = [tweet("m1", "alice")];
    h.home = [tweet("h1", "ClaudeDevs"), tweet("h2", "cline")];
    h.search = [tweet("s1", "bob"), tweet("s2", "carol"), tweet("s3", "dan")];
    const { discover } = await dryRunAuthors();
    expect(h.homeCalls).toBe(1);
    expect(h.searchQueries[0]).toBe("claude code");
    expect(discover!.output).toMatchObject({ count: 3 }); // burstSize caps ranked output
    expect(h.generate.mock.calls[0][0].map((c: { author: string }) => c.author).sort()).toEqual(
      ["ClaudeDevs", "alice", "cline"].sort()
    );
  });

  it("stops after mentions plus home when they already give 5", async () => {
    h.mentions = [tweet("m1", "a1")];
    h.home = ["b1", "b2", "b3", "b4"].map((n, i) => tweet(`h${i}`, n));
    await dryRunAuthors();
    expect(h.homeCalls).toBe(1);
    expect(h.searchQueries).toEqual([]);
  });

  it("does not call home or search when mentions already give 5", async () => {
    h.mentions = ["a", "b", "c", "d", "e"].map((n) => tweet(`m${n}`, n));
    await dryRunAuthors();
    expect(h.homeCalls).toBe(0);
    expect(h.searchQueries).toEqual([]);
  });

  it("searches when mentions and home are empty, using config.searchQueries", async () => {
    h.search = [tweet("s1", "bob")];
    await dryRunAuthors({ dryRun: true, searchQueries: ["my custom query"] });
    expect(h.searchQueries).toEqual(["my custom query"]);
  });

  it("skips the owner's own tweets case-insensitively", async () => {
    h.home = [tweet("h1", "maxpetrusenko"), tweet("h2", "MAXPETRUSENKO"), tweet("h3", "opencode")];
    await dryRunAuthors();
    const sent = h.generate.mock.calls[0][0].map((c: { author: string }) => c.author);
    expect(sent).toEqual(["opencode"]);
  });

  it("skips non-English posts so English replies never land on them", async () => {
    h.home = [
      { ...tweet("c1", "swordbluesy"), text: "我把《Claude Code 官方文档 Overview》编译成中文了，这是第1/2部分 claude code agentic" },
      { ...tweet("s1", "someone"), text: "estamos probando los agentes de codigo para el equipo esta semana" },
      tweet("e1", "opencode"),
    ];
    await dryRunAuthors();
    const sent = h.generate.mock.calls[0][0].map((c: { author: string }) => c.author);
    expect(sent).toEqual(["opencode"]);
  });

  it("dedupes the same tweet across sources", async () => {
    h.mentions = [tweet("x1", "alice")];
    h.home = [tweet("x1", "alice")];
    await dryRunAuthors();
    expect(h.generate.mock.calls[0][0]).toHaveLength(1);
  });
});

describe("freshness window", () => {
  it("defaults to 180 minutes", async () => {
    h.home = [tweet("old", "a", 240), tweet("ok", "b", 120)];
    await dryRunAuthors();
    expect(h.generate.mock.calls[0][0].map((c: { author: string }) => c.author)).toEqual(["b"]);
  });

  it("config.maxTweetAgeMinutes overrides it", async () => {
    h.home = [tweet("a", "a", 45), tweet("b", "b", 10)];
    await dryRunAuthors({ dryRun: true, maxTweetAgeMinutes: 30 });
    expect(h.generate.mock.calls[0][0].map((c: { author: string }) => c.author)).toEqual(["b"]);
    h.generate.mockClear();
    h.updates.length = 0;
    await dryRunAuthors({ dryRun: true, maxTweetAgeMinutes: 600 });
    expect(h.generate.mock.calls[0][0]).toHaveLength(2);
  });
});

describe("engagementOnly flag", () => {
  it("is passed to the draft generator only when config.engagementOnly === true", async () => {
    h.home = [tweet("h1", "kimmonismus")];
    await dryRunAuthors({ dryRun: true, engagementOnly: true });
    expect(h.generate.mock.calls[0][3]).toEqual({ engagementOnly: true });
    h.generate.mockClear();
    h.updates.length = 0;
    await dryRunAuthors({ dryRun: true });
    expect(h.generate.mock.calls[0][3]).toEqual({ engagementOnly: false });
  });
});
