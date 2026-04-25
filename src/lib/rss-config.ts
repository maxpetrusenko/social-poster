import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { rssSettings, rssSources, schedules } from "@/db/schema";
import { getCronOccurrences } from "@/lib/dashboard/cron";
import { formatDateInZone, getAppTimeZone, getScheduleCronTimeZone } from "@/lib/timezone";

export type ImageSelectionMode =
  | "prefer_feed"
  | "prefer_open_graph"
  | "feed_only";

export type RssFeedSource = {
  id: string;
  workspaceId: string;
  name: string;
  url: string;
  weight: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type RssSettingsConfig = {
  candidateWindowHours: number;
  candidatePoolSize: number;
  minimumScore: number;
  tractionWeight: number;
  keywordBoostTerms: string[];
  xTemplate: string;
  linkedinTemplate: string;
  transformationPrompt: string;
  imageSelectionMode: ImageSelectionMode;
  imageSelectionNotes: string;
};

export const DEFAULT_RSS_FEEDS: Array<Pick<RssFeedSource, "name" | "url" | "weight" | "enabled">> = [
  { url: "https://news.ycombinator.com/rss", name: "HN", weight: 20, enabled: true },
  { url: "https://techcrunch.com/feed/", name: "TechCrunch", weight: 15, enabled: true },
  { url: "https://www.theverge.com/rss/index.xml", name: "The Verge", weight: 15, enabled: true },
  { url: "https://feeds.arstechnica.com/arstechnica/index", name: "Ars", weight: 12, enabled: true },
  { url: "https://www.wired.com/feed/rss", name: "Wired", weight: 12, enabled: true },
  { url: "https://blog.google/technology/ai/rss/", name: "Google AI", weight: 18, enabled: true },
  { url: "https://openai.com/blog/rss.xml", name: "OpenAI", weight: 18, enabled: true },
  { url: "https://www.anthropic.com/feed.xml", name: "Anthropic", weight: 18, enabled: true },
  { url: "https://ai.meta.com/blog/rss/", name: "Meta AI", weight: 16, enabled: true },
  { url: "https://www.reddit.com/r/MachineLearning/.rss", name: "r/ML", weight: 14, enabled: true },
  { url: "https://www.reddit.com/r/LocalLLaMA/.rss", name: "r/LocalLLaMA", weight: 14, enabled: true },
  { url: "https://www.reddit.com/r/artificial/.rss", name: "r/AI", weight: 12, enabled: true },
  { url: "https://huggingface.co/blog/feed.xml", name: "HuggingFace", weight: 16, enabled: true },
  { url: "https://lilianweng.github.io/index.xml", name: "Lilian Weng", weight: 14, enabled: true },
  { url: "https://simonwillison.net/atom/everything/", name: "Simon Willison", weight: 15, enabled: true },
  { url: "https://www.marktechpost.com/feed/", name: "MarkTechPost", weight: 10, enabled: true },
  { url: "https://www.kdnuggets.com/feed", name: "KDnuggets", weight: 10, enabled: true },
  { url: "https://blog.langchain.dev/rss/", name: "LangChain", weight: 14, enabled: true },
  { url: "https://www.infoq.com/ai-ml-data-eng/rss/", name: "InfoQ AI", weight: 12, enabled: true },
  { url: "https://syncedreview.com/feed/", name: "Synced", weight: 10, enabled: true },
  { url: "https://thenewstack.io/blog/feed/", name: "NewStack", weight: 10, enabled: true },
  { url: "https://spectrum.ieee.org/feeds/feed.rss", name: "IEEE", weight: 12, enabled: true },
  { url: "https://venturebeat.com/category/ai/feed/", name: "VentureBeat AI", weight: 12, enabled: true },
  { url: "https://www.deeplearning.ai/the-batch/feed/", name: "The Batch", weight: 14, enabled: true },
  { url: "https://bair.berkeley.edu/blog/feed.xml", name: "BAIR", weight: 14, enabled: true },
];

export const DEFAULT_RSS_SETTINGS: RssSettingsConfig = {
  candidateWindowHours: 48,
  candidatePoolSize: 24,
  minimumScore: 0,
  tractionWeight: 35,
  keywordBoostTerms: [],
  xTemplate: "{{title}}. {{whyMatters}}",
  linkedinTemplate:
    "{{title}}\n\n{{summarySentence}}\n\n{{whyMatters}}.",
  transformationPrompt: [
    "mode: source-faithful",
    "opener: none",
    "x: one concrete claim, then why it matters",
    "linkedin: claim, context, then why it matters",
    "ban_phrases: wild|pay attention|been waiting for this|interesting",
    "title_case_on_x: true",
  ].join("\n"),
  imageSelectionMode: "prefer_feed",
  imageSelectionNotes:
    "prefer feed image first. if the feed has no image, fall back to open graph. use feed_only when you want stricter source fidelity.",
};

const LEGACY_X_TEMPLATE = "{{reaction}} {{titleLower}}. {{insight}}";
const LEGACY_LINKEDIN_TEMPLATE =
  "{{reaction}} {{title}}.\n\n{{summarySentence}}\n\n{{whyMatters}}.";

function normalizeKeywordTerms(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function normalizeTemplate(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizePostTemplate(
  value: unknown,
  fallback: string,
  legacyTemplate: string
) {
  const template = normalizeTemplate(value, fallback);
  return template === legacyTemplate ? fallback : template;
}

function normalizeImageMode(value: unknown): ImageSelectionMode {
  if (
    value === "prefer_feed" ||
    value === "prefer_open_graph" ||
    value === "feed_only"
  ) {
    return value;
  }

  return DEFAULT_RSS_SETTINGS.imageSelectionMode;
}

export function normalizeRssSettingsInput(
  input: Partial<RssSettingsConfig>
): RssSettingsConfig {
  const candidateWindowHours = Number.isFinite(Number(input.candidateWindowHours))
    ? Math.min(168, Math.max(1, Number(input.candidateWindowHours)))
    : DEFAULT_RSS_SETTINGS.candidateWindowHours;
  const candidatePoolSize = Number.isFinite(Number(input.candidatePoolSize))
    ? Math.min(100, Math.max(1, Number(input.candidatePoolSize)))
    : DEFAULT_RSS_SETTINGS.candidatePoolSize;
  const minimumScore = Number.isFinite(Number(input.minimumScore))
    ? Math.max(0, Number(input.minimumScore))
    : DEFAULT_RSS_SETTINGS.minimumScore;
  const tractionWeight = Number.isFinite(Number(input.tractionWeight))
    ? Math.min(100, Math.max(0, Number(input.tractionWeight)))
    : DEFAULT_RSS_SETTINGS.tractionWeight;

  return {
    candidateWindowHours,
    candidatePoolSize,
    minimumScore,
    tractionWeight,
    keywordBoostTerms: normalizeKeywordTerms(input.keywordBoostTerms),
    xTemplate: normalizePostTemplate(
      input.xTemplate,
      DEFAULT_RSS_SETTINGS.xTemplate,
      LEGACY_X_TEMPLATE
    ),
    linkedinTemplate: normalizePostTemplate(
      input.linkedinTemplate,
      DEFAULT_RSS_SETTINGS.linkedinTemplate,
      LEGACY_LINKEDIN_TEMPLATE
    ),
    transformationPrompt: normalizeTemplate(
      input.transformationPrompt,
      DEFAULT_RSS_SETTINGS.transformationPrompt
    ),
    imageSelectionMode: normalizeImageMode(input.imageSelectionMode),
    imageSelectionNotes:
      typeof input.imageSelectionNotes === "string"
        ? input.imageSelectionNotes.trim()
        : DEFAULT_RSS_SETTINGS.imageSelectionNotes,
  };
}

export function normalizeRssFeedInput(
  workspaceId: string,
  input: Partial<Pick<RssFeedSource, "name" | "url" | "weight" | "enabled">>
) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const url = typeof input.url === "string" ? input.url.trim() : "";
  const weight = Number.isFinite(Number(input.weight))
    ? Math.min(100, Math.max(0, Number(input.weight)))
    : 10;

  if (!name) {
    throw new Error("Feed name is required.");
  }

  try {
    new URL(url);
  } catch {
    throw new Error("Feed URL must be valid.");
  }

  return {
    workspaceId,
    name,
    url,
    weight,
    enabled: input.enabled !== false,
  };
}

export async function getWorkspaceRssSources(
  workspaceId: string
): Promise<RssFeedSource[]> {
  return db
    .select()
    .from(rssSources)
    .where(eq(rssSources.workspaceId, workspaceId))
    .orderBy(desc(rssSources.enabled), desc(rssSources.weight), asc(rssSources.name));
}

export async function getWorkspaceRssSettings(
  workspaceId: string
): Promise<RssSettingsConfig> {
  const row = await db
    .select()
    .from(rssSettings)
    .where(eq(rssSettings.workspaceId, workspaceId))
    .get();

  if (!row) return DEFAULT_RSS_SETTINGS;

  return normalizeRssSettingsInput({
    candidateWindowHours: row.candidateWindowHours,
    candidatePoolSize: row.candidatePoolSize,
    minimumScore: row.minimumScore,
    tractionWeight: row.tractionWeight,
    keywordBoostTerms: row.keywordBoostTerms ?? [],
    xTemplate: row.xTemplate,
    linkedinTemplate: row.linkedinTemplate,
    transformationPrompt: row.transformationPrompt,
    imageSelectionMode: row.imageSelectionMode as ImageSelectionMode,
    imageSelectionNotes: row.imageSelectionNotes,
  });
}

export async function getFeedDrivenSchedules(workspaceId: string) {
  const rows = await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.workspaceId, workspaceId), eq(schedules.enabled, true)));

  return rows.filter((schedule) => isFeedDrivenSchedule(schedule.config, schedule.jobType));
}

export function isFeedDrivenSchedule(
  config: Record<string, unknown> | null | undefined,
  jobType: string
) {
  if (jobType === "reply_engine") return false;
  if (config?.postMode === "fixed") return false;
  if (config?.postMode === "agent_persona_updates") return false;
  return true;
}

export function getUpcomingScheduleLabels(schedule: {
  cron: string;
}, count = 3) {
  const end = new Date();
  end.setDate(end.getDate() + 120);
  const nextRuns = getCronOccurrences(
    schedule.cron,
    new Date(),
    end,
    count,
    getScheduleCronTimeZone()
  );

  return nextRuns.map((date) =>
    formatDateInZone(
      date,
      {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      },
      getAppTimeZone()
    )
  );
}
