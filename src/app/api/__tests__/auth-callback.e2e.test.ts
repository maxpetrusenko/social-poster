import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
const getUser = vi.fn();
const signOut = vi.fn();
const isSupabaseConfigured = vi.fn(() => true);

vi.mock("server-only", () => ({}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      exchangeCodeForSession,
      getUser,
      signOut,
    },
  })),
}));

vi.mock("@/lib/supabase/config", () => ({
  getSupabaseServerEnv: vi.fn(() => ({
    url: "http://supabase-kong:8000",
    anonKey: "anon-key",
    storageKey: "sb-supabase-auth-token",
  })),
  isSupabaseConfigured,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
  isSupabaseConfigured.mockReturnValue(true);
});

describe("Supabase auth callback", () => {
  it("redirects any authenticated Google email to the requested dashboard path", async () => {
    vi.stubEnv("WORKSPACE_ALLOWED_EMAILS", "max.petrusenko@gmail.com");
    vi.stubEnv("WORKSPACE_ALLOWED_DOMAINS", "maxpetrusenko.com");
    vi.stubEnv("SUPABASE_AUTH_ALLOW_ALL_USERS", "false");
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({
      data: { user: { email: "customer@example.com" } },
    });

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      new NextRequest(
        "https://social.maxpetrusenko.com/auth/callback?code=ok&next=%2Fdashboard%2Fsettings"
      )
    );

    expect(response.headers.get("location")).toBe(
      "https://social.maxpetrusenko.com/dashboard/settings"
    );
    expect(createServerClient).toHaveBeenCalledWith(
      "http://supabase-kong:8000",
      "anon-key",
      expect.objectContaining({
        auth: { storageKey: "sb-supabase-auth-token" },
      })
    );
    expect(signOut).not.toHaveBeenCalled();
  });

  it("sanitizes auth callback next paths", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({
      data: { user: { email: "customer@example.com" } },
    });

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      new NextRequest(
        "https://social.maxpetrusenko.com/auth/callback?code=ok&next=%2Fauth%2Fcallback"
      )
    );

    expect(response.headers.get("location")).toBe(
      "https://social.maxpetrusenko.com/dashboard"
    );
  });

  it.each([
    "//evil.example/path",
    "/\\evil.example/path",
    "/login?next=%2Fdashboard",
    "/api/auth/logout",
  ])("rejects unsafe callback next path %s", async (nextPath) => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({
      data: { user: { email: "customer@example.com" } },
    });

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      new NextRequest(
        `https://smmagent.app/auth/callback?code=ok&next=${encodeURIComponent(nextPath)}`
      )
    );

    expect(response.headers.get("location")).toBe(
      "https://smmagent.app/dashboard"
    );
  });

  it("returns to login when the OAuth code is missing", async () => {
    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      new NextRequest(
        "https://smmagent.app/auth/callback?next=%2Fdashboard%2Fsettings"
      )
    );

    expect(response.headers.get("location")).toBe(
      "https://smmagent.app/login?error=oauth&next=%2Fdashboard%2Fsettings"
    );
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("returns a configuration error when Supabase is unavailable", async () => {
    isSupabaseConfigured.mockReturnValue(false);

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      new NextRequest(
        "https://smmagent.app/auth/callback?code=ok&next=%2Fdashboard"
      )
    );

    expect(response.headers.get("location")).toBe(
      "https://smmagent.app/login?error=missing-config&next=%2Fdashboard"
    );
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("returns to login when the provider exchange fails", async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: { message: "invalid oauth code" },
    });

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      new NextRequest(
        "https://smmagent.app/auth/callback?code=bad&next=%2Fdashboard"
      )
    );

    expect(response.headers.get("location")).toBe(
      "https://smmagent.app/login?error=oauth&next=%2Fdashboard"
    );
  });

  it("signs out a provider session with no usable email", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { email: "" } } });

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      new NextRequest(
        "https://smmagent.app/auth/callback?code=ok&next=%2Fdashboard"
      )
    );

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toBe(
      "https://smmagent.app/login?error=unauthorized&next=%2Fdashboard"
    );
  });
});
