import { afterEach, describe, expect, it, vi } from "vitest";

import { LinkedInProvider } from "../providers/linkedin";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("LinkedIn video publishing", () => {
  it("sends fileSizeBytes when initializing a video upload", async () => {
    const calls: Array<{ url: URL; init: RequestInit | undefined }> = [];
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = new URL(String(input));
      calls.push({ url, init });

      if (url.hostname === "cdn.example.com") {
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          headers: { "Content-Type": "video/mp4" },
        });
      }

      if (url.pathname === "/v2/userinfo") {
        return jsonResponse({ sub: "member-123", name: "Max" });
      }

      if (url.pathname === "/rest/videos") {
        if (url.searchParams.get("action") === "initializeUpload") {
          return jsonResponse({
            value: {
              uploadInstructions: [
                {
                  uploadUrl: "https://upload.linkedin.example/video",
                  firstByte: 0,
                  lastByte: 3,
                },
              ],
              uploadToken: "",
              video: "urn:li:video:abc",
            },
          });
        }

        if (url.searchParams.get("action") === "finalizeUpload") {
          return new Response("");
        }
      }

      if (url.hostname === "upload.linkedin.example") {
        return new Response("", {
          headers: { etag: '"part-1"' },
        });
      }

      if (url.pathname === "/rest/posts") {
        return new Response("", {
          headers: { "x-restli-id": "urn:li:share:123" },
        });
      }

      if (url.pathname === "/rest/socialActions/urn%3Ali%3Ashare%3A123/comments") {
        return jsonResponse({
          commentUrn: "urn:li:comment:123",
          message: { text: "Source: https://x.com/source/status/1" },
        });
      }

      return jsonResponse({ message: `Unexpected URL ${url.toString()}` }, 500);
    });

    const provider = new LinkedInProvider();
    await provider.publishPost("token", {
      text: "Video post",
      postType: "video",
      mediaUrls: ["https://cdn.example.com/video.mp4"],
      firstComment: "Source: https://x.com/source/status/1",
    });

    const initialize = calls.find((call) => call.url.pathname === "/rest/videos");
    expect(JSON.parse(String(initialize?.init?.body))).toEqual({
      initializeUploadRequest: {
        owner: "urn:li:person:member-123",
        fileSizeBytes: 4,
      },
    });

    const finalize = calls.find(
      (call) =>
        call.url.pathname === "/rest/videos" &&
        call.url.searchParams.get("action") === "finalizeUpload"
    );
    expect(JSON.parse(String(finalize?.init?.body))).toEqual({
      finalizeUploadRequest: {
        video: "urn:li:video:abc",
        uploadToken: "",
        uploadedPartIds: ["part-1"],
      },
    });

    const comment = calls.find((call) =>
      call.url.pathname.endsWith("/comments")
    );
    expect(JSON.parse(String(comment?.init?.body))).toEqual({
      actor: "urn:li:person:member-123",
      object: "urn:li:share:123",
      message: { text: "Source: https://x.com/source/status/1" },
    });
  });

  it("keeps the video publish successful when the source comment is denied", async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = new URL(String(input));

      if (url.hostname === "cdn.example.com") {
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          headers: { "Content-Type": "video/mp4" },
        });
      }

      if (url.pathname === "/v2/userinfo") {
        return jsonResponse({ sub: "member-123", name: "Max" });
      }

      if (url.pathname === "/rest/videos") {
        if (url.searchParams.get("action") === "initializeUpload") {
          return jsonResponse({
            value: {
              uploadInstructions: [
                {
                  uploadUrl: "https://upload.linkedin.example/video",
                  firstByte: 0,
                  lastByte: 3,
                },
              ],
              uploadToken: "",
              video: "urn:li:video:abc",
            },
          });
        }

        if (url.searchParams.get("action") === "finalizeUpload") {
          return new Response("");
        }
      }

      if (url.hostname === "upload.linkedin.example") {
        return new Response("", {
          headers: { etag: '"part-1"' },
        });
      }

      if (url.pathname === "/rest/posts") {
        return new Response("", {
          headers: { "x-restli-id": "urn:li:share:123" },
        });
      }

      if (url.pathname === "/rest/socialActions/urn%3Ali%3Ashare%3A123/comments") {
        return jsonResponse(
          {
            status: 403,
            serviceErrorCode: 100,
            code: "ACCESS_DENIED",
            message: "Not enough permissions to access: partnerApiSocialActions.CREATE.20260401",
          },
          403
        );
      }

      return jsonResponse({ message: `Unexpected URL ${url.toString()}` }, 500);
    });

    const provider = new LinkedInProvider();
    const result = await provider.publishPost("token", {
      text: "Video post",
      postType: "video",
      mediaUrls: ["https://cdn.example.com/video.mp4"],
      firstComment: "Source: https://x.com/source/status/1",
    });

    expect(result).toMatchObject({
      platformPostId: "urn:li:share:123",
      url: "https://www.linkedin.com/feed/update/urn:li:share:123/",
      extra: {
        urn: "urn:li:share:123",
        videoUrn: "urn:li:video:abc",
      },
    });
    expect(result.extra?.firstCommentError).toContain("ACCESS_DENIED");
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
