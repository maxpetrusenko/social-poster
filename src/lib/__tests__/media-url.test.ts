import { describe, expect, it } from "vitest";

import { isRenderableMediaUrl, mediaTypeFromContentType, mediaTypeFromUrl } from "@/lib/media-url";

describe("media-url", () => {
  it("detects normal image URLs", () => {
    expect(mediaTypeFromUrl("https://cdn.example.com/post.jpg")).toBe("image");
    expect(mediaTypeFromUrl("https://cdn.example.com/post.webp?width=1200")).toBe("image");
    expect(isRenderableMediaUrl("https://cdn.example.com/post.png")).toBe(true);
  });

  it("detects normal video URLs", () => {
    expect(mediaTypeFromUrl("https://cdn.example.com/demo.mp4")).toBe("video");
    expect(mediaTypeFromUrl("https://cdn.example.com/demo.webm?download=1")).toBe("video");
  });

  it("detects X/Twitter image URLs that use format query params", () => {
    expect(
      mediaTypeFromUrl("https://pbs.twimg.com/media/example?format=jpg&name=large")
    ).toBe("image");
  });

  it("does not treat social page URLs as directly renderable media", () => {
    expect(
      mediaTypeFromUrl("https://x.com/Meta_Engineers/status/2046224175736803816/photo/1")
    ).toBeNull();
  });

  it("detects media type from content type", () => {
    expect(mediaTypeFromContentType("image/jpeg; charset=utf-8")).toBe("image");
    expect(mediaTypeFromContentType("video/mp4")).toBe("video");
    expect(mediaTypeFromContentType("text/html")).toBeNull();
  });
});
