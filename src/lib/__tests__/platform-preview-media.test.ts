import { describe, expect, it } from "vitest";

import { normalizePreviewMediaUrls } from "@/lib/dashboard/platform-preview-media";

describe("platform-preview-media", () => {
  it("keeps all attached images and reports overflow", () => {
    const result = normalizePreviewMediaUrls([
      " https://cdn.example.com/one.jpg ",
      "",
      null,
      "https://cdn.example.com/two.jpg",
      "https://cdn.example.com/three.jpg",
      "https://cdn.example.com/four.jpg",
      "https://cdn.example.com/five.jpg",
    ]);

    expect(result.visibleMediaUrls).toEqual([
      "https://cdn.example.com/one.jpg",
      "https://cdn.example.com/two.jpg",
      "https://cdn.example.com/three.jpg",
      "https://cdn.example.com/four.jpg",
    ]);
    expect(result.allMediaUrls).toHaveLength(5);
    expect(result.extraCount).toBe(1);
  });
});
