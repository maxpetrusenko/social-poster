import { describe, expect, it } from "vitest";

import { calculateTextSimilarity, shouldIncludeSourceLink } from "../x-liked-autopost-similarity";

describe("X liked autopost similarity", () => {
  describe("calculateTextSimilarity", () => {
    it("returns 1.0 for identical texts", () => {
      const text = "AI agents are transforming software development.";
      expect(calculateTextSimilarity(text, text)).toBe(1.0);
    });

    it("returns 1.0 for texts with only punctuation/case differences", () => {
      const text1 = "AI agents are transforming software development.";
      const text2 = "ai agents are transforming software development";
      expect(calculateTextSimilarity(text1, text2)).toBe(1.0);
    });

    it("ignores URLs when comparing", () => {
      const text1 = "Check this out https://example.com/article";
      const text2 = "Check this out https://different.com/page";
      expect(calculateTextSimilarity(text1, text2)).toBeGreaterThan(0.9);
    });

    it("returns high similarity for minor rewording", () => {
      const text1 = "AI agents are transforming software development.";
      const text2 = "AI agents are changing software development.";
      const similarity = calculateTextSimilarity(text1, text2);
      expect(similarity).toBeGreaterThan(0.7); // Word-level: 5 shared / 7 total words = 0.71
      expect(similarity).toBeLessThan(1.0);
    });

    it("returns lower similarity for substantial rewording", () => {
      const text1 = "AI agents are transforming software development.";
      const text2 = "machine learning models reshape how we build code.";
      const similarity = calculateTextSimilarity(text1, text2);
      expect(similarity).toBeLessThan(0.7); // Word-level similarity is higher than character-level
    });

    it("returns 0.0 for completely different texts", () => {
      const text1 = "AI agents transform development.";
      const text2 = "xyz qwerty";
      const similarity = calculateTextSimilarity(text1, text2);
      expect(similarity).toBeLessThan(0.3);
    });

    it("handles empty strings", () => {
      expect(calculateTextSimilarity("", "anything")).toBe(0.0);
      expect(calculateTextSimilarity("anything", "")).toBe(0.0);
      expect(calculateTextSimilarity("", "")).toBe(1.0); // Both empty = identical
    });
  });

  describe("shouldIncludeSourceLink", () => {
    it("returns false when texts are almost identical (above 0.75 threshold)", () => {
      const source = "AI just made the answer key free.";
      const repost = "AI just made the answer key free";
      expect(shouldIncludeSourceLink(repost, source)).toBe(false);
    });

    it("returns false for very minor rewording (still above threshold)", () => {
      const source = "AI agents are transforming software development rapidly.";
      const repost = "AI agents are transforming software development quickly.";
      // 6/7 words shared = 0.857 > 0.75 threshold
      expect(shouldIncludeSourceLink(repost, source)).toBe(false);
    });

    it("returns true when texts meaningfully differ (below threshold)", () => {
      const source = "I shipped a 0.7nm chip compiler in 48 hours using Claude.";
      const repost = "compiler work shifted toward automated toolchains over the past year.";
      expect(shouldIncludeSourceLink(repost, source)).toBe(true);
    });

    it("returns true for substantial rewording", () => {
      const source = "AI agents are transforming software development faster than expected.";
      const repost = "machine learning is reshaping how engineers build applications.";
      expect(shouldIncludeSourceLink(repost, source)).toBe(true);
    });

    it("ignores URLs in similarity calculation", () => {
      const source = "Check this insight https://x.com/founder/status/123";
      const repost = "Check this insight https://different.url/article";
      // URLs ignored, text is identical
      expect(shouldIncludeSourceLink(repost, source)).toBe(false);
    });

    it("allows custom threshold", () => {
      const source = "AI agents are building better tools.";
      const repost = "AI agents are creating better tools.";
      
      // With strict threshold (0.90), should include link (similarity 5/6 = 0.83 < 0.90)
      expect(shouldIncludeSourceLink(repost, source, 0.90)).toBe(true);
      
      // With loose threshold (0.50), should not include link (similarity 0.83 > 0.50)
      expect(shouldIncludeSourceLink(repost, source, 0.50)).toBe(false);
    });

    it("handles long posts with many details preserved", () => {
      const source = `Researchers proved that AI will cause something worse than unemployment.
They call it the Tragedy of the Cognitive Commons.
Junior employees build mastery through struggle.
But AI is annihilating junior-level work.`;

      const repost = `researchers proved ai causes something worse than unemployment.
they call it the tragedy of the cognitive commons.
junior employees build mastery through struggle.
but ai is annihilating junior work now.`;

      // Very similar (just case/punctuation + minor word changes) - should NOT include link
      expect(shouldIncludeSourceLink(repost, source)).toBe(false);
    });

    it("includes link when content is shortened significantly", () => {
      const source = `Researchers proved that AI will cause something worse than unemployment.
They call it the Tragedy of the Cognitive Commons.
Every industry relies on shared professional expertise.
Junior employees build mastery through struggle.
But AI is annihilating junior-level work.`;

      const repost = `researchers proved ai causes cognitive commons tragedy.
junior employees build mastery through struggle but ai eliminates that path.`;

      // Significantly shortened/rewritten - should include link
      expect(shouldIncludeSourceLink(repost, source)).toBe(true);
    });
  });
});
