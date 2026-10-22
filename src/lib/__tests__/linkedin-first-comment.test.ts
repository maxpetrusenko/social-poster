import { afterEach, describe, expect, it, vi } from "vitest";

import { LinkedInPersonalProvider } from "../providers/linkedin-personal";
import { resolvePlatformOverride } from "../post-publish-metadata";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockLinkedIn(commentResponse: () => Response) {
  const calls: Array<{ url: URL; init: RequestInit | undefined }> = [];
  globalThis.fetch = vi.fn(async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (url.pathname === "/v2/userinfo") return json({ sub: "m1", name: "Max" });
    if (url.pathname === "/rest/posts") {
      return new Response("", { headers: { "x-restli-id": "urn:li:share:77" } });
    }
    if (url.pathname.endsWith("/comments")) return commentResponse();
    return json({ message: `Unexpected ${url}` }, 500);
  }) as typeof fetch;
  return calls;
}

describe("LinkedIn firstComment", () => {
  it("posts the link as a comment by the author with id and url", async () => {
    const calls = mockLinkedIn(() =>
      json({ commentUrn: "urn:li:comment:(urn:li:activity:5,9)", id: "9" }, 201)
    );
    const result = await new LinkedInPersonalProvider().publishPost("tok", {
      text: "Short hook story",
      postType: "text",
      firstComment: "https://medium.com/p/abc",
    });

    const comment = calls.find((c) => c.url.pathname.endsWith("/comments"));
    expect(comment?.url.pathname).toBe("/rest/socialActions/urn%3Ali%3Ashare%3A77/comments");
    expect(JSON.parse(String(comment?.init?.body))).toEqual({
      actor: "urn:li:person:m1",
      object: "urn:li:share:77",
      message: { text: "https://medium.com/p/abc" },
    });
    const post = calls.find((c) => c.url.pathname === "/rest/posts");
    expect(JSON.parse(String(post?.init?.body)).commentary).toBe("Short hook story");
    expect(result.extra?.firstComment).toMatchObject({
      id: "urn:li:comment:(urn:li:activity:5,9)",
      url: expect.stringContaining("https://www.linkedin.com/feed/update/urn:li:share:77/?commentUrn="),
    });
    expect(result.extra?.firstCommentError).toBeUndefined();
  });

  it("falls back to the x-restli-id header when the body is empty", async () => {
    mockLinkedIn(() => new Response("", { status: 201, headers: { "x-restli-id": "555" } }));
    const result = await new LinkedInPersonalProvider().publishPost("tok", {
      text: "hi",
      postType: "text",
      firstComment: "https://medium.com/p/abc",
    });
    expect(result.extra?.firstComment).toMatchObject({ id: "555" });
  });

  it("keeps the main post when the comment is rejected", async () => {
    mockLinkedIn(() => json({ message: "ACCESS_DENIED" }, 403));
    const result = await new LinkedInPersonalProvider().publishPost("tok", {
      text: "hi",
      postType: "text",
      firstComment: "https://medium.com/p/abc",
    });
    expect(result.platformPostId).toBe("urn:li:share:77");
    expect(String(result.extra?.firstCommentError)).toContain("ACCESS_DENIED");
    expect(result.extra?.firstComment).toBeUndefined();
  });

  it("skips the comment call when firstComment is blank", async () => {
    const calls = mockLinkedIn(() => json({}, 201));
    await new LinkedInPersonalProvider().publishPost("tok", {
      text: "hi",
      postType: "text",
      firstComment: "   ",
    });
    expect(calls.some((c) => c.url.pathname.endsWith("/comments"))).toBe(false);
  });

  it("resolves a linkedin_personal override by platform type", () => {
    const override = resolvePlatformOverride(
      {
        platformOverrides: { linkedin_personal: { firstComment: "link" } },
      } as unknown as Parameters<typeof resolvePlatformOverride>[0],
      { id: "p1", type: "linkedin_personal" } as Parameters<typeof resolvePlatformOverride>[1]
    );
    expect(override.firstComment).toBe("link");
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
