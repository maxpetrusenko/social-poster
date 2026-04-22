import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/db", () => ({
  db: {},
}));

vi.mock("@/db/schema", () => ({
  orgMemberships: {},
  users: {},
  workspaceInvitations: {},
}));

describe("auth allowlist", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("allows any authenticated Supabase email when open sign-in is enabled", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_AUTH_ALLOW_ALL_USERS", "true");

    const { isEmailAllowedForAuth } = await import("@/lib/auth-allowlist");

    await expect(isEmailAllowedForAuth("new.customer@example.com")).resolves.toBe(
      true
    );
  });

  it("keeps missing emails blocked", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_AUTH_ALLOW_ALL_USERS", "true");

    const { isEmailAllowedForAuth } = await import("@/lib/auth-allowlist");

    await expect(isEmailAllowedForAuth(null)).resolves.toBe(false);
  });
});
