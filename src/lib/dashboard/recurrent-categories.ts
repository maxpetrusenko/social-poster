import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { platforms, schedules } from "@/db/schema";
import { getPlatformLabel, normalizePlatformType } from "@/lib/dashboard/platforms";
import { resolveFixedScheduleContent } from "@/lib/pipeline/fixed-schedule-post";
import { getPostCategoryMeta, POST_CATEGORIES } from "@/lib/post-categories";
import { getAppTimeZone } from "@/lib/timezone";

type ScheduleRow = typeof schedules.$inferSelect;
type PlatformRow = typeof platforms.$inferSelect;

export type RecurrentCategorySummary = {
  value: string;
  label: string;
  description: string;
  cadenceHint: string;
  accent: string;
  surface: string;
  scheduleCount: number;
  liveScheduleCount: number;
  rotationCount: number;
  primaryScheduleId: string | null;
  primaryScheduleName: string | null;
  quickAddPlatforms: Array<{
    type: string;
    label: string;
    handle: string | null;
  }>;
};

export type RecurrentRotationEntry = {
  id: string;
  scheduleId: string;
  scheduleName: string;
  variantIndex: number;
  title: string;
  summary: string;
  preview: string | null;
  platforms: Array<{
    type: string;
    label: string;
    handle: string | null;
    content: string | null;
    mediaUrl: string | null;
    instagramContentType: "story" | "reel" | null;
  }>;
};

export type RecurrentCategoryDetail = {
  category: RecurrentCategorySummary;
  entries: RecurrentRotationEntry[];
  schedules: Array<{
    id: string;
    name: string;
    cron: string;
    cronHuman: string | null;
    enabled: boolean;
  }>;
};

const CATEGORY_ACCENTS: Record<string, string> = {
  opinion_take: "#2f9fb5",
  product_update: "#3f8cff",
  source_share: "#ef6a67",
  hype_future: "#8a69d8",
  hiring_signal: "#d28a1d",
};

const CATEGORY_SURFACES: Record<string, string> = {
  opinion_take: "#d9f4f4",
  product_update: "#e1ebff",
  source_share: "#ffe1df",
  hype_future: "#ece0ff",
  hiring_signal: "#fff1cf",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizePlatformKey(value: string) {
  return normalizePlatformType(value) === "x" ? "twitter" : normalizePlatformType(value);
}

function shorten(value: string | null | undefined, max = 220) {
  if (!value) return null;
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function getVariantCount(config: Record<string, unknown> | null | undefined) {
  if (!isObject(config)) return 0;

  const counts: number[] = [];
  if (Array.isArray(config.contentVariants)) {
    counts.push(config.contentVariants.filter((item) => typeof item === "string" && item.trim()).length);
  }

  const byPlatform = isObject(config.contentVariantsByPlatform)
    ? config.contentVariantsByPlatform
    : null;
  if (byPlatform) {
    Object.values(byPlatform).forEach((value) => {
      if (Array.isArray(value)) {
        counts.push(value.filter((item) => typeof item === "string" && item.trim()).length);
      }
    });
  }

  const mediaByPlatform = isObject(config.mediaUrlVariantsByPlatform)
    ? config.mediaUrlVariantsByPlatform
    : null;
  if (mediaByPlatform) {
    Object.values(mediaByPlatform).forEach((value) => {
      if (Array.isArray(value)) {
        counts.push(value.filter((item) => typeof item === "string" && item.trim()).length);
      }
    });
  }

  const hasFixedFallback =
    config.postMode === "fixed" ||
    Boolean(pickString(config.content)) ||
    Boolean(pickString(config.title)) ||
    isObject(config.contentByPlatform);

  return Math.max(hasFixedFallback ? 1 : 0, ...counts, 0);
}

function buildVariantDate(config: Record<string, unknown> | null | undefined, index: number) {
  const base = pickString(config?.rotationAnchorDate)
    ? new Date(String(config?.rotationAnchorDate))
    : new Date();
  if (!Number.isFinite(base.getTime())) {
    return new Date();
  }
  if (config?.rotationMode === "calendar_week") {
    return new Date(base.getTime() + index * 7 * 24 * 60 * 60 * 1000);
  }
  return new Date(base.getTime() + index * 60 * 1000);
}

function targetPlatformsForSchedule(schedule: ScheduleRow, platformRows: PlatformRow[]) {
  return (schedule.targetPlatformIds ?? [])
    .map((platformId) => platformRows.find((platform) => platform.id === platformId))
    .filter((platform): platform is PlatformRow => Boolean(platform));
}

function buildRotationEntries(schedule: ScheduleRow, platformRows: PlatformRow[]) {
  const config = schedule.config;
  const targetPlatforms = targetPlatformsForSchedule(schedule, platformRows);
  const variantCount = getVariantCount(config);

  if (variantCount === 0) return [] as RecurrentRotationEntry[];

  const entries: RecurrentRotationEntry[] = [];

  for (let index = 0; index < variantCount; index += 1) {
    const fixedContent = resolveFixedScheduleContent(
      config,
      targetPlatforms.map((platform) => platform.type),
      index,
      buildVariantDate(config, index)
    );

    if (!fixedContent) {
      continue;
    }

    const platformsForEntry = targetPlatforms.map((platform) => {
      const key = normalizePlatformKey(platform.type);

      return {
        type: platform.type,
        label: getPlatformLabel(platform.type),
        handle: platform.handle,
        content: fixedContent.contentByPlatform[key] ?? null,
        mediaUrl: fixedContent.mediaUrlByPlatform[key] ?? null,
        instagramContentType:
          fixedContent.instagramContentTypeByPlatform[key] ?? null,
      };
    });

    const preview =
      platformsForEntry.map((platform) => shorten(platform.content, 180)).find(Boolean) ??
      shorten(fixedContent.summary, 180);

    entries.push({
      id: `${schedule.id}-${index}`,
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      variantIndex: index,
      title: fixedContent.title,
      summary: fixedContent.summary,
      preview,
      platforms: platformsForEntry,
    });
  }

  return entries;
}

async function getWorkspaceScheduleRows(workspaceId: string) {
  const [scheduleRows, platformRows] = await Promise.all([
    db
      .select()
      .from(schedules)
      .where(eq(schedules.workspaceId, workspaceId)),
    db
      .select()
      .from(platforms)
      .where(and(eq(platforms.workspaceId, workspaceId), eq(platforms.enabled, true))),
  ]);

  return { scheduleRows, platformRows };
}

export async function getRecurrentCategorySummaries(workspaceId: string) {
  const { scheduleRows, platformRows } = await getWorkspaceScheduleRows(workspaceId);

  return POST_CATEGORIES.map((category) => {
    const categorySchedules = scheduleRows.filter(
      (schedule) => schedule.config?.contentCategory === category.value
    );
    const fixedSchedules = categorySchedules.filter((schedule) =>
      buildRotationEntries(schedule, platformRows).length > 0
    );
    const primarySchedule = fixedSchedules[0] ?? categorySchedules[0] ?? null;

    return {
      value: category.value,
      label: category.label,
      description: category.description,
      cadenceHint: category.cadenceHint,
      accent: CATEGORY_ACCENTS[category.value] || "#7d8aa0",
      surface: CATEGORY_SURFACES[category.value] || "#eef2f7",
      scheduleCount: categorySchedules.length,
      liveScheduleCount: categorySchedules.filter((schedule) => schedule.enabled).length,
      rotationCount: fixedSchedules.reduce(
        (sum, schedule) => sum + buildRotationEntries(schedule, platformRows).length,
        0
      ),
      primaryScheduleId: primarySchedule?.id ?? null,
      primaryScheduleName: primarySchedule?.name ?? null,
      quickAddPlatforms: primarySchedule
        ? targetPlatformsForSchedule(primarySchedule, platformRows).map((platform) => ({
            type: platform.type,
            label: getPlatformLabel(platform.type),
            handle: platform.handle,
          }))
        : [],
    } satisfies RecurrentCategorySummary;
  });
}

export async function getRecurrentCategoryDetail(
  workspaceId: string,
  categoryValue: string
): Promise<RecurrentCategoryDetail | null> {
  const categoryMeta = getPostCategoryMeta(categoryValue);
  if (!categoryMeta) return null;

  const summaries = await getRecurrentCategorySummaries(workspaceId);
  const category = summaries.find((item) => item.value === categoryValue);
  if (!category) return null;

  const { scheduleRows, platformRows } = await getWorkspaceScheduleRows(workspaceId);
  const categorySchedules = scheduleRows.filter(
    (schedule) => schedule.config?.contentCategory === categoryValue
  );

  const entries = categorySchedules.flatMap((schedule) =>
    buildRotationEntries(schedule, platformRows)
  );

  return {
    category,
    entries,
    schedules: categorySchedules.map((schedule) => ({
      id: schedule.id,
      name: schedule.name,
      cron: schedule.cron,
      cronHuman: schedule.cronHuman,
      enabled: schedule.enabled,
    })),
  };
}

export function getRecurrentCategoryTimeZone() {
  return getAppTimeZone();
}
