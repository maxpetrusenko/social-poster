import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-host": "smmagent.app" }),
}));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(async () => null) }));
vi.mock("@/components/landing/nav", () => ({ LandingNav: () => null }));
vi.mock("@/lib/blog/dynamic", () => ({
  getAllPublicBlogPosts: vi.fn(async () => [
    {
      slug: "weekly",
      title: "Weekly",
      excerpt: "e",
      content: "c",
      category: "Automation",
      publishedAt: "2026-10-21",
      weekStart: "2026-10-19",
    },
    {
      slug: "static",
      title: "Static",
      excerpt: "e",
      content: "c",
      category: "Guides",
      publishedAt: "2026-01-01",
    },
  ]),
}));

describe("blog index data-week-start", () => {
  it("exposes the ISO week on weekly article links only", async () => {
    const { default: BlogPage } = await import("@/app/blog/page");
    const { container } = render(await BlogPage());
    const weekly = container.querySelector('a[href="/blog/weekly"]');
    const stat = container.querySelector('a[href="/blog/static"]');
    expect(weekly?.getAttribute("data-week-start")).toBe("2026-10-19");
    expect(stat?.hasAttribute("data-week-start")).toBe(false);
    expect(container.querySelectorAll("[data-week-start]").length).toBe(1);
  });
});
