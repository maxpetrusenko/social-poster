import { describe, expect, it } from "vitest";
import { BUYER_PAGES } from "@/lib/seo/buyer-pages";
import { variantMetaContent } from "@/lib/seo-flags";

describe("seo_h006 buyer pages", () => {
  it("puts the keyword in H1 and first sentence, title <= 60 chars with brand last", () => {
    for (const p of BUYER_PAGES) {
      expect(p.h1.toLowerCase()).toContain(p.keyword.toLowerCase().replace(/^ai /, ""));
      expect(p.intro.toLowerCase()).toContain(p.keyword.toLowerCase());
      expect(p.title.length).toBeLessThanOrEqual(60);
      expect(p.title.endsWith("SMM Agent")).toBe(true);
      expect(p.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });
  it("has unique slugs and reports h006 as a site flag", () => {
    expect(new Set(BUYER_PAGES.map((p) => p.slug)).size).toBe(BUYER_PAGES.length);
    expect(variantMetaContent("/for/x")).toMatch(/h006=s/);
  });
});
