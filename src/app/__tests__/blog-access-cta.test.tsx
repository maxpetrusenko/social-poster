import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  host: "smmagent.app",
  session: null as null | { id: string },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-host": mocks.host }),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
}));

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(async () => mocks.session),
}));

vi.mock("@/lib/blog/dynamic", () => ({
  findPublicBlogPost: vi.fn(async () => ({
    slug: "test-article",
    title: "Test article",
    excerpt: "A useful test article.",
    category: "Operations",
    publishedAt: "2026-07-22",
    content: "Article body",
    imageUrl: null,
    imageAlt: null,
    isMarkdown: false,
  })),
}));

vi.mock("@/components/landing/nav", () => ({
  LandingNav: () => null,
}));

vi.mock("@/components/landing/footer", () => ({
  LandingFooter: () => null,
}));

afterEach(() => {
  mocks.host = "smmagent.app";
  mocks.session = null;
});

describe("public article access call to action", () => {
  it("sends signed-out readers to login without a waitlist form", async () => {
    const { default: BlogPostPage } = await import("@/app/blog/[slug]/page");
    render(await BlogPostPage({ params: Promise.resolve({ slug: "test-article" }) }));

    const link = screen.getByRole("link", { name: "Start using SMM Agent" });
    expect(link.getAttribute("href")).toBe("/login");
    expect(screen.queryByText(/waitlist/i)).toBeNull();
    expect(screen.queryByPlaceholderText("you@company.com")).toBeNull();
  });

  it("sends signed-in readers to the dashboard", async () => {
    mocks.session = { id: "session_1" };
    const { default: BlogPostPage } = await import("@/app/blog/[slug]/page");
    render(await BlogPostPage({ params: Promise.resolve({ slug: "test-article" }) }));

    const link = screen.getByRole("link", { name: "Open SMM Agent" });
    expect(link.getAttribute("href")).toBe("/dashboard");
  });

  it("preserves the waitlist form for a different product brand", async () => {
    mocks.host = "clawposter.app";
    const { default: BlogPostPage } = await import("@/app/blog/[slug]/page");
    render(await BlogPostPage({ params: Promise.resolve({ slug: "test-article" }) }));

    expect(screen.getByRole("button", { name: "Join Waitlist" })).toBeTruthy();
    expect(screen.getByPlaceholderText("you@company.com")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Start using SMM Agent" })).toBeNull();
  });
});
