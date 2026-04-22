import { createServerClient } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
const getUser = vi.fn();
const signOut = vi.fn();

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
  isSupabaseConfigured: vi.fn(() => true),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
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
});
