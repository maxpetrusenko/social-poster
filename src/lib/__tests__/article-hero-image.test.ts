import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ modelProviderCredentials: {} }));
vi.mock("@/lib/model-provider-secrets", () => ({ decryptSecret: (value: string) => value }));
vi.mock("@/lib/model-provider-definitions", () => ({
  providerDefinition: () => ({ defaultBaseUrl: "https://generativelanguage.googleapis.com" }),
}));
vi.mock("@/lib/model-providers", () => ({ resolveWorkspaceModelConfig: vi.fn() }));

import { insertHeroImageMarkdown, resolveArticleLocation } from "@/lib/article-agent/hero-image";

describe("article hero image insertion", () => {
  it("inserts the hero image directly after the first article title", () => {
    const markdown = [
      "---",
      "",
      "I Let This AI Control My Mac",
      "Subtitle line.",
      "Body starts here.",
    ].join("\n");

    expect(insertHeroImageMarkdown(markdown, "![Hero](../artifacts/images/hero.png)")).toBe([
      "---",
      "",
      "I Let This AI Control My Mac",
      "",
      "![Hero](../artifacts/images/hero.png)",
      "",
      "Subtitle line.",
      "Body starts here.",
    ].join("\n"));
  });

  it("replaces an existing top hero instead of stacking duplicate hero images", () => {
    const markdown = [
      "# Article Title",
      "![Old hero](../artifacts/images/old.png)",
      "Subtitle line.",
    ].join("\n");

    expect(insertHeroImageMarkdown(markdown, "![New hero](../artifacts/images/new.png)")).toBe([
      "# Article Title",
      "",
      "![New hero](../artifacts/images/new.png)",
      "",
      "Subtitle line.",
    ].join("\n"));
  });

  it("keeps real YAML frontmatter above title and hero image", () => {
    const markdown = [
      "---",
      "title: Real Title",
      "tags:",
      "  - ai",
      "---",
      "# Article Title",
      "Body starts here.",
    ].join("\n");

    expect(insertHeroImageMarkdown(markdown, "![Hero](../artifacts/images/hero.png)")).toBe([
      "---",
      "title: Real Title",
      "tags:",
      "  - ai",
      "---",
      "# Article Title",
      "",
      "![Hero](../artifacts/images/hero.png)",
      "",
      "Body starts here.",
    ].join("\n"));
  });
});

describe("article hero image path resolution", () => {
  it("supports versioned article folders", () => {
    expect(
      resolveArticleLocation(
        "/workspace/articles",
        "example-topic/v001/article.md",
        "/workspace/articles/example-topic/v001/article.md"
      )
    ).toEqual({
      articleRootRelativePath: "example-topic",
      articleRootAbsolutePath: "/workspace/articles/example-topic",
      versionSlug: "v001",
    });
  });

  it("supports flat article-vN markdown packages", () => {
    expect(
      resolveArticleLocation(
        "/workspace/articles",
        "example-topic/article-v1.md",
        "/workspace/articles/example-topic/article-v1.md"
      )
    ).toEqual({
      articleRootRelativePath: "example-topic",
      articleRootAbsolutePath: "/workspace/articles/example-topic",
      versionSlug: "v1",
    });
  });

  it("rejects prompt markdown files inside article folders", () => {
    expect(() =>
      resolveArticleLocation(
        "/workspace/articles",
        "example-topic/prompts/article-generation-prompt.md",
        "/workspace/articles/example-topic/prompts/article-generation-prompt.md"
      )
    ).toThrow(/Open an article file/);
  });
});
