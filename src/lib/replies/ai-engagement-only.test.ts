import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildReplyDraftPrompt } from "@/lib/replies/ai";

const candidates = [
  {
    tweetId: "1",
    author: "ClaudeDevs",
    text: "Shipping subagents in Claude Code today",
    tags: ["following", "dev"],
    direction: "dev" as const,
    likes: 0,
    views: "0",
    contextLabel: "Posted by an account Max follows",
  },
];

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

describe("buildReplyDraftPrompt engagementOnly", () => {
  it("is byte-identical to the pre-flag prompt when the flag is unset or false", () => {
    const base = buildReplyDraftPrompt(candidates, "primary");
    expect(sha(base)).toBe("dd657bbc2fa5c3afa5c2542ac46342c8899580a3e18afdc423e7765d47933af1");
    expect(buildReplyDraftPrompt(candidates, "primary", {})).toBe(base);
    expect(buildReplyDraftPrompt(candidates, "primary", { engagementOnly: false })).toBe(base);
    expect(sha(buildReplyDraftPrompt(candidates, "fallback"))).toBe("3c54c99e7680c67f44307bf6a35d26eb54c13527af0f7dff68636df33d0cda1e");
  });

  it("adds the rule and drops product/github pitch lines when engagementOnly", () => {
    const base = buildReplyDraftPrompt(candidates, "primary");
    const prompt = buildReplyDraftPrompt(candidates, "primary", { engagementOnly: true });
    expect(prompt).toContain("- engagement only: no product, URL, or repo mentions");
    expect(prompt).not.toContain("  - product:");
    expect(prompt).not.toContain("  - github:");
    expect(base).toContain("  - product:");
    expect(base).toContain("  - github:");
  });
});
