import { describe, expect, it } from "vitest";

import {
  buildXLikedDedupKey,
  buildXLikedPostContent,
  buildXLikedSourceUrl,
  cleanXLikedText,
  getXLikedAutopostSkipReason,
  getXLikedPostAngle,
  pickXLikedMedia,
} from "../x-liked-autopost-format.ts";

describe("X liked autopost formatting", () => {
  it("builds Max-owned commentary instead of copying the original post", () => {
    const content = buildXLikedPostContent({
      authorHandle: "@founder",
      sourceUrl: "https://x.com/founder/status/123",
      sourceText:
        "I am on the $200 Claude, $100 Codex, $20 Cursor plan and need to rethink the whole subscription stack.",
    });

    expect(content).toMatch(/^The useful signal is model choice/);
    expect(content).not.toMatch(/I discovered/);
    expect(content).not.toMatch(/Credit:/);
    expect(content).not.toMatch(/I am on the \$200 Claude/);
    expect(content).toMatch(/Source: @founder https:\/\/x\.com\/founder\/status\/123/);
  });

  it("decodes entities and removes trailing t.co media URLs when media is copied", () => {
    expect(cleanXLikedText("UI &amp; Copy")).toBe("UI & Copy");
    expect(cleanXLikedText("Post text\n\nhttps://t.co/abc123", { hasMedia: true })).toBe("Post text");
    expect(cleanXLikedText("Post text\n\nhttps://example.com/article", { hasMedia: true })).toBe(
      "Post text\n\nhttps://example.com/article"
    );
  });

  it("prefers video URLs and then quoted media", () => {
    expect(
      pickXLikedMedia({
        id: "1",
        media: [{ type: "video", url: "https://img.example/post.jpg", videoUrl: "https://cdn.example/post.mp4" }],
      })
    ).toEqual({ url: "https://cdn.example/post.mp4", mediaType: "video" });

    expect(
      pickXLikedMedia({
        id: "2",
        quotedTweet: {
          id: "3",
          media: [{ type: "photo", url: "https://img.example/quoted.jpg" }],
        },
      })
    ).toEqual({ url: "https://img.example/quoted.jpg", mediaType: "image" });
  });

  it("builds stable source URL and dedupe key", () => {
    const tweet = { id: "123", author: { username: "founder" } };
    expect(buildXLikedSourceUrl(tweet)).toBe("https://x.com/founder/status/123");
    expect(buildXLikedDedupKey(tweet)).toBe("x-like:123");
  });

  it("skips liked posts that should not publish from Max's accounts", () => {
    expect(
      getXLikedAutopostSkipReason({
        sourceText: "Free time as a man is a meme. Fucking Peter Pan ass.",
      })
    ).toBe("profanity");
    expect(
      getXLikedAutopostSkipReason({
        sourceText: "NEW: U.S. green card applicants must leave the country.",
      })
    ).toBe("politics/news");
    expect(
      getXLikedAutopostSkipReason({
        sourceText:
          "Many of the best researchers at OpenAI, Anthropic, Google, Meta and other frontier labs are not U.S. citizens. They are in the U.S. on temporary visas while building critical AI systems.",
      })
    ).toBeNull();
    expect(
      getXLikedAutopostSkipReason({
        sourceText:
          "OpenAI researchers are building frontier AI systems while Congress and the White House turn this into an election fight.",
      })
    ).toBe("high controversy");
    expect(
      getXLikedAutopostSkipReason({
        sourceText: "Starlink should be mandatory on every plane.",
      })
    ).toBe("too short/low context");
    expect(
      getXLikedAutopostSkipReason({
        sourceText: "Is Composer 2.5 really that good at coding? Anyone tried it yet?",
      })
    ).toBe("too short/low context");
    expect(
      getXLikedAutopostSkipReason({
        sourceText:
          "I trained a small LLM on an A100 GPU overnight, then used Codex to automate the notebook and evaluation loop for a custom coding model.",
      })
    ).toBeNull();
  });

  it("selects reusable commentary angles", () => {
    expect(getXLikedPostAngle("Training a 9B LLM on A100 overnight with evals.").label).toBe(
      "small model workflow"
    );
    expect(getXLikedPostAngle("Codex as orchestrator and DeepSeek as executor.").label).toBe(
      "agent workflow"
    );
    expect(getXLikedPostAngle("The $20 plan changes the cost per coding task.").label).toBe(
      "model economics"
    );
  });

  it("turns a liked GitHub repo post into a bookmark-worthy repo share", () => {
    const content = buildXLikedPostContent({
      authorHandle: "@dr_cintas",
      sourceUrl: "https://x.com/dr_cintas/status/2057875643300511944",
      sourceText:
        "FreeLLMAPI is an open-source proxy. Each provider's free tier is a toy on its own. Stacked together they add up to ~800M tokens a month. Drop-in OpenAI endpoint, just swap base_url. Auto failover when a provider hits its rate limit.",
    });

    expect(content).toBe(
      [
        "Save this if you prototype with LLM APIs.",
        "",
        "FreeLLMAPI gives you one OpenAI-compatible endpoint across multiple provider free tiers, with failover and per-key rate tracking.",
        "",
        "Useful when experiments need to keep running before paid infra makes sense.",
        "",
        "https://github.com/tashfeenahmed/freellmapi",
      ].join("\n")
    );
  });

  it("turns an AI talent policy post into emotion-first commentary", () => {
    const content = buildXLikedPostContent({
      authorHandle: "@kimmonismus",
      sourceUrl: "https://x.com/kimmonismus/status/2058211601753505951",
      sourceText:
        "Many of the best researchers at OpenAI, Anthropic, Google, Meta and other frontier labs are not U.S. citizens. They are in the U.S. on temporary visas while building the very systems Washington increasingly describes as critical to national security. Forcing them to leave the country to apply for a Green Card adds uncertainty, delays and risk.",
    });

    expect(content).toBe(
      [
        "This is one of those AI stories that feels quietly sad.",
        "",
        "Some of the people building the most important systems in the world are also living with visa uncertainty in the background.",
        "",
        "It is strange to watch the future get built by people who still have to ask whether they can stay.",
      ].join("\n")
    );
    expect(content).not.toMatch(/Source:/);
  });
});
