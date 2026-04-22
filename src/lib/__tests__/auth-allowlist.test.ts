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

  it("keeps missing emails blocked", async () => {
    const { isEmailAllowedForAuth } = await import("@/lib/auth-allowlist");

    await expect(isEmailAllowedForAuth(null)).resolves.toBe(false);
    await expect(isEmailAllowedForAuth("  ")).resolves.toBe(false);
  });
});
