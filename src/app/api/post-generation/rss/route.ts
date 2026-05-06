import { NextRequest, NextResponse } from "next/server";

import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { getDashboardCandidates } from "@/lib/dashboard/candidates";
import { draftHumanPostContent } from "@/lib/pipeline/human-post-writer";
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
    const drafts = await draftHumanPostContent(
      story,
      [platformType],
      { workspaceId, rssSettings: settings }
    );
    const content = resolveDraftForPlatform(drafts.contentByPlatform, platformType);
    const imageUrl = story.ogImageUrl ?? story.imageUrl ?? null;
    const candidateDrafts = await mapWithConcurrency(stories, 3, async (candidate) => {
      const draft = await draftHumanPostContent(
        candidate,
        [platformType],
        { workspaceId, rssSettings: settings }
      );
      return {
        candidate,
        content: resolveDraftForPlatform(draft.contentByPlatform, platformType),
      };
    });

    return NextResponse.json({
      source: "rss",
      sourceUrl: story.link,
      title: story.title,
      summary: story.summary,
      content,
      imageUrl,
      candidates: candidateDrafts.map(({ candidate, content: candidateContent }) => ({
        title: candidate.title,
        link: candidate.link,
        summary: candidate.summary,
        score: candidate.score,
        sourceName: candidate.sourceName,
        publishedAt: candidate.publishedAt,
        content: candidateContent,
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

function resolveDraftForPlatform(
  drafts: Record<string, string>,
  platformType: string
) {
  const normalized =
    platformType === "x" || platformType === "twitter"
      ? "twitter"
      : platformType.toLowerCase().startsWith("linkedin")
        ? "linkedin"
      : platformType.toLowerCase();
  return drafts[normalized] ?? drafts[platformType] ?? "";
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await mapper(items[currentIndex] as T);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );

  return results;
}
