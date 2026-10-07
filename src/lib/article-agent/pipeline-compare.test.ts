import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { readPipelineCompare } from "@/lib/article-agent/pipeline-compare";

let workspace: string;
const previous = process.env.ARTICLE_WORKSPACE_DIR;

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), "pipeline-compare-"));
  process.env.ARTICLE_WORKSPACE_DIR = workspace;
});

afterEach(async () => {
  if (previous === undefined) delete process.env.ARTICLE_WORKSPACE_DIR;
  else process.env.ARTICLE_WORKSPACE_DIR = previous;
  await rm(workspace, { recursive: true, force: true });
});

async function writeArticle(slug: string, files: Record<string, string>) {
  for (const [rel, body] of Object.entries(files)) {
    const target = path.join(workspace, "articles", slug, rel);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  }
}

describe("readPipelineCompare", () => {
  it("returns null when the sidecar is missing", async () => {
    await writeArticle("a", { "v001/article.md": "# A\n" });
    expect(await readPipelineCompare("a")).toBeNull();
    expect(await readPipelineCompare("missing")).toBeNull();
  });

  it("rejects slugs that escape the workspace", async () => {
    expect(await readPipelineCompare("../a")).toBeNull();
    expect(await readPipelineCompare("a/b")).toBeNull();
  });

  it("returns the sidecar with the title from the final article", async () => {
    const sidecar = { schema: 1, package_sha: "x", stages: {}, bad_direction: {}, diffs: {}, edits: { kept: [], rejected: [] } };
    await writeArticle("a", {
      "compare/fingerprint.json": JSON.stringify(sidecar),
      "v004/article.md": "# The Real Title\n\nBody.\n",
    });
    const result = await readPipelineCompare("a");
    expect(result?.title).toBe("The Real Title");
    expect(result?.finalMarkdown).toContain("Body.");
    expect(result?.compare).toMatchObject({ schema: 1 });
  });

  it("surfaces a failed compare as an error and ignores a corrupt sidecar", async () => {
    await writeArticle("e", { "compare/fingerprint.json": JSON.stringify({ error: "boom" }) });
    expect((await readPipelineCompare("e"))?.compare).toEqual({ error: "boom" });
    await writeArticle("c", { "compare/fingerprint.json": "{not json" });
    expect(await readPipelineCompare("c")).toBeNull();
  });
});
