import { describe, expect, it } from "vitest";

import { buildXLikedPlatformPostContent } from "../x-liked-autopost-format.ts";

describe("X liked post similarity-based link inclusion", () => {
  it("skips source link when repost is almost identical to source", () => {
    const sourceUrl = "https://x.com/founder/status/123";
    const sourceText = "AI just made the answer key free.";
    const repost = "AI just made the answer key free"; // Almost identical (just punctuation)

    const result = buildXLikedPlatformPostContent({
      baseContent: repost,
      platformType: "x",
      media: { url: "https://pbs.twimg.com/media/test.jpg", mediaType: "image" },
      sourceUrl,
      sourceText,
    });

    // No source link because texts are too similar
    expect(result.mainContent).toBe(repost);
    expect(result.firstComment).toBeUndefined();
  });

  it("includes source link when repost meaningfully differs from source", () => {
    const sourceUrl = "https://x.com/founder/status/123";
    const sourceText = "I shipped a 0.7nm chip compiler in 48 hours using Claude and it's running on 10k servers.";
    const repost = `compiler automation advanced using claude. ${sourceUrl}`; // Meaningfully different

    const result = buildXLikedPlatformPostContent({
      baseContent: repost,
      platformType: "x",
      media: { url: "https://pbs.twimg.com/media/test.jpg", mediaType: "image" },
      sourceUrl,
      sourceText,
    });

    // Source link included because texts differ meaningfully
    expect(result.mainContent).toBe("compiler automation advanced using claude.");
    expect(result.firstComment).toBe(`source: ${sourceUrl}`);
  });

  it("skips source link when minor rewording keeps high similarity", () => {
    const sourceUrl = "https://x.com/researcher/status/456";
    const sourceText = "AI agents are transforming software development faster than expected.";
    const repost = "AI agents are transforming software development more quickly than expected"; // Minor rewording

    const result = buildXLikedPlatformPostContent({
      baseContent: `${repost} ${sourceUrl}`,
      platformType: "x",
      media: { url: "https://pbs.twimg.com/media/img.jpg", mediaType: "image" },
      sourceUrl,
      sourceText,
    });

    // No source link because similarity is high (most words shared)
    expect(result.mainContent).toBe(`${repost} ${sourceUrl}`);
    expect(result.firstComment).toBeUndefined();
  });

  it("includes source link for substantially rewritten content", () => {
    const sourceUrl = "https://x.com/author/status/789";
    const sourceText = `Researchers proved that AI will cause the Tragedy of the Cognitive Commons.
Every industry relies on shared expertise.
Junior employees build mastery through struggle.
But AI is annihilating junior-level work.`;
    
    const repost = `ai threatens professional expertise pipelines by eliminating entry-level learning paths. ${sourceUrl}`;

    const result = buildXLikedPlatformPostContent({
      baseContent: repost,
      platformType: "x",
      media: { url: "https://pbs.twimg.com/media/photo.jpg", mediaType: "image" },
      sourceUrl,
      sourceText,
    });

    // Source link included because content is substantially rewritten
    expect(result.mainContent).toBe("ai threatens professional expertise pipelines by eliminating entry-level learning paths.");
    expect(result.firstComment).toBe(`source: ${sourceUrl}`);
  });

  it("handles missing sourceText gracefully (always includes link)", () => {
    const sourceUrl = "https://x.com/founder/status/999";
    const repost = `interesting insight. ${sourceUrl}`;

    const result = buildXLikedPlatformPostContent({
      baseContent: repost,
      platformType: "x",
      media: { url: "https://pbs.twimg.com/media/test.jpg", mediaType: "image" },
      sourceUrl,
      // sourceText not provided
    });

    // Source link included (can't check similarity without sourceText)
    expect(result.mainContent).toBe("interesting insight.");
    expect(result.firstComment).toBe(`source: ${sourceUrl}`);
  });

  it("does not affect LinkedIn posts (no similarity check)", () => {
    const sourceUrl = "https://x.com/founder/status/123";
    const sourceText = "AI just made the answer key free.";
    const repost = `AI just made the answer key free\n\n${sourceUrl}`; // Almost identical

    const result = buildXLikedPlatformPostContent({
      baseContent: repost,
      platformType: "linkedin_personal",
      media: { url: "https://cdn.example/image.jpg", mediaType: "image" },
      sourceUrl,
      sourceText,
    });

    // LinkedIn keeps URL in body regardless of similarity
    expect(result.mainContent).toBe(repost);
    expect(result.firstComment).toBeUndefined();
  });

  it("does not affect X video posts (embed behavior unchanged)", () => {
    const sourceUrl = "https://x.com/founder/status/123";
    const sourceText = "Blue-collar automation will arrive unevenly.";
    const repost = "Blue-collar automation will arrive unevenly"; // Almost identical

    const result = buildXLikedPlatformPostContent({
      baseContent: repost,
      platformType: "x",
      media: { url: "https://cdn.example/video.mp4", mediaType: "video", sourceUrl },
      sourceUrl,
      sourceText,
    });

    // Video posts embed URL in body (no similarity check)
    expect(result.mainContent).toContain(sourceUrl);
    expect(result.firstComment).toBeUndefined();
  });
});
