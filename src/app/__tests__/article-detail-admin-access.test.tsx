import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  viewerEmail: "creator@example.com",
  viewerCanEdit: true,
  articleRows: [] as Array<Record<string, unknown>>,
}));

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({
  isAdmin: vi.fn((email: string) => email === "max@example.com"),
}));

vi.mock("@/lib/tenancy", () => ({
  getTenantContext: vi.fn(async () => ({
    user: { email: state.viewerEmail },
  })),
  canEditCurrentWorkspaceContent: vi.fn(() => state.viewerCanEdit),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
  },
}));

vi.mock("@/components/articles/article-editor", () => ({
  ArticleEditor: () => null,
}));

vi.mock("@/components/blog/markdown-renderer", () => ({
  BlogMarkdownRenderer: () => null,
}));

import ArticleDetailPage from "@/app/dashboard/articles/[id]/page";

const article = {
  id: "private",
  title: "Private article",
  excerpt: "Private.",
  status: "draft",
  validationStatus: "pass",
  validationScore: 110,
  frameworkChecks: null,
  heroImageUrl: null,
  heroImageAlt: null,
  contentMarkdown: "# Private article",
  sources: [],
  createdByEmail: "creator@example.com",
};

describe("article detail creator access", () => {
  beforeEach(() => {
    state.viewerEmail = "creator@example.com";
    state.viewerCanEdit = true;
    state.articleRows = [];
    mocks.select.mockReset();
    mocks.notFound.mockReset();
    mocks.notFound.mockImplementation(() => {
      throw new Error("notFound");
    });
    mocks.select.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => state.articleRows),
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => []),
          })),
        })),
      })),
    }));
  });

  it("renders an article for its creator", async () => {
    state.articleRows = [article];

    const result = await ArticleDetailPage({
      params: Promise.resolve({ id: "private" }),
    });

    expect(result).toBeTruthy();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("returns not found for another editor's article", async () => {
    state.viewerEmail = "other@example.com";

    await expect(
      ArticleDetailPage({
        params: Promise.resolve({ id: "private" }),
      })
    ).rejects.toThrow("notFound");
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });

  it("renders a legacy ownerless article for an admin", async () => {
    state.viewerEmail = "max@example.com";
    state.articleRows = [{ ...article, createdByEmail: null }];

    const result = await ArticleDetailPage({
      params: Promise.resolve({ id: "private" }),
    });

    expect(result).toBeTruthy();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("rejects a non-editor before querying private article data", async () => {
    state.viewerEmail = "viewer@example.com";
    state.viewerCanEdit = false;

    await expect(
      ArticleDetailPage({
        params: Promise.resolve({ id: "private" }),
      })
    ).rejects.toThrow("notFound");
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
