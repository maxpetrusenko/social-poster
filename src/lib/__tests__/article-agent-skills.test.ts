import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("article agent skills", () => {
  it("ships an anti AI slop skill in the loaded article skills directory", () => {
    const skill = readFileSync(join(process.cwd(), "article-agent/skills/anti-ai-slop.md"), "utf8");
    const system = readFileSync(join(process.cwd(), "article-agent/skills/article-generation-system.md"), "utf8");
    const prompt = readFileSync(join(process.cwd(), "article-agent/prompt.md"), "utf8");

    expect(skill).toContain("Anti AI Slop Article Skill");
    expect(skill).toContain("not X, but Y");
    expect(skill).toContain("one-sentence dramatic paragraphs");
    expect(skill).toContain("Directness: does it say the thing without announcing itself?");
    expect(skill).toContain("Specificity: are abstractions backed by concrete claims");
    expect(skill).toContain("This is an editorial accountability pass first and a voice cleanup pass second.");
    expect(skill).toContain("What would a skeptical expert object to?");
    expect(skill).toContain("Important factual claims need nearby support.");
    expect(skill).toContain("Match language strength to evidence strength.");
    expect(skill).toContain("The article must contain author judgment, not just clean summary.");
    expect(skill).toContain("AI may assist the workflow, but the author owns final judgment, sourcing, and wording.");
    expect(skill).toContain("If the FAQ repeats the article, replace it with a compact `What to remember` box.");
    expect(skill).toContain("If the block sounds like it could open any AI-generated explainer, rewrite it.");
    expect(skill).toContain("If the draft has a reading map, takeaway box, primary action, and conclusion, cut or merge at least one.");
    expect(skill).toContain("The bio must not undercut the article's trust posture.");
    expect(system).toContain("confirm the editorial spine, source proximity, proportional language, human judgment, and reader trust");
    expect(prompt).toContain("Anti-slop/editorial pass after rating and before final Medium export");
  });
});
