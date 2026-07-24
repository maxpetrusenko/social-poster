import { describe, expect, it } from "vitest";

import { sanitizeAppNextPath } from "@/lib/safe-next-path";

describe("sanitizeAppNextPath", () => {
  it("keeps safe application-relative paths with query strings", () => {
    expect(
      sanitizeAppNextPath("/dashboard/posts?tab=drafts&return=%2Fdashboard")
    ).toBe("/dashboard/posts?tab=drafts&return=%2Fdashboard");
  });

  it.each([
    undefined,
    null,
    "",
    "dashboard",
    "https://evil.example/path",
    "//evil.example/path",
    "///evil.example/path",
    "/\\evil.example/path",
    "\\\\evil.example/path",
    "/auth",
    "/auth/callback",
    "/login",
    "/login?next=%2Fdashboard",
    "/api/auth/logout",
  ])("falls back for unsafe or looping next path %s", (candidate) => {
    expect(sanitizeAppNextPath(candidate)).toBe("/dashboard");
  });

  it("supports an explicit safe fallback", () => {
    expect(sanitizeAppNextPath("//evil.example", "/dashboard/posts")).toBe(
      "/dashboard/posts"
    );
  });
});
