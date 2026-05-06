import { describe, expect, it } from "vitest";
import { formatArticleMarkdownForMedium, splitMediumMarkdownBlocks } from "@/lib/article-agent/medium-format";

describe("formatArticleMarkdownForMedium", () => {
  it("applies Medium automation formatting without mutating code blocks", () => {
    const markdown = [
      "# Title",
      "",
      "![Hero](https://cdn.example.com/hero.jpg)",
      "",
      "![Local diagram](images/diagram.svg)",
      "",
      "## Section",
      "",
      "### Detail",
      "",
      "1. First step",
      "",
      "2. Second step with $5 outside and `$9` inside code",
      "",
      "> Definition block",
      "> continuation should stay same paragraph",
      "",
      "```ts",
      "const price = \"$5\";",
      "```",
    ].join("\n");

    const formatted = formatArticleMarkdownForMedium(markdown);

    expect(formatted).toContain("![Hero](https://cdn.example.com/hero.jpg)");
    expect(formatted).not.toContain("images/diagram.svg");
    expect(formatted).toContain("#### Detail");
    expect(formatted).toContain("- **1.** First step");
    expect(formatted).toContain("- **2.** Second step with \\$5 outside and `$9` inside code");
    expect(formatted).toContain("> Definition block continuation should stay same paragraph");
    expect(formatted).not.toContain("```text");
    expect(formatted).toContain("const price = \"$5\";");
    expect(formatted).not.toContain("## Section\n\n#### Detail");
  });

  it("converts markdown tables into atomic Medium paragraphs", () => {
    const markdown = [
      "| Claim | Evidence | Limit |",
      "| --- | --- | --- |",
      "| Hubble tension | JWST confirmed Cepheids | Teams still disagree |",
    ].join("\n");

    expect(formatArticleMarkdownForMedium(markdown)).toContain(
      "**Hubble tension** JWST confirmed Cepheids Teams still disagree"
    );
  });

  it("splits Medium-normalized markdown into preview/copy blocks", () => {
    const formatted = formatArticleMarkdownForMedium([
      "## Section",
      "",
      "Paragraph starts right after heading because Medium formatter removes that blank.",
      "",
      "> First wrapped quote line.",
      "> Second wrapped quote line.",
      "",
      "- **1.** Item",
    ].join("\n"));
    const blocks = splitMediumMarkdownBlocks(formatted);

    expect(blocks).toEqual([
      "## Section",
      "Paragraph starts right after heading because Medium formatter removes that blank.",
      "> First wrapped quote line. Second wrapped quote line.",
      "- **1.** Item",
    ]);
  });
});
