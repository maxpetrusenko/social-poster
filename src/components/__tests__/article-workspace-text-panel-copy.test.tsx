import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/components/articles/article-workspace-text-panel.tsx"),
  "utf8"
);

describe("ArticleWorkspaceTextPanel Medium copy and hero image controls", () => {
  it("keeps one rich-copy icon in the top toolbar beside the hero image dropdown", () => {
    const actionsIndex = source.indexOf('data-testid="article-workspace-actions"');
    const copyIndex = source.indexOf("Copy rich text for Medium");
    const dropdownIndex = source.indexOf("HeroImageDropdown", actionsIndex);
    const markdownBlocksIndex = source.indexOf("{blocks.map((block, index) => renderMarkdownBlock");

    expect(actionsIndex).toBeGreaterThan(-1);
    expect(copyIndex).toBeGreaterThan(actionsIndex);
    expect(dropdownIndex).toBeGreaterThan(actionsIndex);
    expect(Math.abs(copyIndex - dropdownIndex)).toBeLessThan(4000);
    expect(copyIndex).toBeLessThan(markdownBlocksIndex);
    expect(source).not.toContain("Copy raw");
    expect(source).not.toContain("Copy Medium");
  });

  it("opens a model-backed dropdown with GPT and Gemini generate-image rows", () => {
    expect(source).toContain("heroImageMenuOpen");
    expect(source).toContain("setHeroImageMenuOpen");
    expect(source).toContain("/api/model-providers");
    expect(source).toContain("resolveConfiguredHeroImageOptions");
    expect(source).toContain("Open hero image generator menu");
    expect(source).toContain("GPT");
    expect(source).toContain("Gemini");
    expect(source).toContain("Generate image");
  });

  it("posts the selected provider when generating an article hero image", () => {
    expect(source).toContain("generateHeroImage(provider)");
    expect(source).toContain("JSON.stringify({ openRef, provider })");
  });

  it("copies rich HTML and plain text fallback through the clipboard API", () => {
    expect(source).toContain("fetch(`/api/article/fs?open=${encodeURIComponent(openRef)}`");
    expect(source).toContain("cache: \"no-store\"");
    expect(source).toContain("formatArticleForMediumClipboard(markdownToCopy)");
    expect(source).toContain("navigator.clipboard.write");
    expect(source).toContain("ClipboardItem");
    expect(source).toContain('"text/html"');
    expect(source).toContain('"text/plain"');
    expect(source).toContain("Copied rich text for Medium.");
    expect(source).toContain("copiedRichText");
  });

  it("uses the same Medium-normalized markdown in MD Preview", () => {
    expect(source).toContain("formatArticleMarkdownForMedium(markdown)");
    expect(source).toContain("splitMediumMarkdownBlocks");
  });
});
