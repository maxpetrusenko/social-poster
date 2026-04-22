import { describe, it, expect } from "vitest";
import { PLATFORM_TYPES } from "@/lib/platforms";
import { getSpecForPlatform, getImageDimensions, PLATFORM_SPECS } from "@/lib/platform-specs";

describe("platform-specs", () => {
  it("returns spec for known platforms", () => {
    expect(getSpecForPlatform("instagram")).toBeDefined();
    expect(getSpecForPlatform("facebook")).toBeDefined();
    expect(getSpecForPlatform("x")).toBeDefined();
    expect(getSpecForPlatform("twitter")).toBeDefined();
    expect(getSpecForPlatform("threads")).toBeDefined();
    expect(getSpecForPlatform("mastodon")).toBeDefined();
  });

  it("returns undefined for unknown platform", () => {
    expect(getSpecForPlatform("nonexistent")).toBeUndefined();
  });

  it("returns correct Instagram Feed dimensions", () => {
    const dims = getImageDimensions("instagram", "Feed");
    expect(dims.length).toBeGreaterThan(0);
    expect(dims[0].width).toBe(1080);
  });

  it("returns correct X default dimensions", () => {
    const dims = getImageDimensions("x");
    expect(dims[0].width).toBe(1200);
    expect(dims[0].height).toBe(675);
  });

  it("returns correct Threads and Mastodon dimensions", () => {
    const threadsDims = getImageDimensions("threads");
    const mastodonDims = getImageDimensions("mastodon");

    expect(threadsDims).toHaveLength(1);
    expect(threadsDims[0].width).toBe(1080);
    expect(threadsDims[0].height).toBe(1350);

    expect(mastodonDims).toHaveLength(1);
    expect(mastodonDims[0].width).toBe(1200);
    expect(mastodonDims[0].height).toBe(675);
  });

  it("instagram supports multi-image", () => {
    expect(PLATFORM_SPECS.instagram.supportsMultiImage).toBe(true);
    expect(PLATFORM_SPECS.instagram.maxImages).toBe(10);
  });

  it("pinterest does not support multi-image", () => {
    expect(PLATFORM_SPECS.pinterest.supportsMultiImage).toBe(false);
  });

  it("handles case-insensitive lookups", () => {
    // getSpecForPlatform lowercases internally
    expect(getSpecForPlatform("Instagram")).toBeDefined();
    expect(getSpecForPlatform("FACEBOOK")).toBeDefined();
    expect(getSpecForPlatform("instagram")).toBeDefined();
  });

  it("maps known aliases to canonical platform specs", () => {
    expect(getSpecForPlatform("mastadon")?.label).toBe("Mastodon");
  });

  it("defines media upload constraints for every configured platform", () => {
    for (const platformType of PLATFORM_TYPES) {
      const spec = getSpecForPlatform(platformType);
      expect(spec, `${platformType} spec`).toBeDefined();
      expect(spec!.charLimit, `${platformType} char limit`).toBeGreaterThan(0);
      expect(spec!.maxImages, `${platformType} max images`).toBeGreaterThan(0);
      expect(getImageDimensions(platformType).length, `${platformType} image dimensions`).toBeGreaterThan(0);
    }
  });

  it("keeps platform media limits explicit", () => {
    expect(PLATFORM_SPECS.linkedin.maxImages).toBe(20);
    expect(PLATFORM_SPECS.instagram.maxImages).toBe(10);
    expect(PLATFORM_SPECS.twitter.maxImages).toBe(4);
    expect(PLATFORM_SPECS.youtube.maxImages).toBe(1);
    expect(PLATFORM_SPECS.whatsapp.maxImages).toBe(1);
  });
});
