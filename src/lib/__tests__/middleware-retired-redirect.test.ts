import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

function req(host: string, path: string) {
  return new NextRequest(`https://${host}${path}`, { headers: { "x-forwarded-host": host } });
}

afterEach(() => {
  delete process.env.RETIRED_DOMAIN_REDIRECT;
});

describe("retired domain redirect", () => {
  it("does nothing while RETIRED_DOMAIN_REDIRECT is unset", async () => {
    const res = await middleware(req("clawposter.app", "/blog?a=1"));
    expect(res.status).toBe(200);
  });

  it.each(["clawposter.app", "www.clawposter.app", "smmclaw.app", "www.smmclaw.app"])(
    "301s %s to smmagent.app keeping path and query when enabled",
    async (host) => {
      process.env.RETIRED_DOMAIN_REDIRECT = "1";
      const res = await middleware(req(host, "/blog/some-post?utm=x"));
      expect(res.status).toBe(301);
      expect(res.headers.get("location")).toBe("https://smmagent.app/blog/some-post?utm=x");
    }
  );

  it.each([
    "/api/webhooks/resend",
    "/api/auth/x/callback",
    "/auth/callback",
    "/social-accounts/callback/linkedin",
    "/health",
  ])("leaves %s alone on a retired host", async (path) => {
    process.env.RETIRED_DOMAIN_REDIRECT = "1";
    const res = await middleware(req("clawposter.app", path));
    expect(res.status).not.toBe(301);
  });

  it("does not redirect smmagent.app", async () => {
    process.env.RETIRED_DOMAIN_REDIRECT = "1";
    const res = await middleware(req("smmagent.app", "/blog"));
    expect(res.status).toBe(200);
  });
});
