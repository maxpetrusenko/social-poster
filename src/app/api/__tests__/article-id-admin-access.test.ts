import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  selectedRows: [] as Array<Record<string, unknown>>,
}));

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  requireApiWorkspaceEditor: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  updateWhere: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
    update: mocks.update,
  },
}));

vi.mock("@/lib/admin-auth", () => ({
  requireAdminApi: mocks.requireAdminApi,
}));

vi.mock("@/lib/api-authorization", () => ({
  requireApiWorkspaceEditor: mocks.requireApiWorkspaceEditor,
}));

vi.mock("@/lib/blog/framework", () => ({
  validateSourceOfTruthArticle: vi.fn(() => ({
    status: "pass",
    score: 110,
    checks: [],
  })),
}));

import { GET, PATCH } from "@/app/api/article/[id]/route";

const article = {
  id: "private",
  topic: "Article ownership",
  slug: "private",
  title: "Private article",
  excerpt: "Private.",
  category: "Agent",
  status: "draft",
  reviewStatus: "pending",
  publishStatus: "idle",
  directAnswer: "Only the creator or an admin can review this.",
  thesis: "Generated article access must be creator scoped.",
  contentMarkdown: "# Private article",
  heroImageUrl: null,
  heroImageAlt: null,
  sources: [],
  validationStatus: "pass",
  validationScore: 110,
  frameworkChecks: null,
  targetWords: 1200,
  mediumArticleId: null,
  mediumUrl: null,
  externalDraftPath: null,
  metadata: null,
  createdByEmail: "creator@example.com",
  createdAt: new Date("2026-07-17T12:00:00.000Z"),
  updatedAt: new Date("2026-07-17T12:00:00.000Z"),
};

describe("article id API creator access", () => {
  beforeEach(() => {
    state.selectedRows = [];
    mocks.requireAdminApi.mockReset();
    mocks.requireApiWorkspaceEditor.mockReset();
    mocks.select.mockReset();
    mocks.update.mockReset();
    mocks.updateWhere.mockReset();

    mocks.requireAdminApi.mockResolvedValue(null);
    mocks.requireApiWorkspaceEditor.mockResolvedValue({
      user: { email: "creator@example.com" },
    });
    mocks.select.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => state.selectedRows),
        })),
      })),
    }));
    mocks.update.mockImplementation(() => ({
      set: vi.fn(() => ({
        where: mocks.updateWhere.mockResolvedValue(undefined),
      })),
    }));
  });

  it("allows the creator to read their generated article", async () => {
    state.selectedRows = [article];

    const response = await GET(new Request("https://smmagent.app/api/article/private"), {
      params: Promise.resolve({ id: "private" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "private",
      title: "Private article",
    });
    expect(mocks.select).toHaveBeenCalledOnce();
  });

  it("returns 404 when another editor reads an article they do not own", async () => {
    mocks.requireApiWorkspaceEditor.mockResolvedValue({
      user: { email: "other@example.com" },
    });

    const response = await GET(new Request("https://smmagent.app/api/article/private"), {
      params: Promise.resolve({ id: "private" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Article not found" });
  });

  it("returns 404 before updating an article owned by another editor", async () => {
    mocks.requireApiWorkspaceEditor.mockResolvedValue({
      user: { email: "other@example.com" },
    });

    const response = await PATCH(
      new Request("https://smmagent.app/api/article/private", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Unauthorized edit" }),
      }),
      { params: Promise.resolve({ id: "private" }) }
    );

    expect(response.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("allows an admin to read legacy articles without creator ownership", async () => {
    mocks.requireAdminApi.mockResolvedValue({
      email: "max@example.com",
    });
    state.selectedRows = [{ ...article, createdByEmail: null }];

    const response = await GET(new Request("https://smmagent.app/api/article/private"), {
      params: Promise.resolve({ id: "private" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.requireApiWorkspaceEditor).not.toHaveBeenCalled();
  });

  it("allows the creator to update their generated article", async () => {
    state.selectedRows = [article];

    const response = await PATCH(
      new Request("https://smmagent.app/api/article/private", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Creator edit" }),
      }),
      { params: Promise.resolve({ id: "private" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.updateWhere).toHaveBeenCalledOnce();
  });
});
