import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const logout = vi.fn();

vi.mock("@/lib/auth", () => ({ logout }));

beforeEach(() => {
  logout.mockReset();
  logout.mockResolvedValue(undefined);
});

describe("auth logout", () => {
  it("returns to login with a safe internal continuation", async () => {
    const { POST } = await import("@/app/api/auth/logout/route");
    const response = await POST(
      new NextRequest(
        "https://smmagent.app/api/auth/logout?next=%2Finvite%2Finvite-token",
        { method: "POST" }
      )
    );

    expect(logout).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://smmagent.app/login?next=%2Finvite%2Finvite-token"
    );
  });

  it.each(["//evil.example/path", "/auth/callback", "/api/auth/logout"])(
    "drops unsafe continuation %s",
    async (nextPath) => {
      const { POST } = await import("@/app/api/auth/logout/route");
      const response = await POST(
        new NextRequest(
          `https://smmagent.app/api/auth/logout?next=${encodeURIComponent(nextPath)}`,
          { method: "POST" }
        )
      );

      expect(response.headers.get("location")).toBe(
        "https://smmagent.app/login"
      );
    }
  );
});
