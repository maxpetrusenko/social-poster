import { describe, expect, it } from "vitest";

import {
  buildXLikedDedupKey,
  buildXLikedPlatformPostContent,
  buildXLikedPostContent,
  buildXLikedSourceComment,
  buildXLikedSourceUrl,
  cleanXLikedText,
  getXLikedExternalUrls,
  getXLikedAutopostSkipReason,
  getXLikedPostAngle,
  pickXLikedMedia,
  resolveXLikedPlatformMedia,
} from "../x-liked-autopost-format.ts";

describe("X liked autopost formatting", () => {
  it("builds Max-owned commentary instead of copying the original post", () => {
    const content = buildXLikedPostContent({
      authorHandle: "@founder",
      sourceUrl: "https://x.com/founder/status/123",
      sourceText:
        "I am on the $200 Claude, $100 Codex, $20 Cursor plan and need to rethink the whole subscription stack.",
    });

    expect(content).toMatch(/^Model choice is becoming an architecture decision/);
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

  it("uploads liked videos to LinkedIn while letting X embed the source URL", () => {
    const video = { url: "https://cdn.example/post.mp4", mediaType: "video" as const };

    expect(resolveXLikedPlatformMedia("twitter", video)).toBeNull();
    expect(resolveXLikedPlatformMedia("x", video)).toBeNull();
    expect(resolveXLikedPlatformMedia("linkedin_personal", video)).toEqual(video);
    expect(
      buildXLikedPlatformPostContent({
        baseContent: "Blue-collar automation will arrive unevenly.",
        platformType: "x",
        media: video,
        sourceUrl: "https://x.com/kimmonismus/status/2058254144855544092",
      })
    ).toBe(
      [
        "Blue-collar automation will arrive unevenly.",
        "",
        "https://x.com/kimmonismus/status/2058254144855544092",
      ].join("\n")
    );
    expect(
      buildXLikedPlatformPostContent({
        baseContent: "Blue-collar automation will arrive unevenly.",
        platformType: "linkedin_personal",
        media: video,
        sourceUrl: "https://x.com/kimmonismus/status/2058254144855544092",
        authorHandle: "@kimmonismus",
      })
    ).toBe(["Blue-collar automation will arrive unevenly.", "", "via @kimmonismus"].join("\n"));
    expect(
      buildXLikedPlatformPostContent({
        baseContent: "Save this repo.",
        platformType: "x",
        media: { url: "https://cdn.example/post.jpg", mediaType: "image" },
        sourceUrl: "https://x.com/founder/status/123",
        authorHandle: "@founder",
      })
    ).toBe(["Save this repo.", "", "via @founder"].join("\n"));
  });

  it("builds stable source URL and dedupe key", () => {
    const tweet = { id: "123", author: { username: "founder" } };
    expect(buildXLikedSourceUrl(tweet)).toBe("https://x.com/founder/status/123");
    expect(buildXLikedDedupKey(tweet)).toBe("x-like:123");
  });

  it("extracts external preview links from tweet URL entities and known repo signals", () => {
    expect(
      getXLikedExternalUrls({
        sourceText: "FreeLLMAPI is an open-source proxy.",
      })
    ).toEqual(["https://github.com/tashfeenahmed/freellmapi"]);

    expect(
      getXLikedExternalUrls({
        sourceText: "Launching today https://t.co/short",
        tweet: {
          id: "123",
          _raw: {
            legacy: {
              entities: {
                urls: [
                  {
                    url: "https://t.co/short",
                    expanded_url: "https://openai.com/index/agent-workflow/",
                  },
                ],
              },
            },
          },
        },
      })
    ).toEqual(["https://openai.com/index/agent-workflow/", "https://t.co/short"]);
  });

  it("treats likes as publish intent with only hard safety skips", () => {
    expect(
      getXLikedAutopostSkipReason({
        sourceText: "Free time as a man is a meme. Fucking Peter Pan ass.",
      })
    ).toBe("profanity");
    expect(
      getXLikedAutopostSkipReason({
        sourceText: "NEW: U.S. green card applicants must leave the country.",
      })
    ).toBeNull();
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
    ).toBeNull();
    expect(
      getXLikedAutopostSkipReason({
        sourceText: "Is Composer 2.5 really that good at coding? Anyone tried it yet?",
      })
    ).toBeNull();
    expect(
      getXLikedAutopostSkipReason({
        sourceText:
          "I trained a small LLM on an A100 GPU overnight, then used Codex to automate the notebook and evaluation loop for a custom coding model.",
      })
    ).toBeNull();
    expect(
      getXLikedAutopostSkipReason({
        sourceText:
          "We launched a new OpenAI agent workflow today. Try it now and see how it changes coding loops inside ChatGPT.",
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

  it("credits the source when the liked post is a video share lane", () => {
    const content = buildXLikedPostContent({
      authorHandle: "@atomic_chat_hq",
      sourceUrl: "https://x.com/atomic_chat_hq/status/2057581603811901882",
      sourceText: [
        "Qwen 3.7-max beats Opus 4.7 and GPT-5.5",
        "",
        "We tested three frontier models on a real agentic task: write a Tetris bot that plays the game and trains itself.",
        "",
        "Qwen 3.7-Max: training cost $1.32, bot improvement +56%",
        "Claude Opus 4.7: training cost $12.15, bot improvement +28%",
        "GPT-5.5: training cost $2.85, bot improvement +7%",
      ].join("\n"),
    });

    expect(content).toBe(
      [
        "Agent-loop economics matters here: quality, cost per run, and iteration count.",
        "",
        "In a 10-iteration Tetris bot loop:",
        "Qwen 3.7-Max: training cost $1.32, bot improvement +56%",
        "Claude Opus 4.7: training cost $12.15, bot improvement +28%",
        "GPT-5.5: training cost $2.85, bot improvement +7%",
        "",
        "Long loops make cost per attempt matter as much as peak intelligence.",
        "",
        "Source: @atomic_chat_hq https://x.com/atomic_chat_hq/status/2057581603811901882",
      ].join("\n")
    );
  });

  it("turns blue-collar robot demos into physical automation economics", () => {
    const sourceText = [
      "How on earth do people still assume blue-collar work is safe from automation?",
      "",
      "A robot can work 200 hours nonstop.",
      "A human works around 40 hours a week, needs weekends, sleep, breaks, sick days, and vacations.",
      "",
      "That changes the economics completely.",
    ].join("\n");
    const content = buildXLikedPostContent({
      authorHandle: "@kimmonismus",
      sourceUrl: "https://x.com/kimmonismus/status/2058254144855544092",
      sourceText,
      includeSource: false,
    });

    expect(getXLikedPostAngle(sourceText).label).toBe("physical automation economics");
    expect(content).toBe(
      [
        "Blue-collar automation will arrive unevenly.",
        "",
        "The first jobs to watch have four traits:",
        "controlled environment",
        "repetitive motion",
        "high labor shortage",
        "expensive downtime",
        "",
        "That is where the 200-hour robot vs 40-hour human comparison becomes brutal.",
        "",
        "The easiest slices of the work become economically irrational to keep manual first.",
      ].join("\n")
    );
  });

  it("can keep source attribution in a reply/comment instead of the main post", () => {
    const content = buildXLikedPostContent({
      authorHandle: "@atomic_chat_hq",
      sourceUrl: "https://x.com/atomic_chat_hq/status/2057581603811901882",
      sourceText: [
        "Qwen 3.7-max beats Opus 4.7 and GPT-5.5",
        "",
        "Qwen 3.7-Max: training cost $1.32, bot improvement +56%",
        "Claude Opus 4.7: training cost $12.15, bot improvement +28%",
        "GPT-5.5: training cost $2.85, bot improvement +7%",
      ].join("\n"),
      includeSource: false,
    });

    expect(content).toContain("Qwen 3.7-Max: training cost $1.32, bot improvement +56%");
    expect(content).not.toMatch(/Source:/);
    expect(
      buildXLikedSourceComment({
        authorHandle: "@atomic_chat_hq",
        sourceUrl: "https://x.com/atomic_chat_hq/status/2057581603811901882",
      })
    ).toBe(
      "Source: @atomic_chat_hq https://x.com/atomic_chat_hq/status/2057581603811901882"
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
        "Some of the people building the most important systems in the world are also living with visa uncertainty in the background.",
        "",
        "That tension is hard to ignore.",
        "",
        "The future gets built by people who still have to ask whether they can stay.",
      ].join("\n")
    );
    expect(content).not.toMatch(/\bsad\b/i);
    expect(content).not.toMatch(/Source:/);
  });

  it("keeps source-owned launches attributed to the original account", () => {
    const content = buildXLikedPostContent({
      authorHandle: "@OpenAI",
      sourceUrl: "https://x.com/OpenAI/status/123",
      sourceText:
        "We launched a new agent workflow today. Try it now and see how it changes coding loops inside ChatGPT.",
    });

    expect(content).toBe(
      [
        "@OpenAI launched this.",
        "",
        "Looks worth testing inside a real workflow. Strong take after hands-on time.",
        "",
        "Source: @OpenAI https://x.com/OpenAI/status/123",
      ].join("\n")
    );
    expect(content).not.toMatch(/\bwe launched\b/i);
    expect(content).not.toMatch(/\bI launched\b/i);
    expect(content).not.toMatch(/\bI tried\b/i);
    expect(content).not.toMatch(/\bwe tried\b/i);
  });
});
