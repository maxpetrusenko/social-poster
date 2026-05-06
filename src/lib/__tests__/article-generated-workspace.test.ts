import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveGeneratedArticleToWorkspace } from "@/lib/article-agent/generated-workspace";

vi.mock("server-only", () => ({}));

const originalWorkspaceDir = process.env.ARTICLE_WORKSPACE_DIR;
let workspaceDir: string | null = null;

afterEach(async () => {
  process.env.ARTICLE_WORKSPACE_DIR = originalWorkspaceDir;
  if (workspaceDir) await rm(workspaceDir, { recursive: true, force: true });
  workspaceDir = null;
});

describe("generated article workspace package", () => {
  it("saves New Article output into the filesystem workspace as the canonical open path", async () => {
    workspaceDir = await mkdtemp(path.join(tmpdir(), "article-workspace-"));
    process.env.ARTICLE_WORKSPACE_DIR = workspaceDir;

    const result = await saveGeneratedArticleToWorkspace({
      preferredSlug: "webb-test",
      provider: "medium-automation",
      postId: "post-1",
      sourceUrls: ["https://example.com/source"],
      createdByEmail: "max@example.com",
      generatedAt: new Date("2026-05-06T20:00:00.000Z"),
      validation: {
        status: "pass",
        score: 99,
        checks: [{ key: "sources", label: "Sources", status: "pass", detail: "ok" }],
      },
      draft: {
        topic: "Webb",
        title: "Webb Test",
        excerpt: "A test article.",
        category: "Science",
        directAnswer: "Direct answer.",
        thesis: "Thesis.",
        contentMarkdown: "# Webb Test\n\n> Direct answer.\n",
        heroImageUrl: "https://example.com/hero.jpg",
        heroImageAlt: "Hero",
        sources: [{ title: "Source", url: "https://example.com/source" }],
        targetWords: 1200,
      },
    });

    expect(result.openRef).toBe("articles:webb-test%2Farticle-v1.md");
    expect(result.articleRelativePath).toBe("webb-test/article-v1.md");

    const article = await readFile(path.join(workspaceDir, "articles", "webb-test", "article-v1.md"), "utf8");
    const version = JSON.parse(await readFile(path.join(workspaceDir, "articles", "webb-test", "version.json"), "utf8"));
    const workflow = JSON.parse(await readFile(path.join(workspaceDir, "articles", "webb-test", "workflow.json"), "utf8"));

    expect(article).toContain("# Webb Test");
    expect(version.databasePostId).toBe("post-1");
    expect(version.frameworkScore).toBe(99);
    expect(workflow.phases.map((phase: { name: string }) => phase.name)).toContain("1_generate_article_button");
  });
});
