import { describe, expect, it, vi } from "vitest";

const mocks = { host: "clawposter.app" };

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-host": mocks.host }),
}));

// Two categories for three posts, deliberately different dates, so a category
// URL must pick up the newest post inside it and not a site-wide stamp.
// `vi.hoisted` because `vi.mock` factories are hoisted above the consts.
const fixtures = vi.hoisted(() => ({
  staticPosts: [
    { slug: "newer-automation", category: "Automation", publishedAt: "2026-08-02" },
    { slug: "older-automation", category: "Automation", publishedAt: "2026-06-11" },
    { slug: "team-post", category: "Teams", publishedAt: "2026-05-01" },
  ],
  dynamicPosts: [
    {
      slug: "dynamic-post",
      category: "Automation",
      publishedAt: new Date("2026-09-12T00:00:00.000Z"),
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
    },
  ],
}));

vi.mock("@/lib/blog/automation", () => ({
  getPublishedDynamicBlogPosts: async () => fixtures.dynamicPosts,
}));

vi.mock("@/lib/blog/posts", () => ({ BLOG_POSTS: fixtures.staticPosts }));

import sitemap from "../sitemap";
import { ROUTE_LASTMOD } from "@/lib/site/sitemap-lastmod.generated";

const lastmodOf = (entries: Awaited<ReturnType<typeof sitemap>>, url: string) => {
  const entry = entries.find((e) => e.url === url);
  expect(entry, `${url} missing from sitemap`).toBeDefined();
  return entry?.lastModified;
};

const isoOf = (value: unknown) => new Date(value as string).toISOString().slice(0, 10);

describe("sitemap lastmod freshness", () => {
  it("gives every URL a lastModified, for every host", async () => {
    for (const host of ["clawposter.app", "smmagent.app", "smmclaw.app"]) {
      mocks.host = host;
      const entries = await sitemap();
      expect(entries.length).toBeGreaterThan(0);
      const missing = entries.filter((e) => !e.lastModified).map((e) => e.url);
      expect(missing, `${host} has URLs without lastmod`).toEqual([]);
      const invalid = entries
        .filter((e) => Number.isNaN(new Date(e.lastModified as Date).getTime()))
        .map((e) => e.url);
      expect(invalid).toEqual([]);
    }
  });

  it("never stamps every URL with the same date", async () => {
    mocks.host = "clawposter.app";
    const entries = await sitemap();
    const distinct = new Set(entries.map((e) => isoOf(e.lastModified)));
    // 4 static pages + 2 categories + 4 posts, and the static values differ
    // (see ROUTE_LASTMOD) — one shared date is exactly the defect.
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("dates each static route from that route's own source history", async () => {
    mocks.host = "clawposter.app";
    const entries = await sitemap();
    expect(isoOf(lastmodOf(entries, "https://clawposter.app/"))).toBe(ROUTE_LASTMOD["/"]);
    expect(isoOf(lastmodOf(entries, "https://clawposter.app/blog"))).toBe(ROUTE_LASTMOD["/blog"]);
    expect(isoOf(lastmodOf(entries, "https://clawposter.app/social-media-bot"))).toBe(
      ROUTE_LASTMOD["/social-media-bot"]
    );

    mocks.host = "smmagent.app";
    const app = await sitemap();
    expect(isoOf(lastmodOf(app, "https://smmagent.app/docs"))).toBe(ROUTE_LASTMOD["/docs"]);
  });

  it("dates a category from the newest post in that category", async () => {
    mocks.host = "clawposter.app";
    const entries = await sitemap();
    // Automation holds the 2026-09-12 dynamic post, not the 2026-08-02 static one.
    expect(isoOf(lastmodOf(entries, "https://clawposter.app/blog/category/automation"))).toBe("2026-09-12");
    expect(isoOf(lastmodOf(entries, "https://clawposter.app/blog/category/teams"))).toBe("2026-05-01");
  });

  it("dates each post from that post's own publishedAt", async () => {
    mocks.host = "clawposter.app";
    const entries = await sitemap();
    expect(isoOf(lastmodOf(entries, "https://clawposter.app/blog/dynamic-post"))).toBe("2026-09-12");
    expect(isoOf(lastmodOf(entries, "https://clawposter.app/blog/older-automation"))).toBe("2026-06-11");
  });
});
