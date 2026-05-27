import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { cookieStore, getProvider, upsertPlatformConnection } = vi.hoisted(() => ({
  cookieStore: {
    get: vi.fn((): { value: string } | undefined => undefined),
    set: vi.fn(),
    delete: vi.fn(),
  },
  getProvider: vi.fn(),
  upsertPlatformConnection: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
}));

vi.mock("@/lib/api-authorization", () => ({
  requireApiWorkspaceManager: vi.fn().mockResolvedValue({
    currentWorkspace: { id: "workspace-1" },
    user: { id: "user-1" },
  }),
}));

vi.mock("@/lib/providers/registry", () => ({
  getProvider,
}));

vi.mock("@/lib/platform-connections", () => ({
  upsertPlatformConnection,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("native OAuth platform route", () => {
  it("returns local Instagram OAuth diagnostics without redirecting", async () => {
    getProvider.mockReturnValue({
      getAuthUrl: vi.fn((redirectUri: string, state: string) => {
        const authUrl = new URL("https://www.facebook.com/v21.0/dialog/oauth");
        authUrl.searchParams.set("client_id", "instagram-client");
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("state", state);
        return authUrl.toString();
      }),
    });

    const { GET } = await import("@/app/api/auth/[platform]/route");
    const response = await GET(
      new NextRequest("https://127.0.0.1:3000/api/auth/instagram?debug=oauth", {
        headers: {
          "x-forwarded-proto": "https",
          "x-forwarded-host": "127.0.0.1:3000",
        },
      }),
      { params: Promise.resolve({ platform: "instagram" }) }
    );
    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      authUrl: string;
      redirectUri: string;
    };
    const authUrl = new URL(body.authUrl);

    expect(body.redirectUri).toBe("https://127.0.0.1:3000/api/auth/callback");
    expect(authUrl.searchParams.get("redirect_uri")).toBe(body.redirectUri);
    expect(response.headers.get("location")).toBeNull();
    expect(cookieStore.set).toHaveBeenCalledWith(
      "sp_native_oauth",
      expect.any(String),
      expect.objectContaining({ httpOnly: true, sameSite: "lax" })
    );
  });

  it("blocks unsupported local HTTP Instagram OAuth", async () => {
    const { GET } = await import("@/app/api/auth/[platform]/route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/auth/instagram"),
      { params: Promise.resolve({ platform: "instagram" }) }
    );
    const location = response.headers.get("location");

    expect(response.status).toBe(307);
    expect(location).toContain("Instagram+local+OAuth");
    expect(location).toContain("https%3A%2F%2F127.0.0.1%3A3000");
    expect(getProvider).not.toHaveBeenCalled();
  });

  it("does not expose Instagram OAuth diagnostics on non-local origins", async () => {
    getProvider.mockReturnValue({
      getAuthUrl: vi.fn(() => "https://www.facebook.com/v21.0/dialog/oauth"),
    });

    const { GET } = await import("@/app/api/auth/[platform]/route");
    const response = await GET(
      new NextRequest(
        "https://social.maxpetrusenko.com/api/auth/instagram?debug=oauth"
      ),
      { params: Promise.resolve({ platform: "instagram" }) }
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).not.toBeNull();
    expect(response.headers.get("content-type") ?? "").not.toContain(
      "application/json"
    );
  });

  it("blocks legacy Instagram Personal direct OAuth starts", async () => {
    const { GET } = await import("@/app/api/auth/[platform]/route");
    const response = await GET(
      new NextRequest("https://social.maxpetrusenko.com/api/auth/instagram-personal"),
      { params: Promise.resolve({ platform: "instagram-personal" }) }
    );
    const location = response.headers.get("location");

    expect(response.status).toBe(307);
    expect(location).toContain(
      "/dashboard/workspace-settings/social-accounts"
    );
    expect(location).toContain("Instagram+Personal+direct+OAuth");
    expect(location).toContain("Managed+relay");
    expect(getProvider).not.toHaveBeenCalled();
  });

  it("blocks stale Instagram Personal direct OAuth callbacks", async () => {
    const { handleNativeOAuthCallback } = await import(
      "@/lib/providers/oauth-callback"
    );
    const response = await handleNativeOAuthCallback(
      new NextRequest(
        "https://social.maxpetrusenko.com/api/auth/callback?code=ok"
      ),
      "instagram_personal",
      {
        nonce: "nonce-1",
        platform: "instagram_personal",
        timestamp: Date.now(),
        next: "/dashboard/workspace-settings/social-accounts",
      }
    );
    const location = response.headers.get("location");

    expect(response.status).toBe(307);
    expect(location).toContain(
      "/dashboard/workspace-settings/social-accounts"
    );
    expect(location).toContain("Instagram+Personal+direct+OAuth");
    expect(location).toContain("Managed+relay");
    expect(cookieStore.delete).toHaveBeenCalledWith("sp_native_oauth");
    expect(getProvider).not.toHaveBeenCalled();
  });

  it("accepts an older Instagram callback after a newer OAuth start overwrote the top-level nonce", async () => {
    const {
      appendNativeOAuthCookieFlow,
      encodeNativeOAuthCookie,
      signOAuthState,
    } = await import("@/lib/providers/oauth-state");
    const firstState = {
      nonce: "first-nonce",
      platform: "instagram",
      timestamp: Date.now(),
      next: "/dashboard/workspace-settings/social-accounts",
    };
    const cookie = appendNativeOAuthCookieFlow(
      appendNativeOAuthCookieFlow(null, {
        nonce: firstState.nonce,
        codeVerifier: "first-verifier",
        redirectUri: "https://social.maxpetrusenko.com/api/auth/callback",
        timestamp: firstState.timestamp,
      }),
      {
        nonce: "second-nonce",
        codeVerifier: "second-verifier",
        redirectUri: "https://social.maxpetrusenko.com/api/auth/callback",
        timestamp: firstState.timestamp + 1,
      },
      firstState.timestamp + 1
    );
    cookieStore.get.mockReturnValue({
      value: encodeNativeOAuthCookie(cookie),
    });
    getProvider.mockReturnValue({
      platformName: "Instagram",
      exchangeCode: vi.fn().mockResolvedValue({
        accessToken: "token",
        tokenType: "Bearer",
      }),
      getProfile: vi.fn().mockResolvedValue({
        platformId: "ig-user-1",
        name: "Customer IG",
        handle: "customer",
      }),
    });
    upsertPlatformConnection.mockResolvedValue({ created: true });

    const { GET } = await import("@/app/api/auth/callback/route");
    const response = await GET(
      new NextRequest(
        `https://social.maxpetrusenko.com/api/auth/callback?code=ok&state=${signOAuthState(firstState)}`
      )
    );
    const location = response.headers.get("location");

    expect(location).toContain("connected=instagram");
    expect(upsertPlatformConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        accountId: "ig-user-1",
      })
    );
    expect(cookieStore.delete).not.toHaveBeenCalledWith("sp_native_oauth");
    expect(cookieStore.set).toHaveBeenCalledWith(
      "sp_native_oauth",
      expect.any(String),
      expect.objectContaining({ httpOnly: true, sameSite: "lax" })
    );
  });
});
