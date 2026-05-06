import { describe, expect, it } from "vitest";
import { formatArticleForMediumClipboard } from "@/lib/article-agent/medium-rich-text";

describe("formatArticleForMediumClipboard", () => {
  it("writes Medium-ready html with a plain markdown fallback", () => {
    const result = formatArticleForMediumClipboard([
      "# Title",
      "",
      "![Hero](https://cdn.example.com/hero.jpg)",
      "",
      "![Local](images/local.svg)",
      "",
      "## Section",
      "",
      "### Detail",
      "",
      "> The Hubble tension is a live disagreement between two ways of measuring the universe's expansion rate.",
      "> Early-universe measurements using the cosmic microwave background predict about 67.4 km/s/Mpc, while local distance-ladder measurements find about 73 km/s/Mpc.",
      "> Webb did not solve the gap. It made simple Hubble telescope error harder to blame.",
      "",
      "A paragraph with **bold** and [source](https://example.com).",
      "",
      "1. First",
    ].join("\n"));

    expect(result.plainText).toContain("#### Detail");
    expect(result.plainText).not.toContain("images/local.svg");
    expect(result.html).toContain("<!--StartFragment-->");
    expect(result.html).toContain("<h1>Title</h1>");
    expect(result.html).toContain('<img src="https://cdn.example.com/hero.jpg" alt="Hero">');
    expect(result.html).toContain("<h4>Detail</h4>");
    expect(result.html).toContain("<blockquote><p>The Hubble tension is a live disagreement between two ways of measuring the universe's expansion rate. Early-universe measurements using the cosmic microwave background predict about 67.4 km/s/Mpc, while local distance-ladder measurements find about 73 km/s/Mpc. Webb did not solve the gap. It made simple Hubble telescope error harder to blame.</p></blockquote>");
    expect(result.html).not.toContain("<pre><code>The Hubble tension");
    expect(result.html).toContain('<a href="https://example.com">source</a>');
    expect(result.html).toContain("<strong>bold</strong>");
    expect(result.html).toContain("<li><strong>1.</strong> First</li>");
    expect(result.html).not.toContain("images/local.svg");
  });
});
