import { describe, expect, it, vi } from "vitest";

const mocks = {
  host: "clawposter.app",
};

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-host": mocks.host }),
}));

import robots from "@/app/robots";

describe("robots.txt sitemap host", () => {
  // The bug this locks down (measured live 2026-09-18): every public host
  // advertised https://clawposter.app/sitemap.xml, so a crawler on smmagent.app
  // was handed another brand's URL list.
  it("advertises the sitemap on the host being crawled", async () => {
    for (const host of ["clawposter.app", "smmclaw.app", "smmagent.app"]) {
      mocks.host = host;
      const result = await robots();
      expect(result.sitemap).toBe(`https://${host}/sitemap.xml`);
    }
  });

  it("resolves a www host to its canonical public host", async () => {
    mocks.host = "www.smmagent.app";
    await expect(robots()).resolves.toMatchObject({
      sitemap: "https://smmagent.app/sitemap.xml",
    });

    mocks.host = "www.clawposter.app";
    await expect(robots()).resolves.toMatchObject({
      sitemap: "https://clawposter.app/sitemap.xml",
    });
  });

  it("keeps the crawler rules it had before the host fix", async () => {
    mocks.host = "smmagent.app";
    const result = await robots();
    expect(result.rules).toMatchObject([
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
      },
    ]);
  });
});
