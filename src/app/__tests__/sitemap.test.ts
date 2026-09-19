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
  it.each(HOSTS)("never lists a URL on another host (%s)", async (host) => {
    mocks.host = host;
    const entries = await sitemap();
    const foreign = entries
      .map((entry) => new URL(entry.url).host)
      .filter((urlHost) => urlHost !== host.replace(/^www\./, ""));

    expect(foreign).toEqual([]);
  });

  it("emits the product page only where it canonically lives", async () => {
    mocks.host = "clawposter.app";
    const product = await sitemap();
    expect(product.some((e) => e.url === "https://clawposter.app/social-media-bot")).toBe(true);

    for (const host of ["smmagent.app", "smmclaw.app"]) {
      mocks.host = host;
      const entries = await sitemap();
      expect(entries.some((e) => e.url.includes("clawposter.app"))).toBe(false);
    }
  });

  it("emits the docs page only where it canonically lives", async () => {
    mocks.host = "smmagent.app";
    const app = await sitemap();
    expect(app.some((e) => e.url === "https://smmagent.app/docs")).toBe(true);

    for (const host of ["clawposter.app", "smmclaw.app"]) {
      mocks.host = host;
      const entries = await sitemap();
      expect(entries.some((e) => e.url.includes("smmagent.app"))).toBe(false);
    }
  });
});
