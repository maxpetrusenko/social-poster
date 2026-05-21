import { describe, expect, it } from "vitest";

import {
  buildXLikedDedupKey,
  buildXLikedPostContent,
  buildXLikedSourceUrl,
  cleanXLikedText,
  pickXLikedMedia,
} from "../x-liked-autopost-format.ts";

describe("X liked autopost formatting", () => {
  it("credits the original author and source", () => {
    const content = buildXLikedPostContent({
      authorHandle: "@founder",
      sourceUrl: "https://x.com/founder/status/123",
      sourceText: "Shipping notes from the repo.",
    });

    expect(content).toMatch(/^I discovered this from @founder:/);
    expect(content).toMatch(/Shipping notes from the repo\./);
    expect(content).toMatch(/Credit: @founder/);
    expect(content).toMatch(/Source: https:\/\/x\.com\/founder\/status\/123/);
  });

  it("removes trailing t.co media URLs when media is copied", () => {
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
});
