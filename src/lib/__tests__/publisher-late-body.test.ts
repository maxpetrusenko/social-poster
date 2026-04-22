import { describe, expect, it } from "vitest";

import { buildLatePostBody } from "@/lib/pipeline/publisher";

describe("Late publisher body", () => {
  it("omits Instagram contentType for feed image posts", () => {
    const body = buildLatePostBody({
      platform: "instagram",
      accountId: "ig-account",
      content: "Feed caption",
      mediaUrl: "https://cdn.example.com/feed.jpg",
      mediaType: "image",
      instagramContentType: "feed",
    });

    expect(body.platforms).toEqual([
      { platform: "instagram", accountId: "69024a779d65616f16a5c5c1" },
    ]);
  });

  it("maps explicit Instagram story and reel formats", () => {
    const storyBody = buildLatePostBody({
      platform: "instagram",
      accountId: "ig-account",
      content: "",
      mediaUrl: "https://cdn.example.com/story.jpg",
      mediaType: "image",
      instagramContentType: "story",
    });
    const reelBody = buildLatePostBody({
      platform: "instagram",
      accountId: "ig-account",
      content: "Reel caption",
      mediaUrl: "https://cdn.example.com/reel.mp4",
      mediaType: "video",
      instagramContentType: "reel",
    });

    expect(storyBody.platforms).toEqual([
      {
        platform: "instagram",
        accountId: "69024a779d65616f16a5c5c1",
        platformSpecificData: { contentType: "story" },
      },
    ]);
    expect(reelBody.platforms).toEqual([
      {
        platform: "instagram",
        accountId: "69024a779d65616f16a5c5c1",
        platformSpecificData: { contentType: "reels", shareToFeed: true },
      },
    ]);
  });

  it("maps Facebook story and reel formats", () => {
    const storyBody = buildLatePostBody({
      platform: "facebook",
      accountId: "fb-account",
      content: "Story caption",
      mediaUrl: "https://cdn.example.com/story.jpg",
      mediaType: "image",
      platformFormat: "Story",
      firstComment: "skip me",
    });
    const reelBody = buildLatePostBody({
      platform: "facebook",
      accountId: "fb-account",
      content: "Reel caption",
      mediaUrl: "https://cdn.example.com/reel.mp4",
      mediaType: "video",
      platformFormat: "Reel",
      firstComment: "link",
    });

    expect(storyBody.platforms).toEqual([
      {
        platform: "facebook",
        accountId: "69024a999d65616f16a5c5c2",
        platformSpecificData: { contentType: "story" },
      },
    ]);
    expect(reelBody.platforms).toEqual([
      {
        platform: "facebook",
        accountId: "69024a999d65616f16a5c5c2",
        platformSpecificData: { contentType: "reel", firstComment: "link" },
      },
    ]);
  });

  it("publishes multiple media items as a Late carousel payload", () => {
    const body = buildLatePostBody({
      platform: "instagram",
      accountId: "ig-account",
      content: "Carousel caption",
      mediaUrls: [
        "https://cdn.example.com/one.jpg",
        "https://cdn.example.com/two.jpg",
      ],
      instagramContentType: "carousel",
    });

    expect(body.mediaItems).toEqual([
      { type: "image", url: "https://cdn.example.com/one.jpg" },
      { type: "image", url: "https://cdn.example.com/two.jpg" },
    ]);
    expect(body.platforms).toEqual([
      {
        platform: "instagram",
        accountId: "69024a779d65616f16a5c5c1",
        platformSpecificData: { contentType: "carousel" },
      },
    ]);
  });
});
