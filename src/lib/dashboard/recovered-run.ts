import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { pipelineRuns, platforms, schedules } from "@/db/schema";
import { deriveCalendarRunDetails } from "./calendar-run-details";
import { normalizePlatformType } from "./platforms";

export async function getRecoveredRunContext(runId: string, workspaceId: string) {
  const run = await db.query.pipelineRuns.findFirst({
    where: and(
      eq(pipelineRuns.id, runId),
      eq(pipelineRuns.workspaceId, workspaceId)
    ),
  });

  if (!run) {
    throw new Error("Run not found");
  }

  const schedule = run.scheduleId
    ? await db.query.schedules.findFirst({
        where: and(
          eq(schedules.id, run.scheduleId),
          eq(schedules.workspaceId, workspaceId)
        ),
      })
    : null;

  const targetPlatforms =
    schedule?.targetPlatformIds?.length
      ? await db.query.platforms.findMany({
          where: inArray(platforms.id, schedule.targetPlatformIds),
        })
      : [];

  const details = deriveCalendarRunDetails(run, targetPlatforms);
  if (!details.content) {
    throw new Error("Run does not have recoverable content yet.");
  }

  const platformDetailsByType = new Map(
    details.platforms.map((platform) => [normalizePlatformType(platform.type), platform])
  );

  const recoveredTargets = targetPlatforms.map((platform) => {
    const platformKey = normalizePlatformType(platform.type);
    const platformDetails = platformDetailsByType.get(platformKey);
    const mediaUrl = platformDetails?.mediaUrl ?? details.mediaUrl ?? undefined;
    const resolvedContentType = platformDetails?.contentType ?? details.contentType;

    return {
      platform,
      content: platformDetails?.content ?? details.content!,
      mediaUrl,
      mediaType: mediaUrl
        ? resolvedContentType === "video" || resolvedContentType === "avatar_video"
          ? ("video" as const)
          : ("image" as const)
        : undefined,
      instagramContentType:
        platform.type === "instagram"
          ? platformDetails?.explicitInstagramType ??
            (resolvedContentType === "video" || resolvedContentType === "avatar_video"
              ? "reel"
              : undefined)
          : undefined,
    };
  });

  return {
    run,
    schedule,
    targetPlatforms,
    details,
    recoveredTargets,
  };
}
