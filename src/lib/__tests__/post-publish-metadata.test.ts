import { describe, expect, it } from "vitest";

import {
  normalizePostPublishMetadata,
  resolveInstagramContentType,
  resolvePlatformMediaUrl,
  resolvePlatformMediaUrls,
  resolvePlatformOverride,
} from "@/lib/post-publish-metadata";

describe("post publish metadata", () => {
  it("defaults Instagram image media to feed", () => {
    expect(
      resolveInstagramContentType({
        platformType: "instagram",
        contentType: "image",
      })
    ).toBe("feed");
  });

  it("respects selected Instagram formats", () => {
    expect(
      resolveInstagramContentType({
        platformType: "instagram",
        format: "Story",
        contentType: "image",
      })
    ).toBe("story");
    expect(
      resolveInstagramContentType({
        platformType: "instagram_personal",
        format: "Reel",
        contentType: "video",
      })
    ).toBe("reel");
  });

  it("resolves platform-specific overrides and media", () => {
    const metadata = normalizePostPublishMetadata({
      platformOverrides: {
        "platform-1": { caption: "LinkedIn caption", format: "Feed" },
      },
      mediaUrls: [
        "https://cdn.example.com/shared-1.jpg",
        " https://cdn.example.com/shared-2.jpg ",
      ],
      mediaUrlsByPlatformId: {
        "platform-1": ["https://cdn.example.com/linkedin-1.jpg", " "],
        "platform-2": "https://cdn.example.com/linkedin-2.jpg",
      },
      mediaUrlByPlatformId: {
        "platform-legacy": "https://cdn.example.com/legacy-linkedin.jpg",
      },
      mediaUrlByPlatformType: {
        instagram: "https://cdn.example.com/instagram-legacy.jpg",
      },
    });

    expect(resolvePlatformOverride(metadata, { id: "platform-1", type: "linkedin" })).toEqual({
      caption: "LinkedIn caption",
      format: "Feed",
    });
    expect(metadata.mediaUrls).toEqual([
      "https://cdn.example.com/shared-1.jpg",
      "https://cdn.example.com/shared-2.jpg",
    ]);
    expect(metadata.mediaUrlsByPlatformId["platform-2"]).toEqual([
      "https://cdn.example.com/linkedin-2.jpg",
    ]);
    expect(
      resolvePlatformMediaUrls(metadata, { id: "platform-1", type: "linkedin" }, "fallback")
    ).toEqual(["https://cdn.example.com/linkedin-1.jpg"]);
    expect(
      resolvePlatformMediaUrl(metadata, { id: "platform-1", type: "linkedin" }, "fallback")
    ).toBe("https://cdn.example.com/linkedin-1.jpg");
    expect(
      resolvePlatformMediaUrl(metadata, { id: "platform-3", type: "instagram" }, "fallback")
    ).toBe("https://cdn.example.com/shared-1.jpg");
  });

  it("infers carousel Instagram content type from multiple media items", () => {
    expect(
      resolveInstagramContentType({
        platformType: "instagram",
        contentType: "image",
        mediaUrlCount: 2,
      })
    ).toBe("carousel");
  });
});
