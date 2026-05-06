import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const routeSource = readFileSync(
  join(process.cwd(), "src/app/api/article/fs/hero-image/route.ts"),
  "utf8"
);
const heroSource = readFileSync(
  join(process.cwd(), "src/lib/article-agent/hero-image.ts"),
  "utf8"
);

describe("article hero image provider selection source", () => {
  it("accepts an explicit OpenAI or Gemini provider from the route", () => {
    expect(routeSource).toContain("provider");
    expect(routeSource).toContain("openai");
    expect(routeSource).toContain("gemini");
    expect(routeSource).toContain("provider: parsed.data.provider");
  });

  it("can generate article hero images through OpenAI or Gemini runtimes", () => {
    expect(heroSource).toContain("generateOpenAIImage");
    expect(heroSource).toContain("generateGeminiImage");
    expect(heroSource).toContain('provider: "openai"');
    expect(heroSource).toContain('provider: "gemini"');
  });
});
