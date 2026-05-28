import { afterEach, describe, expect, it, vi } from "vitest";

import { InstagramPersonalProvider } from "./instagram-personal.ts";

type FetchCall = {
  url: URL;
  init: RequestInit | undefined;
};

type FetchHandler = (call: FetchCall) => Response | Promise<Response>;

describe("InstagramPersonalProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the current Instagram authorization host", () => {
    const provider = providerForTest();

    const url = new URL(
      provider.getAuthUrl("https://app.example/callback", "state")
    );

    expect(url.origin).toBe("https://www.instagram.com");
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("ig-app-id");
    expect(url.searchParams.get("enable_fb_login")).toBe("0");
    expect(url.searchParams.has("force_reauth")).toBe(false);
    expect(url.searchParams.has("force_authentication")).toBe(false);
    expect(url.searchParams.get("scope")).toBe(provider.requiredScopes.join(","));
  });

  it("advertises Instagram publish capabilities and limits", () => {
    const provider = providerForTest();

    expect(provider.supportedPostTypes).toEqual([
      "image",
      "carousel",
      "reel",
      "story",
    ]);
    expect(provider.supportedMediaTypes).toContain("mp4");
    expect(provider.rateLimits.publishPerDay).toBe(100);
  });

  it("exchanges short-lived tokens at the documented GET long-lived token endpoint", async () => {
    const { calls } = mockFetch(({ url }) => {
      if (url.origin === "https://api.instagram.com") {
        return jsonResponse({
          access_token: "short-token",
          user_id: "scoped-user-id",
        });
      }

      return jsonResponse({
        access_token: "long-token",
        token_type: "bearer",
        expires_in: 5_183_944,
      });
    });
    const provider = providerForTest();

    const tokens = await provider.exchangeCode(
      "auth-code",
      "https://app.example/callback"
    );

    expect(tokens.accessToken).toBe("long-token");
    expect(calls[0].url.toString()).toBe(
      "https://api.instagram.com/oauth/access_token"
    );
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[1].url.origin).toBe("https://graph.instagram.com");
    expect(calls[1].url.pathname).toBe("/access_token");
    expect(calls[1].init?.method).toBe("GET");
    expect(calls[1].url.searchParams.get("grant_type")).toBe("ig_exchange_token");
    expect(calls[1].url.searchParams.get("access_token")).toBe("short-token");
  });

  it("falls back to POST when Instagram rejects GET long-lived token exchange", async () => {
    const { calls } = mockFetch(({ url, init }) => {
      if (url.origin === "https://api.instagram.com") {
        return jsonResponse({
          access_token: "short-token",
          user_id: "scoped-user-id",
        });
      }
      if (init?.method === "GET") {
        return jsonResponse(
          {
            error: {
              message: "Unsupported request - method type: get",
              type: "IGApiException",
              code: 100,
            },
          },
          400
        );
      }

      return jsonResponse({
        access_token: "long-token",
        token_type: "bearer",
        expires_in: 5_183_944,
      });
    });
    const provider = providerForTest();

    const tokens = await provider.exchangeCode(
      "auth-code",
      "https://app.example/callback"
    );

    expect(tokens.accessToken).toBe("long-token");
    expect(calls[1].init?.method).toBe("GET");
    expect(calls[2].init?.method).toBe("POST");
    const longLivedBody = new URLSearchParams(String(calls[2].init?.body));
    expect(longLivedBody.get("grant_type")).toBe("ig_exchange_token");
    expect(longLivedBody.get("access_token")).toBe("short-token");
  });

  it("falls back to POST when Instagram treats GET /access_token as an object request", async () => {
    const { calls } = mockFetch(({ url, init }) => {
      if (url.origin === "https://api.instagram.com") {
        return jsonResponse({
          access_token: "short-token",
          user_id: "scoped-user-id",
        });
      }
      if (init?.method === "GET") {
        return jsonResponse(
          {
            error: {
              message:
                "Unsupported post request. Object with ID 'access_token' does not exist, cannot be loaded due to missing permissions, or does not support this operation",
              type: "IGApiException",
              code: 100,
              error_subcode: 33,
            },
          },
          400
        );
      }

      return jsonResponse({
        access_token: "long-token",
        token_type: "bearer",
        expires_in: 5_183_944,
      });
    });
    const provider = providerForTest();

    const tokens = await provider.exchangeCode(
      "auth-code",
      "https://app.example/callback"
    );

    expect(tokens.accessToken).toBe("long-token");
    expect(calls[1].init?.method).toBe("GET");
    expect(calls[2].init?.method).toBe("POST");
    const longLivedBody = new URLSearchParams(String(calls[2].init?.body));
    expect(longLivedBody.get("grant_type")).toBe("ig_exchange_token");
    expect(longLivedBody.get("access_token")).toBe("short-token");
  });

  it("keeps the connection when Instagram rejects both long-lived token exchange methods", async () => {
    const { calls } = mockFetch(({ url, init }) => {
      if (url.origin === "https://api.instagram.com") {
        return jsonResponse({
          access_token: "short-token",
          user_id: "scoped-user-id",
          expires_in: 3600,
          permissions: "instagram_business_basic",
        });
      }
      if (init?.method === "GET") {
        return jsonResponse(
          {
            error: {
              message: "Unsupported request - method type: get",
              type: "IGApiException",
              code: 100,
            },
          },
          400
        );
      }
      if (init?.method === "POST") {
        return jsonResponse(
          {
            error: {
              message:
                "Unsupported post request. Object with ID 'access_token' does not exist, cannot be loaded due to missing permissions, or does not support this operation",
              type: "IGApiException",
              code: 100,
              error_subcode: 33,
            },
          },
          400
        );
      }

      return jsonResponse({});
    });
    const provider = providerForTest();

    const tokens = await provider.exchangeCode(
      "auth-code",
      "https://app.example/callback"
    );

    expect(tokens.accessToken).toBe("short-token");
    expect(tokens.refreshToken).toBeUndefined();
    expect(tokens.expiresIn).toBe(3600);
    expect(tokens.scope).toBe("instagram_business_basic");
    expect(tokens.raw?.long_lived_token_exchange).toMatchObject({
      status: "skipped",
    });
    expect(calls[1].init?.method).toBe("GET");
    expect(calls[2].init?.method).toBe("POST");
  });

  it("rejects token exchange responses missing a short-lived token", async () => {
    mockFetch(() => jsonResponse({ user_id: "scoped-user-id" }));
    const provider = providerForTest();

    await expect(
      provider.exchangeCode("auth-code", "https://app.example/callback")
    ).rejects.toThrow("Instagram token exchange failed");
  });

  it("rejects long-lived token responses missing an access token", async () => {
    mockFetch(({ url }) => {
      if (url.origin === "https://api.instagram.com") {
        return jsonResponse({ access_token: "short-token" });
      }

      return jsonResponse({ token_type: "bearer", expires_in: 5_183_944 });
    });
    const provider = providerForTest();

    await expect(
      provider.exchangeCode("auth-code", "https://app.example/callback")
    ).rejects.toThrow("Instagram long-lived token exchange failed");
  });

  it("refreshes long-lived tokens with Instagram refresh token params", async () => {
    const { calls } = mockFetch(() =>
      jsonResponse({
        access_token: "refreshed-token",
        token_type: "bearer",
        expires_in: 5_183_944,
      })
    );
    const provider = providerForTest();

    const tokens = await provider.refreshToken("existing-long-token");

    expect(tokens.accessToken).toBe("refreshed-token");
    expect(tokens.refreshToken).toBe("refreshed-token");
    expect(calls).toHaveLength(1);
    expect(calls[0].init?.method).toBe("GET");
    expect(calls[0].url.origin).toBe("https://graph.instagram.com");
    expect(calls[0].url.pathname).toBe("/refresh_access_token");
    expect(calls[0].url.searchParams.get("grant_type")).toBe(
      "ig_refresh_token"
    );
    expect(calls[0].url.searchParams.get("access_token")).toBe(
      "existing-long-token"
    );
  });

  it("defaults refreshed token metadata when Instagram omits optional fields", async () => {
    mockFetch(() => jsonResponse({ access_token: "refreshed-token" }));
    const provider = providerForTest();

    const tokens = await provider.refreshToken("existing-long-token");

    expect(tokens).toMatchObject({
      accessToken: "refreshed-token",
      refreshToken: "refreshed-token",
      tokenType: "Bearer",
    });
    expect(tokens.expiresIn).toBeUndefined();
    expect(tokens.scope).toBeUndefined();
  });

  it("sends Graph access tokens as query params", async () => {
    const { calls } = mockFetch(() =>
      jsonResponse({
        user_id: "ig-user-id",
        username: "max",
        name: "Max",
      })
    );
    const provider = providerForTest();

    const profile = await provider.getProfile("profile-token");

    expect(profile.platformId).toBe("ig-user-id");
    expect(profile.handle).toBe("max");
    expect(calls[0].url.pathname).toBe("/v25.0/me");
    expect(calls[0].url.searchParams.get("access_token")).toBe("profile-token");
    expect(calls[0].url.searchParams.get("fields")).toBe(
      "id,user_id,username,account_type,name,profile_picture_url"
    );
    expect(new Headers(calls[0].init?.headers).get("authorization")).toBeNull();
  });

  it("falls back to profile id and username when optional profile fields are absent", async () => {
    mockFetch(() =>
      jsonResponse({
        id: "graph-id",
        username: "creator",
        followers_count: "not-a-number",
      })
    );
    const provider = providerForTest();

    const profile = await provider.getProfile("profile-token");

    expect(profile).toMatchObject({
      platformId: "graph-id",
      name: "creator",
      handle: "creator",
      followerCount: 0,
    });
    expect(profile.avatarUrl).toBeUndefined();
  });

  it("keeps profile avatar and numeric follower count when Instagram returns them", async () => {
    mockFetch(() =>
      jsonResponse({
        user_id: "ig-user-id",
        username: "max",
        name: "Max",
        profile_picture_url: "https://cdn.example.com/avatar.jpg",
        followers_count: 1234,
      })
    );
    const provider = providerForTest();

    const profile = await provider.getProfile("profile-token");

    expect(profile).toMatchObject({
      platformId: "ig-user-id",
      name: "Max",
      handle: "max",
      avatarUrl: "https://cdn.example.com/avatar.jpg",
      followerCount: 1234,
    });
  });

  it("publishes image posts with image_url and caption payload", async () => {
    const { calls } = mockInstagramPublishFetch();
    const provider = providerForTest();

    const result = await provider.publishPost("publish-token", {
      text: "Launch day",
      postType: "image",
      mediaUrls: ["https://cdn.example.com/image.jpg"],
    });

    expect(result.platformPostId).toBe("published-media-1");
    expect(result.url).toBe("https://www.instagram.com/p/published-media-1/");
    expect(jsonBody(calls[0])).toEqual({
      caption: "Launch day",
      image_url: "https://cdn.example.com/image.jpg",
    });
    expect(calls[0].url.searchParams.get("access_token")).toBe("publish-token");
    expect(jsonBody(calls[2])).toEqual({ creation_id: "container-1" });
  });

  it("publishes story images with STORIES image payload", async () => {
    const { calls } = mockInstagramPublishFetch();
    const provider = providerForTest();

    await provider.publishPost("publish-token", {
      text: "Story image",
      postType: "story",
      mediaUrls: ["https://cdn.example.com/story.png"],
    });

    expect(jsonBody(calls[0])).toEqual({
      caption: "Story image",
      media_type: "STORIES",
      image_url: "https://cdn.example.com/story.png",
    });
  });

  it("publishes story videos with STORIES video payload", async () => {
    const { calls } = mockInstagramPublishFetch();
    const provider = providerForTest();

    await provider.publishPost("publish-token", {
      text: "Story video",
      postType: "story",
      mediaUrls: ["https://cdn.example.com/story.mp4"],
    });

    expect(jsonBody(calls[0])).toEqual({
      caption: "Story video",
      media_type: "STORIES",
      video_url: "https://cdn.example.com/story.mp4",
    });
  });

  it("publishes reels with REELS video payload", async () => {
    const { calls } = mockInstagramPublishFetch();
    const provider = providerForTest();

    await provider.publishPost("publish-token", {
      text: "",
      postType: "reel",
      mediaUrls: ["https://cdn.example.com/reel.mov"],
    });

    expect(jsonBody(calls[0])).toEqual({
      media_type: "REELS",
      video_url: "https://cdn.example.com/reel.mov",
    });
  });

  it("publishes carousels with child and container payloads", async () => {
    const { calls } = mockInstagramPublishFetch();
    const provider = providerForTest();

    await provider.publishPost("publish-token", {
      text: "Carousel caption",
      postType: "carousel",
      mediaUrls: [
        "https://cdn.example.com/first.jpg",
        "https://cdn.example.com/second.mp4",
      ],
    });

    expect(jsonBody(calls[0])).toEqual({
      is_carousel_item: true,
      image_url: "https://cdn.example.com/first.jpg",
    });
    expect(jsonBody(calls[2])).toEqual({
      is_carousel_item: true,
      media_type: "VIDEO",
      video_url: "https://cdn.example.com/second.mp4",
    });
    expect(jsonBody(calls[4])).toEqual({
      caption: "Carousel caption",
      media_type: "CAROUSEL",
      children: "container-1,container-2",
    });
    expect(jsonBody(calls[6])).toEqual({ creation_id: "container-3" });
  });

  it("rejects when a container reports ERROR status", async () => {
    mockInstagramPublishFetch({
      statusForContainer: () => ({
        status_code: "ERROR",
        status: "Unsupported image format",
      }),
    });
    const provider = providerForTest();

    await expect(
      provider.publishPost("publish-token", {
        text: "Bad image",
        postType: "image",
        mediaUrls: ["https://cdn.example.com/bad.jpg"],
      })
    ).rejects.toThrow("Instagram container failed: Unsupported image format");
  });

  it("uses an unknown error fallback when container ERROR has no status text", async () => {
    mockInstagramPublishFetch({
      statusForContainer: () => ({
        status_code: "ERROR",
      }),
    });
    const provider = providerForTest();

    await expect(
      provider.publishPost("publish-token", {
        text: "Bad image",
        postType: "image",
        mediaUrls: ["https://cdn.example.com/bad.jpg"],
      })
    ).rejects.toThrow("Instagram container failed: unknown error");
  });

  it("rejects when Instagram does not return a media container id", async () => {
    mockFetch(({ url, init }) => {
      if (url.pathname === "/v25.0/me/media" && init?.method === "POST") {
        return jsonResponse({});
      }

      return jsonResponse({ status_code: "FINISHED" });
    });
    const provider = providerForTest();

    await expect(
      provider.publishPost("publish-token", {
        text: "No container id",
        postType: "image",
        mediaUrls: ["https://cdn.example.com/image.jpg"],
      })
    ).rejects.toThrow("Failed to create Instagram media container");
  });

  it("returns no URL when Instagram publishes without a media id", async () => {
    const { calls } = mockInstagramPublishFetch({
      publishBody: () => ({}),
    });
    const provider = providerForTest();

    const result = await provider.publishPost("publish-token", {
      text: "Published but no id",
      postType: "image",
      mediaUrls: ["https://cdn.example.com/image.jpg"],
    });

    expect(result.platformPostId).toBe("");
    expect(result.url).toBeUndefined();
    expect(jsonBody(calls[2])).toEqual({ creation_id: "container-1" });
  });

  it("waits for pending containers before publishing", async () => {
    vi.useFakeTimers();
    let pollCount = 0;
    const { calls } = mockInstagramPublishFetch({
      statusForContainer: () =>
        pollCount++ === 0
          ? { status_code: "IN_PROGRESS" }
          : { status_code: "FINISHED" },
    });
    const provider = providerForTest();

    try {
      const publish = provider.publishPost("publish-token", {
        text: "Pending image",
        postType: "image",
        mediaUrls: ["https://cdn.example.com/image.jpg"],
      });

      await vi.advanceTimersByTimeAsync(2000);
      await publish;
    } finally {
      vi.useRealTimers();
    }

    expect(calls.filter((call) => call.init?.method === "GET")).toHaveLength(2);
  });

  it("times out when Instagram never finishes processing a container", async () => {
    vi.useFakeTimers();
    mockInstagramPublishFetch({
      statusForContainer: () => ({ status_code: "IN_PROGRESS" }),
    });
    const provider = providerForTest();

    try {
      const publish = expect(
        provider.publishPost("publish-token", {
          text: "Stuck image",
          postType: "image",
          mediaUrls: ["https://cdn.example.com/image.jpg"],
        })
      ).rejects.toThrow("Instagram container processing timed out");

      await vi.advanceTimersByTimeAsync(121_000);
      await publish;
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects publish requests without media before calling Instagram", async () => {
    const { fetchMock } = mockFetch(() => jsonResponse({}));
    const provider = providerForTest();

    await expect(
      provider.publishPost("publish-token", {
        text: "No media",
        postType: "image",
        mediaUrls: [],
      })
    ).rejects.toThrow("Instagram requires at least one media item");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("can send Graph requests without access token query params", async () => {
    const { calls } = mockFetch(() => jsonResponse({ ok: true }));
    const provider = providerForTest() as unknown as {
      requestInstagramGraphJson<T>(
        method: string,
        url: string
      ): Promise<T>;
    };

    await provider.requestInstagramGraphJson<Record<string, unknown>>(
      "GET",
      "https://graph.instagram.com/v25.0/me"
    );

    expect(calls[0].url.searchParams.has("access_token")).toBe(false);
  });
});

function providerForTest() {
  return new InstagramPersonalProvider({
    clientId: "ig-app-id",
    clientSecret: "ig-app-secret",
  });
}

function mockFetch(handler: FetchHandler) {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: new URL(String(input)), init };
    calls.push(call);
    return handler(call);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

function mockInstagramPublishFetch(options?: {
  statusForContainer?: (
    containerId: string
  ) => Record<string, string> | undefined;
  publishBody?: () => Record<string, unknown>;
}) {
  let nextContainerId = 1;
  let nextPublishId = 1;

  return mockFetch(({ url, init }) => {
    if (url.pathname === "/v25.0/me/media" && init?.method === "POST") {
      return jsonResponse({ id: `container-${nextContainerId++}` });
    }

    if (url.pathname === "/v25.0/me/media_publish" && init?.method === "POST") {
      return jsonResponse(
        options?.publishBody?.() ?? { id: `published-media-${nextPublishId++}` }
      );
    }

    const containerMatch = url.pathname.match(/^\/v25\.0\/([^/]+)$/);
    if (containerMatch && init?.method === "GET") {
      return jsonResponse(
        options?.statusForContainer?.(containerMatch[1]) ?? {
          status_code: "FINISHED",
        }
      );
    }

    return jsonResponse({});
  });
}

function jsonBody(call: FetchCall) {
  return JSON.parse(String(call.init?.body));
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
