import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/components/articles/article-workspace.tsx"),
  "utf8"
);

describe("ArticleWorkspace quality panel", () => {
  it("surfaces article rating feedback when an article file is open", () => {
    expect(source).toContain("findArticleForPreview(preview, articles)");
    expect(source).toContain("ArticleFileQualityPanel");
    expect(source).toContain("Medium automation pipeline");
    expect(source).toContain("Next improvement:");
    expect(source).toContain("Pros");
    expect(source).toContain("Cons");
    expect(source).toContain("Open pipeline memory");
  });

  it("persists collapsed file tree directories locally", () => {
    expect(source).toContain("COLLAPSED_DIRECTORY_STORAGE_KEY");
    expect(source).toContain("readStoredOpenRefSet");
    expect(source).toContain("writeStoredOpenRefSet");
  });
});
