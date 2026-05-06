import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { generateAndInsertArticleHeroImage } from "@/lib/article-agent/hero-image";

export const dynamic = "force-dynamic";

const HeroImageSchema = z.object({
  openRef: z.string().min(1).max(1200),
  provider: z.enum(["openai", "gemini"]).optional(),
  prompt: z.string().trim().max(2000).optional(),
});

export async function POST(request: Request) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  const parsed = HeroImageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid hero image request." }, { status: 400 });
  }

  try {
    const result = await generateAndInsertArticleHeroImage({
      workspaceId: tenant.currentWorkspace.id,
      openRef: parsed.data.openRef,
      provider: parsed.data.provider,
      prompt: parsed.data.prompt,
    });

    return NextResponse.json({
      ok: true,
      text: result.text,
      markdownImage: result.markdownImage,
      imageOpenRef: result.imageOpenRef,
      imageRelativePath: result.imageRelativePath,
      publicImageUrl: result.publicImageUrl,
      evalOpenRef: result.evalOpenRef,
      evalRelativePath: result.evalRelativePath,
      model: result.model,
      provider: result.provider,
      contentType: result.contentType,
      responseText: result.responseText,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Hero image generation failed." },
      { status: 500 }
    );
  }
}
