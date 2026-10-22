import { NextRequest, NextResponse } from "next/server";
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

  it("outside production, ?debug=oauth is ignored on non-local origins", async () => {
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

  describe("production NODE_ENV", () => {
    const debugRequest = () =>
      new NextRequest("https://smmagent.app/api/auth/instagram?debug=oauth", {
        headers: { "x-forwarded-host": "smmagent.app", "x-forwarded-proto": "https" },
      });
    const params = { params: Promise.resolve({ platform: "instagram" }) };

    it("shows the exact redirectUri only to an authorized manager", async () => {
      vi.stubEnv("NODE_ENV", "production");
      getProvider.mockReturnValue({
        getAuthUrl: vi.fn(() => "https://www.instagram.com/oauth/authorize?client_id=x"),
      });
      const { GET } = await import("@/app/api/auth/[platform]/route");
      const response = await GET(debugRequest(), params);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ redirectUri: "https://smmagent.app/api/auth/callback" });
      vi.unstubAllEnvs();
    });

    it("leaks nothing when the caller is not authorized", async () => {
      vi.stubEnv("NODE_ENV", "production");
      const auth = await import("@/lib/api-authorization");
      vi.mocked(auth.requireApiWorkspaceManager).mockResolvedValueOnce(
        NextResponse.json({ error: "Authentication required" }, { status: 401 }) as never
      );
      const { GET } = await import("@/app/api/auth/[platform]/route");
      const response = await GET(debugRequest(), params);
      expect(response.status).toBe(401);
      expect(JSON.stringify(await response.json())).not.toContain("redirectUri");
      vi.unstubAllEnvs();
    });

    it("still redirects to Meta without the debug flag", async () => {
      vi.stubEnv("NODE_ENV", "production");
      getProvider.mockReturnValue({
        getAuthUrl: vi.fn(() => "https://www.instagram.com/oauth/authorize?client_id=x"),
      });
      const { GET } = await import("@/app/api/auth/[platform]/route");
      const response = await GET(
        new NextRequest("https://smmagent.app/api/auth/instagram", {
          headers: { "x-forwarded-host": "smmagent.app", "x-forwarded-proto": "https" },
        }),
        params
      );
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("instagram.com/oauth/authorize");
      vi.unstubAllEnvs();
    });
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

  it("sanitizes a trailing-dot next at OAuth start and callback", async () => {
    const { verifyOAuthState } = await import("@/lib/providers/oauth-state");
    getProvider.mockReturnValue({
      getAuthUrl: (_redirect: string, state: string) =>
        `https://www.instagram.com/oauth/authorize?state=${state}`,
    });
    const { GET } = await import("@/app/api/auth/[platform]/route");
    const res = await GET(
      new NextRequest(
        "https://social.maxpetrusenko.com/api/auth/instagram?next=" +
          encodeURIComponent("/dashboard/workspace-settings/social-accounts."),
        {
          headers: {
            "x-forwarded-proto": "https",
            "x-forwarded-host": "social.maxpetrusenko.com",
          },
        }
      ),
      { params: Promise.resolve({ platform: "instagram" }) }
    );
    const authUrl = new URL(res.headers.get("location") ?? "");
    const state = verifyOAuthState(authUrl.searchParams.get("state") ?? "");
    expect(state?.next).toBe("/dashboard/workspace-settings/social-accounts");

    const { handleNativeOAuthCallback } = await import(
      "@/lib/providers/oauth-callback"
    );
    for (const [next, expected] of [
      ["/dashboard/workspace-settings/social-accounts.", "/dashboard/workspace-settings/social-accounts"],
      ["/not/a/page", "/dashboard/workspace-settings/social-accounts"],
      ["https://evil.example/x", "/dashboard/workspace-settings/social-accounts"],
    ]) {
      const response = await handleNativeOAuthCallback(
        new NextRequest("https://social.maxpetrusenko.com/api/auth/callback?error=access_denied"),
        "instagram",
        { nonce: "n", platform: "instagram", timestamp: Date.now(), next }
      );
      const location = new URL(response.headers.get("location") ?? "");
      expect(location.origin).toBe("https://social.maxpetrusenko.com");
      expect(location.pathname).toBe(expected);
      expect(location.searchParams.get("error")).toBe("access_denied");
    }
  });
});
