import { describe, expect, it } from "vitest";
import {
  mergeArticleEvolutionSummaries,
  parseArticleOverviewMarkdown,
  parseRatingMarkdown,
  summarizeFrameworkEvalRecord,
  summarizeSourceRecord,
  summarizeWorkflowRecord,
} from "@/lib/article-agent/evolution";

describe("article evolution parsing", () => {
  it("extracts rating, evaluator scores, counts, and phase log from overview markdown", () => {
    const overview = `---
title: Inside Mount Kailash
rating: 8.2/10
gemini: 8.2/10
gpt: 8.3/10
word_count: 1637
evidence_count: 19
iterations: 3
---

| Step | Status | Time | Cost | LLM/Tool | Rating | Notes |
|------|--------|------|------|----------|--------|-------|
| 5_rate_iter1 | completed | 31.6s | - | - | 7.1/10 | Rating iteration 1 |
| 5_rate_iter2 | completed | 40.5s | - | - | 8.2/10 | Rating iteration 2 |

**TOTAL** | ✅ | 8.2min | $0.036 | | Consensus: 8.2/10 | |
`;

    expect(parseArticleOverviewMarkdown(overview)).toEqual(
      expect.objectContaining({
        rating: 8.2,
        ratingMax: 10,
        iterations: 3,
        evidenceCount: 19,
        wordCount: 1637,
        totalCost: 0.036,
        evaluatorScores: expect.arrayContaining([
          { label: "gemini", score: 8.2, maxScore: 10 },
          { label: "gpt", score: 8.3, maxScore: 10 },
        ]),
      })
    );
    expect(parseArticleOverviewMarkdown(overview).phaseLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "5_rate_iter1", rating: 7.1, notes: "Rating iteration 1" }),
      ])
    );
  });

  it("extracts latest rating feedback sections for agent-readable evolution", () => {
    const rating = `## V2 Rating

**Timestamp:** 2025-12-03T09:05:15.364Z

### Gemini-3-pro-preview

**Score:** 7.8/10

**Strengths:**
- Excellent claim-vs-reality structure

**Weaknesses:**
- Title-content mismatch

**Improvements:**
- Rewrite title as investigation
- Add skepticism earlier

**Overall Feedback:** Strong substance, but the title promises validation while the piece debunks.

**Biggest Problem:** Title delivery.

---

## V3 Rating

### Gpt-5.1

**Score:** 8.4/10

**Strengths:**
- Strong argument

**Weaknesses:**
- Soft conclusion

**Improvements:**
- Tighten the conclusion

**Overall Feedback:** Publishable after conclusion tightening.

**Biggest Problem:** Ending is soft.
`;

    expect(parseRatingMarkdown(rating)).toEqual(
      expect.objectContaining({
        rating: 8.4,
        ratingMax: 10,
        feedbackSummary: "Publishable after conclusion tightening.",
        biggestProblem: "Ending is soft.",
        improvementSummary: "Tighten the conclusion",
        pros: ["Strong argument"],
        cons: ["Soft conclusion"],
        evaluatorScores: expect.arrayContaining([{ label: "Gpt-5.1", score: 8.4, maxScore: 10 }]),
      })
    );
  });

  it("summarizes article rating eval JSON into model, pros, and cons", () => {
    const summary = summarizeFrameworkEvalRecord({
      kind: "article-rating",
      provider: "gemini",
      model: "gemini-3.1-pro-preview",
      score: 8.8,
      maxScore: 10,
      rating: {
        strengths: ["Clear argument"],
        weaknesses: ["Soft conclusion"],
        improvements: ["Tighten ending"],
        overallFeedback: "Strong draft.",
        biggestProblem: "Ending.",
      },
    });

    expect(summary).toEqual(
      expect.objectContaining({
        rating: 8.8,
        ratingMax: 10,
        ratingModel: "gemini-3.1-pro-preview",
        ratingProvider: "gemini",
        pros: ["Clear argument"],
        cons: ["Soft conclusion"],
        improvementSummary: "Tighten ending",
      })
    );
  });

  it("summarizes workflow cost, tokens, phase ratings, and merge precedence", () => {
    const workflow = {
      totalCost: 0.03574625,
      totalTokens: 16636,
      consensus: "8.2/10",
      phases: [
        { name: "2_research", status: "completed", notes: "19 evidence pieces", model: "gemini-2.5-pro" },
        { name: "5_rate_iter1", status: "completed", notes: "Rating iteration 1", rating: 7.1 },
        { name: "5_rate_iter2", status: "completed", notes: "Rating iteration 2", rating: 8.2 },
      ],
    };

    const merged = mergeArticleEvolutionSummaries(
      summarizeWorkflowRecord(workflow),
      { feedbackSummary: "Final feedback", rating: 8.3, ratingMax: 10 }
    );

    expect(merged).toEqual(
      expect.objectContaining({
        rating: 8.3,
        ratingMax: 10,
        totalCost: 0.03574625,
        totalTokens: 16636,
        feedbackSummary: "Final feedback",
      })
    );
    expect(merged.phaseLog).toHaveLength(3);
    expect(merged.phaseLog?.[2]).toEqual(expect.objectContaining({ name: "5_rate_iter2", rating: 8.2 }));
  });

  it("summarizes nested source artifacts from generated and imported article workspaces", () => {
    expect(
      summarizeSourceRecord({
        directQuotes: [{ speaker: "Elder Guardian", quote: "I will tell no one." }],
        statistics: [{ stat: "Elevation", value: "6,638m", source: "Geographic data" }],
        research: [{ source: "Dr. Ernst Muldashev", finding: "Human gene pool theory" }],
        webResearch: {
          sources: ["https://example.com/source-a"],
          findings: [{ title: "Background source", source: "Example Research" }],
        },
        powerExamples: [{ scenario: "Conflict at scale", details: "A concrete example." }],
      })
    ).toEqual(
      expect.objectContaining({
        evidenceCount: 6,
        sourceSummary: expect.stringContaining("Elder Guardian"),
      })
    );

    expect(
      summarizeSourceRecord([
        {
          type: "toggle",
          toggle: { rich_text: [{ plain_text: "v1 9.6" }] },
        },
      ])
    ).toEqual(
      expect.objectContaining({
        evidenceCount: 1,
        sourceSummary: "v1 9.6",
      })
    );
  });

  it("turns framework eval checks into visible rating feedback", () => {
    const summary = summarizeFrameworkEvalRecord({
      score: 102,
      maxScore: 110,
      iterationCount: 1,
      status: "publishable_with_source_review",
      checks: [
        { id: "direct_answer", status: "pass", notes: "Snippet-ready." },
        { id: "source_review", status: "warn", notes: "Verify the newest SH0ES details before publishing." },
      ],
    });

    expect(summary).toEqual(
      expect.objectContaining({
        rating: 102,
        ratingMax: 110,
        iterations: 1,
        feedbackSummary: "Publishable with source review. 1/2 checks passed. 1 needs review",
        biggestProblem: "Verify the newest SH0ES details before publishing.",
        improvementSummary: "Source review: Verify the newest SH0ES details before publishing.",
        evaluatorScores: [{ label: "Framework", score: 102, maxScore: 110 }],
      })
    );
    expect(summary.phaseLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "source review", status: "warn" }),
      ])
    );
  });
});
