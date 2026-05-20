import { describe, expect, it } from "vitest";

import { buildLatePostBody, getLatePlatformFailure } from "@/lib/pipeline/publisher";

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
      { platform: "instagram", accountId: "ig-account" },
    ]);
  });

  it("uses the connected account id instead of legacy platform defaults", () => {
    const body = buildLatePostBody({
      platform: "instagram",
      accountId: "connected-instagram-account",
      content: "Connected account caption",
      mediaUrl: "https://cdn.example.com/feed.jpg",
      mediaType: "image",
      instagramContentType: "feed",
    });

    expect(body.platforms).toEqual([
      { platform: "instagram", accountId: "connected-instagram-account" },
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
        accountId: "ig-account",
        platformSpecificData: { contentType: "story" },
      },
    ]);
    expect(reelBody.platforms).toEqual([
      {
        platform: "instagram",
        accountId: "ig-account",
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
        accountId: "fb-account",
        platformSpecificData: { contentType: "story" },
      },
    ]);
    expect(reelBody.platforms).toEqual([
      {
        platform: "facebook",
        accountId: "fb-account",
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
        accountId: "ig-account",
        platformSpecificData: { contentType: "carousel" },
      },
    ]);
  });

  it("accepts Late async processing statuses without marking the publish failed", () => {
    const failure = getLatePlatformFailure(
      "instagram",
      {},
      { platform: "instagram", status: "processing" }
    );

    expect(failure).toBeNull();
  });

  it("still surfaces Late async platform errors", () => {
    const failure = getLatePlatformFailure(
      "instagram",
      {
        platformResults: [
          {
            platform: "instagram",
            status: "pending",
            error: "credits depleted",
          },
        ],
      },
      { platform: "instagram", status: "pending", errorMessage: "credits depleted" }
    );

    expect(failure).toEqual({
      classification: "provider_error",
      error: "credits depleted",
    });
  });
});
