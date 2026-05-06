import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { generateBlogAutomationPost } from "@/lib/blog/automation";
import { loadArticleAgentSettings } from "@/lib/article-agent/config";
import {
  buildArticleGenerationPromptPrefix,
  getActiveArticleGenerationOptions,
  normalizeArticleGenerationSettings,
} from "@/lib/article-agent/options";

const bodySchema = z.object({
  prompt: z.string().trim().min(4).max(4000).optional(),
  topic: z.string().trim().min(4).max(4000).optional(),
  url: z.string().url().optional(),
  sourceUrls: z.array(z.string().url()).max(12).optional(),
  targetWords: z.number().int().min(800).max(5000).optional(),
  generationSettings: z.unknown().optional(),
});

export async function POST(request: Request) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid article request" },
      { status: 400 }
    );
  }

  const prompt = parsed.data.prompt ?? parsed.data.topic ?? "";
  if (!prompt.trim()) {
    return NextResponse.json({ error: "Prompt or topic is required" }, { status: 400 });
  }

  const settings = await loadArticleAgentSettings();
  const generationSettings = normalizeArticleGenerationSettings(
    parsed.data.generationSettings && typeof parsed.data.generationSettings === "object"
      ? (parsed.data.generationSettings as Parameters<typeof normalizeArticleGenerationSettings>[0])
      : settings.generation
  );
  const generationOptions = getActiveArticleGenerationOptions(generationSettings);
  const generationPrefix = buildArticleGenerationPromptPrefix(generationOptions);
  const sourceUrls = normalizeSourceUrls(prompt, parsed.data.url, parsed.data.sourceUrls);
  const heroImageProvider = generationOptions.imageModel === "openai" ? "openai" : "gemini";
  const shouldGenerateHeroImage =
    generationOptions.heroImageMode !== "none" &&
    generationOptions.imageModel !== "none" &&
    generationOptions.imageModel !== "existing";

  try {
    const result = await generateBlogAutomationPost({
      topic: prompt,
      targetWords: parsed.data.targetWords ?? generationOptions.targetWords ?? settings.defaults.targetWords,
      sourceUrls,
      generationDirectives: generationPrefix,
      createdByEmail: tenant.user.email,
      trigger: "manual",
      workspaceId: tenant.currentWorkspace.id,
      generateHeroImage: shouldGenerateHeroImage,
      heroImageProvider,
    });

    return NextResponse.json(
      {
        articleId: result.postId,
        id: result.postId,
        slug: result.slug,
        validation: result.validation,
        provider: result.provider,
        links: {
          dashboard: result.articleWorkspace
            ? `/dashboard/articles?open=${encodeURIComponent(result.articleWorkspace.openRef)}`
            : `/dashboard/articles/${result.postId}`,
          api: `/api/article/${result.postId}`,
        },
        articleWorkspace: result.articleWorkspace ?? null,
        heroImageError: result.heroImageError ?? null,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Article generation failed" },
      { status: 500 }
    );
  }
}

function normalizeSourceUrls(prompt: string, url?: string, sourceUrls?: string[]) {
  const urls = new Set<string>();
  if (url) urls.add(url);
  for (const sourceUrl of sourceUrls ?? []) urls.add(sourceUrl);
  for (const match of prompt.match(/https?:\/\/[^\s)]+/g) ?? []) {
    try {
      urls.add(new URL(match).toString());
    } catch {
      // Ignore loose pasted text that only looks like a URL fragment.
    }
  }
  return Array.from(urls).slice(0, 12);
}
