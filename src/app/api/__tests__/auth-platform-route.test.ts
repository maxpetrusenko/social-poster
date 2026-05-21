import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { cookieStore, getProvider } = vi.hoisted(() => ({
  cookieStore: {
    get: vi.fn(() => undefined),
    set: vi.fn(),
    delete: vi.fn(),
  },
  getProvider: vi.fn(),
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

afterEach(() => {
  vi.clearAllMocks();
});

describe("native OAuth platform route", () => {
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
});
