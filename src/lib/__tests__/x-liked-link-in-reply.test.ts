import { describe, expect, it } from "vitest";

import { buildXLikedPlatformPostContent } from "../x-liked-autopost-format.ts";

describe("X liked post link-in-reply", () => {
  it("Fix #2: appends source URL as first reply for X image posts when similarity <= 0.75", () => {
    const sourceUrl = "https://x.com/HowToPrompt__/status/2113248744905064464";
    const sourceText = "Researchers mathematically proved that AI will cause the Tragedy of the Cognitive Commons.";
    const result = buildXLikedPlatformPostContent({
      baseContent: "researchers proved ai causes cognitive commons tragedy", // No URL in content
      platformType: "x",
      media: { url: "https://pbs.twimg.com/media/HVPEb9Wb0AE1DiE.jpg", mediaType: "image" },
      sourceUrl,
      authorHandle: "@HowToPrompt__",
      sourceText,
    });

    // Code should append source link automatically (not writer-dependent)
    expect(result.mainContent).toBe("researchers proved ai causes cognitive commons tragedy");
    expect(result.firstComment).toBe(`source: ${sourceUrl}`);
  });

  it("Fix #2: appends source URL as first reply for X text-only posts when similarity <= 0.75", () => {
    const sourceUrl = "https://x.com/founder/status/123";
    const sourceText = "this is an interesting point about technology and progress";
    const result = buildXLikedPlatformPostContent({
      baseContent: "interesting point about tech progress",
      platformType: "x",
      media: null,
      sourceUrl,
      sourceText,
    });

    // Text-only posts also get link in first reply when similarity <= 0.75
    expect(result.mainContent).toBe("interesting point about tech progress");
    expect(result.firstComment).toBe(`source: ${sourceUrl}`);
  });

  it("Fix #2: video posts embed source URL in body (keep current behavior)", () => {
    const sourceUrl = "https://x.com/founder/status/123";
    const sourceText = "automation shifts are happening fast in the industry";
    const result = buildXLikedPlatformPostContent({
      baseContent: "automation shifts",
      platformType: "x",
      media: { url: "https://cdn.example/video.mp4", mediaType: "video" },
      sourceUrl,
      sourceText,
    });

    // Video posts embed source URL in body (existing behavior preserved)
    expect(result.mainContent).toContain("automation shifts");
    expect(result.mainContent).toContain(sourceUrl);
    expect(result.firstComment).toBeUndefined();
  });

  it("Fix #2: appends source link even when content has other URLs", () => {
    const sourceUrl = "https://x.com/founder/status/123";
    const sourceText = "check this out: https://example.com/article with more details";
    const result = buildXLikedPlatformPostContent({
      baseContent: "check this out: https://example.com/article",
      platformType: "x",
      media: { url: "https://pbs.twimg.com/media/test.jpg", mediaType: "image" },
      sourceUrl,
      sourceText,
    });

    expect(result.mainContent).toBe("check this out: https://example.com/article");
    expect(result.firstComment).toBe(`source: ${sourceUrl}`);
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

  it("Fix #2: appends source link when content has no URLs", () => {
    const sourceUrl = "https://x.com/founder/status/123";
    const sourceText = "clean post with no links but meaningful content";
    const result = buildXLikedPlatformPostContent({
      baseContent: "clean post with no links",
      platformType: "x",
      media: { url: "https://pbs.twimg.com/media/test.jpg", mediaType: "image" },
      sourceUrl,
      sourceText,
    });

    expect(result.mainContent).toBe("clean post with no links");
    expect(result.firstComment).toBe(`source: ${sourceUrl}`);
  });
  
  it("Fix #2: skips source link when similarity > 0.75 (too similar)", () => {
    const sourceUrl = "https://x.com/founder/status/123";
    const sourceText = "the quick brown fox jumps over the lazy dog";
    const result = buildXLikedPlatformPostContent({
      baseContent: "the quick brown fox jumps over the lazy dog", // Nearly identical
      platformType: "x",
      media: { url: "https://pbs.twimg.com/media/test.jpg", mediaType: "image" },
      sourceUrl,
      sourceText,
    });

    // Too similar - no source link needed
    expect(result.mainContent).toBe("the quick brown fox jumps over the lazy dog");
    expect(result.firstComment).toBeUndefined();
  });
});
