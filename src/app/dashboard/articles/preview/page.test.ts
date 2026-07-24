import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.join(process.cwd(), "src/app/dashboard/articles/preview/page.tsx"),
  "utf8"
);

describe("article website preview page", () => {
  it("loads the live SMM Agent blog and keeps a direct-link fallback", () => {
    expect(source).toContain('const ARTICLE_SITE_URL = "https://smmagent.app/blog"');
    expect(source).toContain("<iframe");
    expect(source).toContain('src={ARTICLE_SITE_URL}');
    expect(source).toContain('href={ARTICLE_SITE_URL}');
    expect(source).toContain('target="_blank"');
    expect(source).toContain("Open smmagent.app");
    expect(source).toContain("(opens in new tab)");
    expect(source).toContain('aria-hidden="true"');
  });

  it("labels the embedded website for assistive technology", () => {
    expect(source).toContain('title="SMM Agent published articles"');
  });
});
