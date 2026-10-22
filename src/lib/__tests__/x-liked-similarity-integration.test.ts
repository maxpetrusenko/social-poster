import { describe, expect, it } from "vitest";

import { buildXLikedPlatformPostContent } from "../x-liked-autopost-format.ts";

describe("X liked post artifact-based first-reply logic", () => {
  it("adds first reply when post references arxiv paper", () => {
    const sourceUrl = "https://x.com/researcher/status/123";
    const sourceText = "Our new paper on AI safety: https://arxiv.org/abs/2024.12345";
    const paperUrl = "https://arxiv.org/abs/2024.12345";
    const repost = "new paper on ai safety";

    const result = buildXLikedPlatformPostContent({
      baseContent: repost,
      platformType: "x",
      media: { url: "https://pbs.twimg.com/media/test.jpg", mediaType: "image" },
      sourceUrl,
      sourceText,
      authorHandle: "@researcher",
      externalUrls: [paperUrl],
    });

    expect(result.mainContent).toBe(repost);
    expect(result.firstComment).toBe(`${paperUrl}\n\nvia @researcher`);
  });

  it("adds first reply when post references GitHub repo", () => {
    const sourceUrl = "https://x.com/founder/status/456";
    const sourceText = "Check out my new open source project https://github.com/founder/cool-project";
    const githubUrl = "https://github.com/founder/cool-project";
    const repost = "new open source project released";

    const result = buildXLikedPlatformPostContent({
      baseContent: repost,
      platformType: "x",
      media: null,
      sourceUrl,
      sourceText,
      authorHandle: "@founder",
      externalUrls: [githubUrl],
    });

    expect(result.mainContent).toBe(repost);
    expect(result.firstComment).toBe(`${githubUrl}\n\nvia @founder`);
  });

  it("adds first reply when post references product docs", () => {
    const sourceUrl = "https://x.com/product/status/789";
    const sourceText = "New feature documentation available at https://docs.product.com/new-feature";
    const docsUrl = "https://docs.product.com/new-feature";
    const repost = "new feature documentation available";

    const result = buildXLikedPlatformPostContent({
      baseContent: repost,
      platformType: "x",
      media: { url: "https://pbs.twimg.com/media/photo.jpg", mediaType: "image" },
      sourceUrl,
      sourceText,
      authorHandle: "@product",
      externalUrls: [docsUrl],
    });

    expect(result.mainContent).toBe(repost);
    expect(result.firstComment).toBe(`${docsUrl}\n\nvia @product`);
  });

  it("adds first reply when post references demo video", () => {
    const sourceUrl = "https://x.com/creator/status/999";
    const sourceText = "Demo of the new AI agent: https://youtube.com/watch?v=abc123";
    const videoUrl = "https://youtube.com/watch?v=abc123";
    const repost = "demo of new ai agent";

    const result = buildXLikedPlatformPostContent({
      baseContent: repost,
      platformType: "x",
      media: null,
      sourceUrl,
      sourceText,
      authorHandle: "@creator",
      externalUrls: [videoUrl],
    });

    expect(result.mainContent).toBe(repost);
    expect(result.firstComment).toBe(`${videoUrl}\n\nvia @creator`);
  });

  it("no first reply for pure opinion/explanation posts without external artifacts", () => {
    const sourceUrl = "https://x.com/founder/status/111";
    const sourceText = "AI agents are transforming software development faster than expected.";
    const repost = "ai agents transforming software development";

    const result = buildXLikedPlatformPostContent({
      baseContent: repost,
      platformType: "x",
      media: { url: "https://pbs.twimg.com/media/img.jpg", mediaType: "image" },
      sourceUrl,
      sourceText,
      authorHandle: "@founder",
      externalUrls: [], // No external artifacts
    });

    // Pure explanation/opinion - no first reply
    expect(result.mainContent).toBe(repost);
    expect(result.firstComment).toBeUndefined();
  });

  it("no first reply when externalUrls is undefined", () => {
    const sourceUrl = "https://x.com/founder/status/222";
    const sourceText = "interesting insight about technology";
    const repost = "interesting insight about tech";

    const result = buildXLikedPlatformPostContent({
      baseContent: repost,
      platformType: "x",
      media: null,
      sourceUrl,
      sourceText,
      authorHandle: "@founder",
      // externalUrls not provided
    });

    expect(result.mainContent).toBe(repost);
    expect(result.firstComment).toBeUndefined();
  });

  it("does not affect LinkedIn posts (no first comment support)", () => {
    const sourceUrl = "https://x.com/founder/status/333";
    const sourceText = "AI just made the answer key free.";
    const paperUrl = "https://arxiv.org/abs/2024.11111";
    const repost = `AI just made the answer key free\n\n${sourceUrl}`;

    const result = buildXLikedPlatformPostContent({
      baseContent: repost,
      platformType: "linkedin_personal",
      media: { url: "https://cdn.example/image.jpg", mediaType: "image" },
      sourceUrl,
      sourceText,
      authorHandle: "@founder",
      externalUrls: [paperUrl],
    });

    // LinkedIn doesn't support first comments
    expect(result.mainContent).toBe(repost);
    expect(result.firstComment).toBeUndefined();
  });

  it("no first reply for video posts with embedded URL", () => {
    const sourceUrl = "https://x.com/founder/status/444";
    const sourceText = "Blue-collar automation will arrive unevenly.";
    const githubUrl = "https://github.com/example/automation-tool";
    const repost = "Blue-collar automation will arrive unevenly";

    const result = buildXLikedPlatformPostContent({
      baseContent: repost,
      platformType: "x",
      media: { url: "https://cdn.example/video.mp4", mediaType: "video", sourceUrl },
      sourceUrl,
      sourceText,
      authorHandle: "@founder",
      externalUrls: [githubUrl],
    });

    // Video posts embed source URL in body
    expect(result.mainContent).toContain(repost);
    expect(result.mainContent).toContain(sourceUrl);
    expect(result.firstComment).toBeUndefined();
  });
});
