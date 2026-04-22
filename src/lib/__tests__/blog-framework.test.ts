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
});
