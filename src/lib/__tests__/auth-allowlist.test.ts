import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("auth access", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("allows any non-empty authenticated email", async () => {
    const { isEmailAllowedForAuth } = await import("@/lib/auth-allowlist");

    await expect(isEmailAllowedForAuth("new.customer@example.com")).resolves.toBe(
      true
    );
  });

  it("ignores removed workspace allowlist variables", async () => {
    vi.stubEnv("WORKSPACE_ALLOWED_EMAILS", "max.petrusenko@gmail.com");
    vi.stubEnv("WORKSPACE_ALLOWED_DOMAINS", "maxpetrusenko.com");
    vi.stubEnv("SUPABASE_AUTH_ALLOW_ALL_USERS", "false");

    const { isEmailAllowedForAuth } = await import("@/lib/auth-allowlist");

    await expect(isEmailAllowedForAuth("customer@example.com")).resolves.toBe(
      true
    );
  });

  it("keeps missing emails blocked", async () => {
    const { isEmailAllowedForAuth } = await import("@/lib/auth-allowlist");

    await expect(isEmailAllowedForAuth(null)).resolves.toBe(false);
    await expect(isEmailAllowedForAuth("  ")).resolves.toBe(false);
  });
});
