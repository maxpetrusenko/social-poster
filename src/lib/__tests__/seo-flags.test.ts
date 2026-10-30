import { describe, expect, it } from "vitest";
import {
  variantMap,
  fnv1a32,
  isVariant,
  normalizePath,
  variantMetaContent,
} from "@/lib/seo-flags";

describe("seo flags", () => {
  it("fnv1a32 is stable", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
    expect(fnv1a32("seo_h003_titles:/docs")).toBe(
      fnv1a32("seo_h003_titles:/docs")
    );
  });

  it("normalizes paths", () => {
    expect(normalizePath("/Docs/?x=1")).toBe("/docs");
    expect(normalizePath("/blog/")).toBe("/blog");
    expect(normalizePath("")).toBe("/");
  });

  it("never varies the homepage", () => {
    expect(isVariant("seo_h003_titles", "/")).toBe(false);
    expect(isVariant("seo_h022_internal_links", "/")).toBe(false);
  });

  it("puts both arms in play across 20 sample paths", () => {
    const paths = Array.from({ length: 20 }, (_, i) => `/blog/sample-post-${i}`);
    const arms = new Set(paths.map((p) => isVariant("seo_h022_internal_links", p)));
    expect(arms).toEqual(new Set([true, false]));
  });

  it("emits a meta string with site flags as s", () => {
    const meta = variantMetaContent("/docs");
    expect(meta).toMatch(/h005=s/);
    expect(meta).toMatch(/h003=[vc]/);
  });

  it("reports none where no treatment renders", () => {
    expect(variantMap("/privacy").h003).toBe("none");
    expect(variantMap("/docs").h015).toBe("none");
    expect(variantMap("/blog/some-post").h014).toBe("none");
    expect(variantMap("/blog/category/agent").h022).toBe("none");
    expect(variantMap("/blog/some-post").h022).toMatch(/variant|control/);
    expect(variantMap("/social-media-bot").h003).toMatch(/variant|control/);
  });
});
