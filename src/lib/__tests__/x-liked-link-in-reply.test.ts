import { describe, expect, it } from "vitest";

import { buildXLikedPlatformPostContent } from "../x-liked-autopost-format.ts";

describe("X liked post first-reply source logic", () => {
  it("adds first reply with arxiv paper link and credits author", () => {
    const sourceUrl = "https://x.com/HowToPrompt__/status/2113248744905064464";
    const sourceText = "Researchers mathematically proved that AI will cause the Tragedy of the Cognitive Commons.";
    const paperUrl = "https://arxiv.org/abs/2024.12345";
    
    const result = buildXLikedPlatformPostContent({
      baseContent: "researchers proved ai causes cognitive commons tragedy",
      platformType: "x",
      media: { url: "https://pbs.twimg.com/media/HVPEb9Wb0AE1DiE.jpg", mediaType: "image" },
      sourceUrl,
      authorHandle: "@HowToPrompt__",
      sourceText,
      externalUrls: [paperUrl],
    });

    expect(result.mainContent).toBe("researchers proved ai causes cognitive commons tragedy");
    expect(result.firstComment).toBe(`${paperUrl}\n\nvia @HowToPrompt__`);
  });

  it("adds first reply with GitHub repo link when present", () => {
    const sourceUrl = "https://x.com/founder/status/123";
    const sourceText = "check out this new tool for AI agents";
    const githubUrl = "https://github.com/example/ai-agent-tool";
    
    const result = buildXLikedPlatformPostContent({
      baseContent: "new tool for ai agents",
      platformType: "x",
      media: null,
      sourceUrl,
      authorHandle: "@founder",
      sourceText,
      externalUrls: [githubUrl],
    });

    expect(result.mainContent).toBe("new tool for ai agents");
    expect(result.firstComment).toBe(`${githubUrl}\n\nvia @founder`);
  });

  it("no first reply for pure opinion/explanation posts without external artifacts", () => {
    const sourceUrl = "https://x.com/founder/status/123";
    const sourceText = "automation shifts are happening fast in the industry";
    const result = buildXLikedPlatformPostContent({
      baseContent: "automation shifts happening fast in industry",
      platformType: "x",
      media: null,
      sourceUrl,
      authorHandle: "@founder",
      sourceText,
      externalUrls: [], // No external artifacts
    });

    // Pure explanation/opinion - no first reply
    expect(result.mainContent).toBe("automation shifts happening fast in industry");
    expect(result.firstComment).toBeUndefined();
  });

  it("adds first reply with docs link when present", () => {
    const sourceUrl = "https://x.com/cdngdev/status/456";
    const sourceText = "new feature in the documentation";
    const docsUrl = "https://docs.example.com/new-feature";
    const result = buildXLikedPlatformPostContent({
      baseContent: "new feature explained",
      platformType: "x",
      media: { url: "https://pbs.twimg.com/media/test.jpg", mediaType: "image" },
      sourceUrl,
      authorHandle: "@cdngdev",
      sourceText,
      externalUrls: [docsUrl],
    });

    expect(result.mainContent).toBe("new feature explained");
    expect(result.firstComment).toBe(`${docsUrl}\n\nvia @cdngdev`);
  });

  it("adds first reply with YouTube demo video", () => {
    const sourceUrl = "https://x.com/founder/status/789";
    const sourceText = "demo of the new AI agent framework";
    const videoUrl = "https://youtube.com/watch?v=abc123";
    const result = buildXLikedPlatformPostContent({
      baseContent: "demo of new ai agent framework",
      platformType: "x",
      media: null,
      sourceUrl,
      authorHandle: "@founder",
      sourceText,
      externalUrls: [videoUrl],
    });

    expect(result.mainContent).toBe("demo of new ai agent framework");
    expect(result.firstComment).toBe(`${videoUrl}\n\nvia @founder`);
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
  
  it("prefers first external artifact URL over tweet URL", () => {
    const sourceUrl = "https://x.com/researcher/status/999";
    const sourceText = "check out my paper and code";
    const paperUrl = "https://arxiv.org/abs/2024.99999";
    const githubUrl = "https://github.com/researcher/paper-code";
    
    const result = buildXLikedPlatformPostContent({
      baseContent: "new paper and code released",
      platformType: "x",
      media: null,
      sourceUrl,
      authorHandle: "@researcher",
      sourceText,
      externalUrls: [paperUrl, githubUrl], // Paper found first
    });

    // Should use paper URL (first artifact found)
    expect(result.mainContent).toBe("new paper and code released");
    expect(result.firstComment).toBe(`${paperUrl}\n\nvia @researcher`);
  });
});
