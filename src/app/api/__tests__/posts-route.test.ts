import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const insertValues = vi.fn().mockResolvedValue(undefined);
const insertMock = vi.fn().mockReturnValue({ values: insertValues });

vi.mock("@/db", () => ({
  db: {
    insert: insertMock,
  },
}));

vi.mock("@/lib/api-authorization", () => ({
  requireApiWorkspaceEditor: vi.fn().mockResolvedValue({
    currentWorkspace: { id: "workspace-1" },
    user: { id: "user-1" },
  }),
}));

vi.mock("@/lib/audit", () => ({
  recordTenantAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("posts create route", () => {
  it("stores source evidence fields in post metadata", async () => {
    const { POST } = await import("../posts/route");
    const request = new NextRequest("https://example.com/api/posts", {
      method: "POST",
      body: JSON.stringify({
        content: "Hello world",
        intent: "draft",
        sourceUrl: "https://example.com/article",
        sourceEvidenceId: "evidence-1",
        sourceEvidenceSnapshot: {
          sourceUrl: "https://example.com/article",
          title: "Source backed posting",
          summary: "A typed source evidence slice.",
          imageUrl: "https://example.com/card.png",
        },
      }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request);
    const body = (await response.json()) as Record<string, unknown>;
    const inserted = insertValues.mock.calls[0]?.[0] as Record<string, unknown> | undefined;

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      message: "Post created successfully",
    });
    expect(inserted?.metadata).toMatchObject({
      sourceEvidenceId: "evidence-1",
      sourceEvidenceSnapshot: {
        sourceUrl: "https://example.com/article",
        title: "Source backed posting",
        summary: "A typed source evidence slice.",
        imageUrl: "https://example.com/card.png",
      },
    });
  });
});
