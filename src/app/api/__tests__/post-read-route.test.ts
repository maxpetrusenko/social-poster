import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  tenant: null as unknown,
  postRow: undefined as Record<string, unknown> | undefined,
  targetRows: [] as Array<Record<string, unknown>>,
  postWhere: undefined as unknown,
}));

vi.mock("@/lib/api-authorization", () => ({
  requireApiWorkspaceEditor: vi.fn(),
  requireApiWorkspaceManagerRead: vi.fn(async () => state.tenant),
}));
vi.mock("@/db", () => ({
  db: {
    select: (cols: Record<string, unknown>) => {
      const isPost = "publishedAt" in cols && !("platformId" in cols);
      return {
        from: () => ({
          where: (cond: unknown) => {
            if (isPost) {
              state.postWhere = cond;
              return { get: async () => state.postRow };
            }
            return Promise.resolve(state.targetRows);
          },
          innerJoin: () => ({ where: async () => state.targetRows }),
        }),
      };
    },
  },
}));

const SECRET = ["sk", "test", "secret"].join("_");
const req = () => new NextRequest("https://example.com/api/posts/p1");
const ctx = { params: Promise.resolve({ id: "p1" }) };

describe("GET /api/posts/[id]", () => {
  beforeEach(() => {
    state.tenant = { currentWorkspace: { id: "w1" } };
    state.postRow = undefined;
    state.targetRows = [];
  });

  it("returns post status and per-target outcome, including a failed first comment", async () => {
    state.postRow = { id: "p1", status: "published", publishedAt: new Date("2026-10-22T16:24:30Z"), content: SECRET };
    state.targetRows = [
      {
        platformId: "pl1", platformType: "linkedin_personal", status: "published",
        publishedUrl: "https://www.linkedin.com/feed/update/urn:li:share:1/", platformPostId: "urn:li:share:1",
        firstCommentId: null, firstCommentUrl: null, firstCommentError: "403 ACCESS_DENIED", error: null,
        publishedAt: new Date("2026-10-22T16:24:30Z"), config: { credentials: SECRET },
      },
    ];
    const { GET } = await import("@/app/api/posts/[id]/route");
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain(SECRET);
    const body = JSON.parse(text);
    expect(body.status).toBe("published");
    expect(Object.keys(body.targets[0]).sort()).toEqual([
      "error", "first_comment_error", "first_comment_id", "first_comment_url", "platform_id", "platform_post_id",
      "platform_type", "published_at", "published_url", "status",
    ]);
    expect(body.targets[0].published_url).toContain("urn:li:share:1");
    expect(body.targets[0].first_comment_error).toBe("403 ACCESS_DENIED");
  });

  it("404s for a post outside the workspace", async () => {
    const { GET } = await import("@/app/api/posts/[id]/route");
    expect((await GET(req(), ctx)).status).toBe(404);
  });

  it("passes through auth failures", async () => {
    state.tenant = NextResponse.json({ error: "no" }, { status: 401 });
    const { GET } = await import("@/app/api/posts/[id]/route");
    expect((await GET(req(), ctx)).status).toBe(401);
  });
});
