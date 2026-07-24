import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(() => undefined) })),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  unstable_rethrow: vi.fn(),
}));

vi.mock("@/lib/auth-config", () => ({
  AUTH_MODE: "supabase",
  BYPASS_SIGNED_OUT_COOKIE: "sp_bypass_signed_out",
  getAuthConfigError: vi.fn(() => null),
  isBypassSignedOutCookieValue: vi.fn(() => false),
}));

vi.mock("@/lib/supabase/config", () => ({
  getSupabasePublicEnv: vi.fn(() => ({
    url: "https://supabase.example",
    anonKey: "anon",
  })),
  getWorkspaceAuthErrorMessage: vi.fn(() => null),
  isSupabaseConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
  })),
}));

vi.mock("@/lib/auth-allowlist", () => ({
  isEmailAllowedForAuth: vi.fn(async (email?: string | null) =>
    Boolean(email?.trim())
  ),
}));

vi.mock("@/components/auth/google-sign-in-button", () => ({
  GoogleSignInButton: () => null,
}));

vi.mock("@/components/auth/unauthorized-session-reset", () => ({
  UnauthorizedSessionReset: () => null,
}));

vi.mock("@/components/login-form", () => ({
  LoginForm: () => null,
}));

afterEach(() => {
  mocks.getUser.mockReset();
  mocks.redirect.mockClear();
  vi.resetModules();
});

describe("login page", () => {
  it("describes sign-in as open access instead of a private app", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/login/page.tsx"),
      "utf8"
    );

    expect(source).toContain(">Open Access<");
    expect(source).not.toContain("Private App");
  });

  it("returns an existing session to a safe requested page", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { email: "customer@example.com" } },
    });

    const { default: LoginPage } = await import("@/app/login/page");

    await expect(
      LoginPage({
        searchParams: Promise.resolve({ next: "/invite/invite-token" }),
      })
    ).rejects.toThrow("redirect:/invite/invite-token");
  });

  it.each(["//evil.example/path", "/\\evil.example/path", "/login"])(
    "returns an existing session to the dashboard for unsafe next path %s",
    async (nextPath) => {
      mocks.getUser.mockResolvedValue({
        data: { user: { email: "customer@example.com" } },
      });

      const { default: LoginPage } = await import("@/app/login/page");

      await expect(
        LoginPage({ searchParams: Promise.resolve({ next: nextPath }) })
      ).rejects.toThrow("redirect:/dashboard");
    }
  );

  it("renders sign-in when there is no provider session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const { default: LoginPage } = await import("@/app/login/page");
    const result = await LoginPage({ searchParams: Promise.resolve({}) });

    expect(result).toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("renders sign-in when the provider session check fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.getUser.mockRejectedValue(new Error("provider unavailable"));

    const { default: LoginPage } = await import("@/app/login/page");
    const result = await LoginPage({ searchParams: Promise.resolve({}) });

    expect(result).toBeTruthy();
    expect(warn).toHaveBeenCalledWith(
      "Supabase login session check failed:",
      "provider unavailable"
    );
  });
});
