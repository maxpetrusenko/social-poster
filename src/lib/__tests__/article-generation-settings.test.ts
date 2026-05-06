import { describe, expect, it } from "vitest";
import {
  buildArticleGenerationDirectives,
  buildArticleGenerationPromptPrefix,
  getActiveArticleGenerationOptions,
  normalizeArticleGenerationSettings,
} from "@/lib/article-agent/options";

describe("article generation settings", () => {
  it("normalizes default quick controls and converts character length to backend words", () => {
    const settings = normalizeArticleGenerationSettings({
      defaults: { targetChars: 12_000, format: "source-of-truth", research: false },
    });

    expect(settings.defaults.targetWords).toBe(2000);
    expect(settings.defaults.format).toBe("source-of-truth");
    expect(settings.defaults.research).toBe(false);
    expect(settings.controls.filter((control) => control.quick).map((control) => control.id)).toEqual([
      "length",
      "research",
      "sources",
      "heroImage",
      "format",
    ]);
  });

  it("preserves user-added custom menu controls instead of dropping them", () => {
    const settings = normalizeArticleGenerationSettings({
      controls: [
        { id: "angle", label: "Article angle", enabled: true, quick: false, kind: "text", value: "anti-hype" },
      ],
    });

    expect(settings.controls.some((control) => control.id === "angle")).toBe(true);
    expect(settings.controls.find((control) => control.id === "angle")?.value).toBe("anti-hype");
  });

  it("builds prompt-pack compatible directives for the generation backend", () => {
    const settings = normalizeArticleGenerationSettings({
      defaults: {
        targetChars: 9000,
        research: false,
        includeSources: true,
        heroImageMode: "none",
        footer: false,
        quality: "fast",
        writerProvider: "openai",
        format: "builder-guide",
      },
    });

    const options = getActiveArticleGenerationOptions(settings);
    const directives = buildArticleGenerationDirectives(options);
    const prefix = buildArticleGenerationPromptPrefix(options);

    expect(options.targetWords).toBe(1500);
    expect(directives).toContain("[length: 1500]");
    expect(directives).toContain("[research: false]");
    expect(directives).toContain("[sources: true]");
    expect(directives).toContain("[images: false]");
    expect(directives).toContain("[footer: false]");
    expect(directives).toContain("[iterations: 1]");
    expect(directives).toContain("[provider: openai]");
    expect(prefix).toContain("Format preset: Practical builder guide");
    expect(prefix).toContain("Hero image: none");
  });
});
