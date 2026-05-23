import { describe, expect, it } from "vitest";

import {
  buildXLikedDedupKey,
  buildXLikedPostContent,
  buildXLikedSourceUrl,
  cleanXLikedText,
  getXLikedAutopostSkipReason,
  pickXLikedMedia,
} from "../x-liked-autopost-format.ts";

describe("X liked autopost formatting", () => {
  it("quotes the original author and source without speaking as Max", () => {
    const content = buildXLikedPostContent({
      authorHandle: "@founder",
      sourceUrl: "https://x.com/founder/status/123",
      sourceText: "Shipping notes from the repo.",
    });

    expect(content).toMatch(/^From @founder:/);
    expect(content).toMatch(/> Shipping notes from the repo\./);
    expect(content).not.toMatch(/I discovered/);
    expect(content).not.toMatch(/Credit:/);
    expect(content).toMatch(/Source: https:\/\/x\.com\/founder\/status\/123/);
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
});
