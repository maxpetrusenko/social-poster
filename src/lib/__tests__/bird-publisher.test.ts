import { describe, expect, it } from "vitest";

import { resolveBirdThreadParts } from "../pipeline/bird-publisher.ts";

describe("Bird publisher", () => {
  it("can keep long Premium X posts as one post", () => {
    const content = [
      "OpenAI launched this.",
      "Looks worth testing inside a real workflow before having a strong take.",
      "The account can publish long-form X posts, so this should not become a numbered thread.",
    ].join("\n\n");

    const threaded = resolveBirdThreadParts(
      content,
      {
        threadLongPosts: true,
        tweetCharLimit: 80,
        threadChunkLimit: 70,
      },
      true
    );
    expect(threaded.length).toBeGreaterThan(1);
    expect(threaded[0]).toMatch(/^1\//);

    const single = resolveBirdThreadParts(
      content,
      {
        threadLongPosts: true,
        tweetCharLimit: 80,
        threadChunkLimit: 70,
      },
      false
    );
    expect(single).toEqual([content]);
  });
});
