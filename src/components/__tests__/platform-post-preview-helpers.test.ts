import { describe, expect, it } from "vitest";

import {
  humanizeFormatLabel,
  parseThreadChunks,
  shouldRenderSourceLinkCard,
  shouldRenderThread,
} from "@/components/platform-post-preview-helpers";

describe("platform-post-preview helpers", () => {
  it("parses numbered thread chunks", () => {
    expect(parseThreadChunks(["1/2 First chunk", "2/2 Second chunk"].join("\n\n"))).toEqual([
      "First chunk",
      "Second chunk",
    ]);
  });

  it("detects thread mode from metadata or content", () => {
    expect(
      shouldRenderThread({
        content: "A normal post",
        format: "thread",
      })
    ).toBe(true);
    expect(
      shouldRenderThread({
        content: ["1/2 First chunk", "2/2 Second chunk"].join("\n\n"),
        format: "tweet",
      })
    ).toBe(true);
    expect(
      shouldRenderThread({
        content: "A normal post",
        format: "tweet",
      })
    ).toBe(false);
  });

  it("humanizes the selected format label", () => {
    expect(humanizeFormatLabel("idea_pin")).toBe("Idea Pin");
    expect(humanizeFormatLabel("story")).toBe("Story");
  });

  it("renders a source link card only when media is absent", () => {
    expect(
      shouldRenderSourceLinkCard({
        sourceUrl: "https://example.com",
        mediaUrls: [],
      })
    ).toBe(true);
    expect(
      shouldRenderSourceLinkCard({
        sourceUrl: "https://example.com",
        mediaUrls: ["https://cdn.example.com/image.jpg"],
      })
    ).toBe(false);
  });
});
