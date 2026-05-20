import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateBlogDraftWithMediumAutomation,
  normalizeMediumAutomationArticle,
} from "@/lib/blog/medium-automation";

vi.mock("server-only", () => ({}));

const originalApiUrl = process.env.MEDIUM_AUTOMATION_API_URL;
const originalApiKey = process.env.MEDIUM_AUTOMATION_API_KEY;

afterEach(() => {
  restoreEnv("MEDIUM_AUTOMATION_API_URL", originalApiUrl);
  restoreEnv("MEDIUM_AUTOMATION_API_KEY", originalApiKey);
});

describe("Medium automation article generation", () => {
  it("fails loudly when the Medium automation API is not configured", async () => {
    delete process.env.MEDIUM_AUTOMATION_API_URL;
    delete process.env.MEDIUM_AUTOMATION_API_KEY;

    await expect(
      generateBlogDraftWithMediumAutomation({
        topic: "https://www.youtube.com/watch?v=SVTPv4sI_Jc",
        targetWords: 1200,
        sourceUrls: ["https://www.youtube.com/watch?v=SVTPv4sI_Jc"],
      })
    ).rejects.toThrow("Medium automation is not configured");
  });

  it("normalizes wrapper output into clean Medium article markdown", () => {
    const markdown = normalizeMediumAutomationArticle(
      `1. A detailed summary of the topic

# Overwritten Title

Subtitle paragraph.

![agent](https://image.placeholder.com/800x400?text=Agent+Hero+Image)

Body before quote.

> A direct answer block that should move under the title before the subtitle.

## Section

Content.

***

2. Key facts and statistics

- Extra non-article material.

3. List of sources (URLs)

- https://example.com`,
      { preferredTitle: "Could the CIA Really Track Your Heartbeat From Kilometers Away?" }
    );

    expect(markdown.startsWith(
      "# Could the CIA Really Track Your Heartbeat From Kilometers Away?\n\n> A direct answer block"
    )).toBe(true);
    expect(markdown).not.toContain("A detailed summary");
    expect(markdown).not.toContain("image.placeholder.com");
    expect(markdown).not.toContain("Key facts and statistics");
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
