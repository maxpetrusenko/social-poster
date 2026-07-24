import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  generatedRows: [] as Array<Record<string, unknown>>,
  publicPosts: [] as Array<Record<string, unknown>>,
  requestedLimit: null as number | null,
  requestedHost: null as string | null,
  viewerEmail: "max@example.com" as string | null,
  viewerCanEdit: true,
  selectCallCount: 0,
  whereCallCount: 0,
}));

vi.mock("server-only", () => ({}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          state.whereCallCount += 1;
          return {
            orderBy: vi.fn(() => ({
              limit: vi.fn(async (limit: number) => {
                state.selectCallCount += 1;
                state.requestedLimit = limit;
                return state.generatedRows;
              }),
            })),
          };
        }),
      })),
    })),
  },
}));

vi.mock("@/lib/admin-auth", () => ({
  isAdmin: vi.fn((email: string) => email === "max@example.com"),
}));

vi.mock("@/lib/tenancy", () => ({
  getTenantContext: vi.fn(async () =>
    state.viewerEmail
      ? { user: { email: state.viewerEmail } }
      : null
  ),
  canEditCurrentWorkspaceContent: vi.fn(() => state.viewerCanEdit),
}));

vi.mock("@/lib/blog/dynamic", () => ({
  getAllPublicBlogPosts: vi.fn(async (host: string) => {
    state.requestedHost = host;
    return state.publicPosts;
  }),
}));

import { getArticleReviewDashboardData } from "@/lib/article-agent/review-dashboard";

describe("article review dashboard data", () => {
  beforeEach(() => {
    state.generatedRows = [];
    state.publicPosts = [];
    state.requestedLimit = null;
    state.requestedHost = null;
    state.viewerEmail = "max@example.com";
    state.viewerCanEdit = true;
    state.selectCallCount = 0;
    state.whereCallCount = 0;
  });

  it("does not query or expose private generated articles to non-editor users", async () => {
    state.viewerEmail = "viewer@example.com";
    state.viewerCanEdit = false;
    state.generatedRows = [
      {
        id: "private-draft",
        title: "Private draft",
        slug: "private-draft",
        status: "draft",
        publishStatus: "idle",
        validationStatus: "warn",
        validationScore: 80,
        publishedAt: null,
      },
    ];
    state.publicPosts = [
      {
        title: "Public article",
        slug: "public-article",
        excerpt: "Public.",
        category: "Agent",
        publishedAt: "2026-07-17",
        imageUrl: null,
      },
    ];

    const result = await getArticleReviewDashboardData();

    expect(state.selectCallCount).toBe(0);
    expect(result.generated).toEqual([]);
    expect(result.publicArticles).toHaveLength(1);
  });

  it("scopes a creator's generated inventory while admins can query all records", async () => {
    state.viewerEmail = "creator@example.com";
    state.viewerCanEdit = true;

    await getArticleReviewDashboardData();

    expect(state.whereCallCount).toBe(1);
    expect(state.selectCallCount).toBe(1);

    state.viewerEmail = "max@example.com";
    state.whereCallCount = 0;
    await getArticleReviewDashboardData();

    expect(state.whereCallCount).toBe(1);
    expect(state.selectCallCount).toBe(2);
  });

  it("returns recent generated articles with internal review links and public links only for published rows", async () => {
    state.generatedRows = [
      {
        id: "published/id",
        title: "Published article",
        slug: "published-article",
        status: "published",
        publishStatus: "published",
        validationStatus: "pass",
        validationScore: 103,
        publishedAt: new Date("2026-07-17T12:00:00.000Z"),
      },
      {
        id: "draft id",
        title: "Draft article",
        slug: "draft-article",
        status: "draft",
        publishStatus: "idle",
        validationStatus: "warn",
        validationScore: 88,
        publishedAt: null,
      },
      {
        id: "inconsistent",
        title: "Inconsistent article",
        slug: "inconsistent-article",
        status: "published",
        publishStatus: "published",
        validationStatus: "pass",
        validationScore: 101,
        publishedAt: null,
      },
    ];

    const result = await getArticleReviewDashboardData();

    expect(state.requestedLimit).toBe(20);
    expect(result.generated).toEqual([
      {
        id: "published/id",
        title: "Published article",
        slug: "published-article",
        status: "published",
        validationStatus: "pass",
        validationScore: 103,
        reviewHref: "/dashboard/articles/published%2Fid",
        publicUrl: "https://smmagent.app/blog/published-article",
      },
      {
        id: "draft id",
        title: "Draft article",
        slug: "draft-article",
        status: "draft",
        validationStatus: "warn",
        validationScore: 88,
        reviewHref: "/dashboard/articles/draft%20id",
        publicUrl: null,
      },
      {
        id: "inconsistent",
        title: "Inconsistent article",
        slug: "inconsistent-article",
        status: "published",
        validationStatus: "pass",
        validationScore: 101,
        reviewHref: "/dashboard/articles/inconsistent",
        publicUrl: null,
      },
    ]);
  });

  it("maps SMM Agent public blog posts into compact website preview items", async () => {
    state.publicPosts = [
      {
        title: "SMM Agent Should Draft Before It Publishes",
        slug: "smm-agent-draft-before-publish",
        excerpt: "Approval before mutation.",
        category: "Agent",
        publishedAt: "2026-06-29",
        imageUrl: "/blog/draft-before-publish.png",
        imageAlt: "Unused in the compact dashboard item",
        content: "Large article content should not cross into the dashboard payload.",
      },
    ];

    const result = await getArticleReviewDashboardData();

    expect(state.requestedHost).toBe("smmagent.app");
    expect(result.publicArticles).toEqual([
      {
        title: "SMM Agent Should Draft Before It Publishes",
        slug: "smm-agent-draft-before-publish",
        excerpt: "Approval before mutation.",
        category: "Agent",
        publishedAt: "2026-06-29",
        imageUrl: "/blog/draft-before-publish.png",
        publicUrl: "https://smmagent.app/blog/smm-agent-draft-before-publish",
      },
    ]);
    expect(result.publicArticles[0]).not.toHaveProperty("content");
  });
});
