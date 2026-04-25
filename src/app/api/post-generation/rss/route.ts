import { NextRequest, NextResponse } from "next/server";

import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { getDashboardCandidates } from "@/lib/dashboard/candidates";
import { writePostCaption } from "@/lib/pipeline/script-writer";
import { getWorkspaceRssSettings } from "@/lib/rss-config";

export async function POST(request: NextRequest) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  try {
    const body = await request.json().catch(() => ({}));
    const platformTypes = Array.isArray(body.platformTypes)
      ? body.platformTypes.filter((value: unknown): value is string => typeof value === "string")
      : [];
    const workspaceId = tenant.currentWorkspace.id;
    const settings = await getWorkspaceRssSettings(workspaceId);
    const stories = await getDashboardCandidates(6, workspaceId);

    const story = stories[0];
    if (!story) {
      return NextResponse.json({ error: "No eligible RSS candidates found." }, { status: 404 });
    }

    const platformType = chooseCaptionPlatform(platformTypes);
    const content = writePostCaption(story, platformType, {
      xTemplate: settings.xTemplate,
      linkedinTemplate: settings.linkedinTemplate,
      transformationPrompt: settings.transformationPrompt,
    });
    const imageUrl = story.ogImageUrl ?? story.imageUrl ?? null;

    return NextResponse.json({
      source: "rss",
      sourceUrl: story.link,
      title: story.title,
      summary: story.summary,
      content,
      imageUrl,
      candidates: stories.map((candidate) => ({
        title: candidate.title,
        link: candidate.link,
        summary: candidate.summary,
        score: candidate.score,
        sourceName: candidate.sourceName,
        publishedAt: candidate.publishedAt,
        content: writePostCaption(candidate, platformType, {
          xTemplate: settings.xTemplate,
          linkedinTemplate: settings.linkedinTemplate,
          transformationPrompt: settings.transformationPrompt,
        }),
        imageUrl: candidate.ogImageUrl ?? candidate.imageUrl ?? null,
      })),
    });
  } catch (error) {
    console.error("[post-generation:rss] failed:", error);
    return NextResponse.json({ error: "Could not generate a post from RSS." }, { status: 500 });
  }
}

function chooseCaptionPlatform(platformTypes: string[]) {
  const normalized = platformTypes.map((value) => value.toLowerCase());
  if (normalized.some((value) => value.includes("linkedin"))) return "linkedin";
  if (normalized.includes("instagram") || normalized.includes("instagram_personal")) return "instagram";
  if (normalized.includes("facebook")) return "facebook";
  return "x";
}
