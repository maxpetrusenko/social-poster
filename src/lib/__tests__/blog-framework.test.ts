import { describe, expect, it } from "vitest";

import {
  buildReviewFallbackDraft,
  countWords,
  validateSourceOfTruthArticle,
} from "@/lib/blog/framework";

describe("source-of-truth article framework", () => {
  it("requires a 40-60 word answer block immediately after the title", () => {
    const draft = buildReviewFallbackDraft({
      topic: "AI social scheduling",
      sourceUrls: [
        "https://developers.google.com/search/docs",
        "https://schema.org/Article",
        "https://www.w3.org/WAI/",
      ],
    });

    expect(countWords(draft.directAnswer)).toBeGreaterThanOrEqual(40);
    expect(countWords(draft.directAnswer)).toBeLessThanOrEqual(60);

    const validation = validateSourceOfTruthArticle(draft);
    const answerPosition = validation.checks.find((check) => check.key === "direct_answer_position");
    expect(answerPosition?.status).toBe("pass");
  });

  it("fails publish readiness when primary sources or image are missing", () => {
    const draft = buildReviewFallbackDraft({ topic: "AI social scheduling" });
    const validation = validateSourceOfTruthArticle({
      ...draft,
      heroImageUrl: null,
      contentMarkdown: draft.contentMarkdown.replace(/!\[[^\]]*]\([^)]+\)\n\n/, ""),
      sources: [],
    });

    expect(validation.status).toBe("fail");
    expect(validation.checks.find((check) => check.key === "primary_sources")?.status).toBe("fail");
    expect(validation.checks.find((check) => check.key === "hero_image")?.status).toBe("fail");
  });

  it("hard fails forbidden editor phrases", () => {
    const draft = buildReviewFallbackDraft({
      topic: "AI social scheduling",
      sourceUrls: [
        "https://developers.google.com/search/docs",
        "https://schema.org/Article",
        "https://www.w3.org/WAI/",
      ],
    });

    const validation = validateSourceOfTruthArticle({
      ...draft,
      contentMarkdown: `${draft.contentMarkdown}\n\nThis isn't mysticism. It's also not settled science. It's something more interesting.`,
    });

    expect(validation.status).toBe("fail");
    expect(validation.checks.find((check) => check.key === "forbidden_phrases")?.status).toBe("fail");
  });

  it("accepts anti-slop takeaway and action sections as framework coverage", () => {
    const directAnswer =
      "Ghost Murmur is a sensor claim that sounds plausible because quantum magnetometry is real, but long-range heartbeat tracking fails under magnetic-field physics. The useful lesson is narrower: diamond magnetometers may help navigation, while biometric detection at kilometer range remains unsupported by public evidence.";
    const validation = validateSourceOfTruthArticle({
      topic: "Ghost Murmur",
      title: "Could the CIA Really Track Your Heartbeat From Kilometers Away?",
      excerpt: "A physics check.",
      category: "Science",
      directAnswer,
      thesis: "Physics narrows the claim.",
      heroImageUrl: "https://example.com/hero.jpg",
      heroImageAlt: "Hero",
      targetWords: 1200,
      sources: [
        { title: "A", url: "https://example.com/a" },
        { title: "B", url: "https://example.com/b" },
        { title: "C", url: "https://example.com/c" },
      ],
      contentMarkdown: `# Could the CIA Really Track Your Heartbeat From Kilometers Away?

> ${directAnswer}

## Reality Contact

The limitation is distance.

## What to Remember

- One
- Two
- Three
- Four

## Actions to Take

**Primary Action**
Check the propagation law.

**Secondary Actions**
- Check noise.
- Check source evidence.
`,
    });

    expect(validation.checks.find((check) => check.key === "faq_graph")?.status).toBe("pass");
    expect(validation.checks.find((check) => check.key === "actionability")?.status).toBe("pass");
  });
});
