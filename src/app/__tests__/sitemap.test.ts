import { describe, expect, it, vi } from "vitest";

const mocks = {
  host: "clawposter.app",
};

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-host": mocks.host }),
}));

// The sitemap pulls posts from the DB and from a static list; neither is what this test is about.
vi.mock("@/lib/blog/automation", () => ({
  getPublishedDynamicBlogPosts: async () => [],
}));
vi.mock("@/lib/blog/posts", () => ({
  BLOG_POSTS: [],
}));

import sitemap from "../sitemap";

const HOSTS = ["clawposter.app", "smmagent.app", "smmclaw.app", "www.smmagent.app"];

describe("sitemap host locality", () => {
  it.each(HOSTS)("lists only smmagent.app URLs (%s)", async (host) => {
    mocks.host = host;
    const entries = await sitemap();
    const foreign = entries
      .map((entry) => new URL(entry.url).host)
      .filter((urlHost) => urlHost !== "smmagent.app");

    expect(foreign).toEqual([]);
  });

  it("includes the product page, docs and legal pages on smmagent.app", async () => {
    mocks.host = "clawposter.app";
    const urls = (await sitemap()).map((e) => e.url);
    for (const path of ["/social-media-bot", "/docs", "/privacy", "/terms"]) {
      expect(urls).toContain(`https://smmagent.app${path}`);
    }
    expect(urls.some((u) => u.includes("clawposter.app") || u.includes("smmclaw.app"))).toBe(false);
  });
});
