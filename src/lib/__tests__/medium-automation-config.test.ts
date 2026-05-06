import { afterEach, describe, expect, it, vi } from "vitest";
import { generateBlogDraftWithMediumAutomation } from "@/lib/blog/medium-automation";

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
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
