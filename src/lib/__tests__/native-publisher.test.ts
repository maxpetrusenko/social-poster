import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({
  db: {
    update: vi.fn(),
  },
}));

import {
  publishViaNativeProvider,
  resolvePostUrl,
  shouldPublishViaNativeProvider,
} from "@/lib/providers/native-publisher";

describe("native publisher routing", () => {
  it("uses native X OAuth rows created before the auth method was renamed", () => {
    expect(
      shouldPublishViaNativeProvider({
        provider: "direct",
        type: "twitter",
        config: {
          authMethod: "twitter_native",
          credentials: {
            accessToken: "token",
            refreshToken: "refresh",
          },
        },
      })
    ).toBe(true);
  });

  it("uses current X OAuth rows", () => {
    expect(
      shouldPublishViaNativeProvider({
        provider: "direct",
        type: "twitter",
        config: {
          authMethod: "x_oauth",
          credentials: {
            accessToken: "token",
            refreshToken: "refresh",
          },
        },
      })
    ).toBe(true);
  });

  it("does not route Bird or Zernio X rows through native OAuth", () => {
    expect(
      shouldPublishViaNativeProvider({
        provider: "bird",
        type: "twitter",
        config: { authMethod: "bird_cli" },
      })
    ).toBe(false);

    expect(
      shouldPublishViaNativeProvider({
        provider: "zernio",
        type: "twitter",
        config: { authMethod: "late_account" },
      })
    ).toBe(false);
  });
});

describe("native publisher X media scope guard", () => {
  it("asks for reconnect when X media publishing lacks media.write", async () => {
    const result = await publishViaNativeProvider({
      platform: {
        id: "platform-1",
        provider: "direct",
        type: "twitter",
        accountId: "x-account",
        config: {
          authMethod: "twitter_native",
          credentials: {
            accessToken: "token",
            scope: "tweet.write users.read tweet.read offline.access",
          },
        },
      } as never,
      content: "Image post",
      mediaUrls: ["https://cdn.example.com/image.png"],
    });

    expect(result.success).toBe(false);
    expect(result.classification).toBe("auth_error");
    expect(result.error).toContain("media.write");
    expect(result.error).toContain("Reconnect");
  });
});

describe("native publisher X 403 classification", () => {
  it("classifies X duplicate-content 403 as duplicate, not auth_error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          detail: "You are not allowed to create a Tweet with duplicate content.",
          status: 403,
        }),
        { status: 403, headers: { "content-type": "application/json" } }
      )) as typeof fetch;
    try {
      const result = await publishViaNativeProvider({
        platform: {
          id: "platform-1",
          provider: "direct",
          type: "twitter",
          accountId: "x-account",
          config: {
            authMethod: "twitter_native",
            credentials: { accessToken: "token", scope: "tweet.write users.read" },
          },
        } as never,
        content: "Same text again",
      });
      expect(result.success).toBe(false);
      expect(result.classification).toBe("duplicate");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("Instagram story permalink", () => {
  const result = {
    platformPostId: "18043284359834744",
    url: "https://www.instagram.com/p/18043284359834744/",
  };

  it("builds a stories URL from the stored handle", () => {
    expect(
      resolvePostUrl("instagram", "story", result, {
        providerProfile: { handle: "@maxpetrusenko" },
      })
    ).toBe("https://www.instagram.com/stories/maxpetrusenko/18043284359834744/");
  });

  it("returns no URL for a story without a handle, never the /p/ link", () => {
    expect(resolvePostUrl("instagram", "story", result, {})).toBeUndefined();
    expect(resolvePostUrl("instagram", "story", result, null)).toBeUndefined();
  });

  it("keeps the feed URL for non-story posts", () => {
    expect(resolvePostUrl("instagram", "image", result, {})).toBe(result.url);
  });
});

describe("native publisher pre-publish failure classification", () => {
  const platform = {
    id: "platform-ig",
    provider: "direct",
    type: "instagram",
    accountId: "ig-account",
    config: {
      authMethod: "instagram_native",
      credentials: { accessToken: "token" },
      igUserId: "ig-user",
    },
  } as never;

  it("classifies an Instagram container ERROR (before media_publish) as provider_error", async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      const body = url.includes("/media")
        ? { id: "container-1" }
        : { status_code: "ERROR", status: "Unsupported image format" };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    try {
      const result = await publishViaNativeProvider({
        platform,
        content: "Bad image",
        mediaUrls: ["https://cdn.example.com/bad.jpg"],
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Instagram container failed");
      expect(result.classification).toBe("provider_error");
      expect(calls.some((url) => url.includes("media_publish"))).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
