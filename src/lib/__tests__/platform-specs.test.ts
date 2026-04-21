import { describe, it, expect } from "vitest";
import { getSpecForPlatform, getImageDimensions, PLATFORM_SPECS } from "@/lib/platform-specs";

describe("platform-specs", () => {
  it("returns spec for known platforms", () => {
    expect(getSpecForPlatform("instagram")).toBeDefined();
    expect(getSpecForPlatform("facebook")).toBeDefined();
    expect(getSpecForPlatform("x")).toBeDefined();
    expect(getSpecForPlatform("twitter")).toBeDefined();
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
});
