import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rows = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock("../automation", () => ({
  getPublishedDynamicBlogPosts: vi.fn(async () => rows),
  findPublishedDynamicBlogPost: vi.fn(async () => null),
}));

function row(over: Record<string, unknown>) {
  return {
    slug: "s",
    title: "T",
    excerpt: "E",
    contentMarkdown: "# T",
    category: "Automation",
    publishedAt: new Date("2026-10-21T10:00:00Z"),
    createdAt: new Date("2026-10-21T10:00:00Z"),
    heroImageUrl: null,
    heroImageAlt: null,
    sources: [],
    metadata: null,
    ...over,
  };
}

describe("isoWeekStart", () => {
  it("returns the ISO Monday of a YYYY-MM-DD date", async () => {
    const { isoWeekStart } = await import("../week-start");
    expect(isoWeekStart("2026-10-19")).toBe("2026-10-19");
    expect(isoWeekStart("2026-10-25")).toBe("2026-10-19");
    expect(isoWeekStart("2026-10-26")).toBe("2026-10-26");
    expect(isoWeekStart("2026-01-01")).toBe("2025-12-29");
  });
});

describe("public posts weekStart", () => {
  it("uses metadata.publicationDate for externally published articles", async () => {
    rows.length = 0;
    rows.push(
      row({
        slug: "ext",
        metadata: { generator: "hermes-source-of-truth", publicationDate: "2026-10-12" },
      }),
    );
    const { getAllPublicBlogPosts } = await import("../dynamic");
    const post = (await getAllPublicBlogPosts("smmagent.app")).find((p) => p.slug === "ext");
    expect(post?.weekStart).toBe("2026-10-12");
  });

  it("falls back to publishedAt for external rows without publicationDate", async () => {
    rows.length = 0;
    rows.push(row({ slug: "old", metadata: { generator: "hermes-source-of-truth" } }));
    const { getAllPublicBlogPosts } = await import("../dynamic");
    const post = (await getAllPublicBlogPosts("smmagent.app")).find((p) => p.slug === "old");
    expect(post?.weekStart).toBe("2026-10-19");
  });

  it("leaves internally generated and static posts without weekStart", async () => {
    rows.length = 0;
    rows.push(row({ slug: "internal", metadata: { generator: "internal" } }));
    const { getAllPublicBlogPosts } = await import("../dynamic");
    const posts = await getAllPublicBlogPosts("smmagent.app");
    expect(posts.length).toBeGreaterThan(1);
    expect(posts.every((p) => p.weekStart === undefined)).toBe(true);
  });
});
