import { describe, expect, it, vi } from "vitest";

const mocks = {
  host: "clawposter.app",
};

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-host": mocks.host }),
}));

import robots from "@/app/robots";

describe("robots.txt sitemap host", () => {
  // Retired hosts still resolve until the redirect is on; none may advertise
  // its own sitemap.
  it("always advertises the smmagent.app sitemap", async () => {
    for (const host of ["clawposter.app", "smmclaw.app", "smmagent.app", "www.smmagent.app", "www.clawposter.app"]) {
      mocks.host = host;
      const result = await robots();
      expect(result.sitemap).toBe("https://smmagent.app/sitemap.xml");
    }
  });

  it("keeps the crawler rules it had before the host fix", async () => {
    mocks.host = "smmagent.app";
    const result = await robots();
    expect((result.rules as unknown[])[0]).toMatchObject(
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/api/",
          "/auth/",
          "/dashboard/",
          "/invite/",
          "/login",
          "/health",
          "/social-accounts/",
        ],
      }
    );
  });
});

describe("robots.txt AI crawler group (seo_h005_ai_crawlers)", () => {
  it("allows AI crawlers and repeats the private disallows", async () => {
    mocks.host = "smmagent.app";
    const result = await robots();
    const rules = result.rules as Array<{ userAgent: string | string[]; disallow: string[] }>;
    const ai = rules.find((r) => Array.isArray(r.userAgent));
    expect(ai?.userAgent).toEqual(
      expect.arrayContaining(["GPTBot", "ClaudeBot", "PerplexityBot", "Googlebot", "DuckAssistBot"])
    );
    expect(ai?.disallow).toEqual(expect.arrayContaining(["/admin/", "/api/", "/dashboard/", "/auth/"]));
  });
});
