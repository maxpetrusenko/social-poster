import { describe, expect, it } from "vitest";

import { sanitizeAppNextPath, sanitizeOAuthReturnPath } from "@/lib/safe-next-path";

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

describe("sanitizeOAuthReturnPath", () => {
  const SOCIAL = "/dashboard/workspace-settings/social-accounts";

  it("strips trailing punctuation copied from chat text", () => {
    expect(sanitizeOAuthReturnPath(`${SOCIAL}.`)).toBe(SOCIAL);
    expect(sanitizeOAuthReturnPath(`${SOCIAL},`)).toBe(SOCIAL);
    expect(sanitizeOAuthReturnPath(`${SOCIAL})`)).toBe(SOCIAL);
    expect(sanitizeOAuthReturnPath(`${SOCIAL}.?connect=1`)).toBe(
      `${SOCIAL}?connect=1`
    );
  });

  it("keeps known routes with queries", () => {
    expect(sanitizeOAuthReturnPath("/dashboard/platforms?x=1")).toBe(
      "/dashboard/platforms?x=1"
    );
  });

  it("falls back to social accounts for unknown paths", () => {
    expect(sanitizeOAuthReturnPath("/dashboard/nope")).toBe(SOCIAL);
    expect(sanitizeOAuthReturnPath("/pricing")).toBe(SOCIAL);
    expect(sanitizeOAuthReturnPath(undefined)).toBe(SOCIAL);
  });

  it.each([
    "https://evil.example/dashboard/platforms",
    "//evil.example",
    "/\\evil.example",
    "/login",
  ])("rejects external or looping target %s", (candidate) => {
    expect(sanitizeOAuthReturnPath(candidate)).toBe(SOCIAL);
  });
});
