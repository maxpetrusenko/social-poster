import { describe, expect, it } from "vitest";

import { buildXLikedPlatformPostContent } from "../x-liked-autopost-format.ts";

describe("X liked post link-in-reply", () => {
  it("moves source URL to first reply when X post has image media and URL in content", () => {
    const sourceUrl = "https://x.com/HowToPrompt__/status/2113248744905064464";
    const sourceText = "Researchers mathematically proved that AI will cause the Tragedy of the Cognitive Commons.";
    const result = buildXLikedPlatformPostContent({
      baseContent: `researchers proved ai causes cognitive commons tragedy.\n\n${sourceUrl}`,
      platformType: "x",
      media: { url: "https://pbs.twimg.com/media/HVPEb9Wb0AE1DiE.jpg", mediaType: "image" },
      sourceUrl,
      authorHandle: "@HowToPrompt__",
      sourceText,
    });

    expect(result.mainContent).toBe("researchers proved ai causes cognitive commons tragedy.");
    expect(result.firstComment).toBe(`source: ${sourceUrl}`);
  });

  it("keeps source URL in main post when no media (text-only)", () => {
    const sourceUrl = "https://x.com/founder/status/123";
    const result = buildXLikedPlatformPostContent({
      baseContent: `interesting point.\n\n${sourceUrl}`,
      platformType: "x",
      media: null,
      sourceUrl,
    });

    expect(result.mainContent).toBe(`interesting point.\n\n${sourceUrl}`);
    expect(result.firstComment).toBeUndefined();
  });

  it("keeps source URL in main post when media is video (videos embed URL)", () => {
    const sourceUrl = "https://x.com/founder/status/123";
    const result = buildXLikedPlatformPostContent({
      baseContent: "automation shifts.",
      platformType: "x",
      media: { url: "https://cdn.example/video.mp4", mediaType: "video" },
      sourceUrl,
    });

    // Video posts embed source URL in body (existing behavior)
    expect(result.mainContent).toContain(sourceUrl);
    expect(result.firstComment).toBeUndefined();
  });

  it("does not move URL to reply when URL is not the source URL", () => {
    const result = buildXLikedPlatformPostContent({
      baseContent: "check this out: https://example.com/article",
      platformType: "x",
      media: { url: "https://pbs.twimg.com/media/test.jpg", mediaType: "image" },
      sourceUrl: "https://x.com/founder/status/123",
    });

    expect(result.mainContent).toBe("check this out: https://example.com/article");
    expect(result.firstComment).toBeUndefined();
  });

  it("keeps link in LinkedIn body (no first comment support)", () => {
    const sourceUrl = "https://x.com/founder/status/123";
    const result = buildXLikedPlatformPostContent({
      baseContent: `interesting insight.\n\n${sourceUrl}`,
      platformType: "linkedin_personal",
      media: { url: "https://cdn.example/image.jpg", mediaType: "image" },
      sourceUrl,
    });

    expect(result.mainContent).toBe(`interesting insight.\n\n${sourceUrl}`);
    expect(result.firstComment).toBeUndefined();
  });

  it("handles content without source URL gracefully", () => {
    const result = buildXLikedPlatformPostContent({
      baseContent: "clean post with no links.",
      platformType: "x",
      media: { url: "https://pbs.twimg.com/media/test.jpg", mediaType: "image" },
      sourceUrl: "https://x.com/founder/status/123",
    });

    expect(result.mainContent).toBe("clean post with no links.");
    expect(result.firstComment).toBeUndefined();
  });
});
