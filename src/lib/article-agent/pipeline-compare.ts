import { readFile } from "node:fs/promises";
import type { FingerprintCompare } from "@/lib/article-agent/pipeline-compare-types";
import { resolveArticleWorkspaceArticlePath } from "@/lib/article-agent/workspace";

export * from "@/lib/article-agent/pipeline-compare-types";

export type PipelineCompare = {
  slug: string;
  title: string;
  finalMarkdown: string;
  compare: FingerprintCompare | { error: string };
};

async function readText(slug: string, relativePath: string) {
  const absolutePath = resolveArticleWorkspaceArticlePath(slug, relativePath);
  if (!absolutePath) return null;
  return readFile(absolutePath, "utf8").catch(() => null);
}

/** Reads the BEFORE/AFTER sidecar the package importer wrote. Null when the slug has no sidecar. Never writes. */
export async function readPipelineCompare(slug: string): Promise<PipelineCompare | null> {
  const raw = await readText(slug, "compare/fingerprint.json");
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const manifestRaw = await readText(slug, "import-manifest.json");
  let title = slug;
  if (manifestRaw) {
    try {
      const manifest = JSON.parse(manifestRaw) as { title?: unknown };
      if (typeof manifest.title === "string" && manifest.title.trim()) title = manifest.title.trim();
    } catch {
      // keep the slug as the title
    }
  }
  const finalMarkdown = (await readText(slug, "v004/article.md")) ?? "";
  const heading = finalMarkdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) title = heading;

  const record = parsed as Record<string, unknown>;
  if (typeof record.error === "string") return { slug, title, finalMarkdown, compare: { error: record.error } };
  if (record.schema !== 1 || !record.stages || !record.diffs) return null;
  return { slug, title, finalMarkdown, compare: parsed as FingerprintCompare };
}
