import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const upsertEvidence = vi.fn().mockResolvedValue({ id: "evidence-1" });

vi.mock("@/lib/api-authorization", () => ({
  requireApiWorkspaceEditor: vi.fn().mockResolvedValue({
    currentWorkspace: { id: "workspace-1" },
  }),
}));

vi.mock("@/lib/safe-remote-fetch", () => ({
  isSafeRemoteHttpUrl: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/sources/evidence-store.server", () => ({
  sourceEvidenceStore: {
    upsertEvidence,
  },
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("post-generation url route", () => {
  it("persists source evidence and returns the evidence snapshot", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        `
        <html>
          <head>
            <title>Source backed posting</title>
            <meta name="description" content="A typed source evidence slice.">
            <meta property="og:image" content="/card.png">
          </head>
          <body><article><p>Body copy.</p></article></body>
        </html>
        `,
        {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("../post-generation/url/route");
    const request = new NextRequest("https://example.com/api/post-generation/url", {
      method: "POST",
      body: JSON.stringify({ url: "https://example.com/article?z=1" }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      source: "url",
      sourceUrl: "https://example.com/article?z=1",
      title: "Source backed posting",
      summary: "A typed source evidence slice.",
      imageUrl: "https://example.com/card.png",
      sourceEvidenceId: "evidence-1",
      sourceEvidenceSnapshot: {
        sourceUrl: "https://example.com/article?z=1",
        title: "Source backed posting",
        summary: "A typed source evidence slice.",
        imageUrl: "https://example.com/card.png",
      },
    });

    expect(upsertEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        candidate: expect.objectContaining({
          type: "url",
          title: "Source backed posting",
          summary: "A typed source evidence slice.",
          url: "https://example.com/article?z=1",
          externalId: "https://example.com/article?z=1",
        }),
      })
    );
  });
});
