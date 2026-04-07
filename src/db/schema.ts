import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ── Auth ──────────────────────────────────────────────────────────────
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const magicLinks = sqliteTable("magic_links", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ── Platforms ─────────────────────────────────────────────────────────
// Each connected social account (X, LinkedIn, TikTok, IG, etc.)
export const platforms = sqliteTable("platforms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(), // "X (Main)", "LinkedIn", etc.
  type: text("type").notNull(), // "twitter" | "linkedin" | "instagram" | "tiktok" | "facebook" | "reddit" | "youtube"
  handle: text("handle"), // @maxpetrusenko
  accountId: text("account_id"), // Zernio account ID
  provider: text("provider").notNull().default("zernio"), // "zernio" | "bird" | "direct"
  config: text("config", { mode: "json" }).$type<Record<string, unknown>>(), // provider-specific config
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// ── Social Profile ────────────────────────────────────────────────────
// Your brand identity / voice settings
export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(), // "Max Petrusenko" or "AI News Bot"
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  voiceId: text("voice_id"), // Cartesia voice ID
  faceId: text("face_id"), // Simli face ID
  tone: text("tone"), // "professional", "casual", "technical"
  config: text("config", { mode: "json" }).$type<Record<string, unknown>>(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// ── Posts ──────────────────────────────────────────────────────────────
export const posts = sqliteTable("posts", {
  id: text("id").primaryKey(),
  profileId: text("profile_id").references(() => profiles.id),
  title: text("title"),
  content: text("content").notNull(),
  contentType: text("content_type").notNull().default("text"), // "text" | "image" | "video" | "avatar_video"
  mediaUrl: text("media_url"),
  sourceUrl: text("source_url"), // news article URL
  sourceTitle: text("source_title"),
  status: text("status").notNull().default("draft"), // "draft" | "scheduled" | "publishing" | "published" | "failed"
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  dedupKey: text("dedup_key"),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// ── Post Targets ──────────────────────────────────────────────────────
// Many-to-many: which platforms a post goes to + per-platform status
export const postTargets = sqliteTable("post_targets", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  platformId: text("platform_id").notNull().references(() => platforms.id),
  status: text("status").notNull().default("pending"), // "pending" | "publishing" | "published" | "failed" | "skipped"
  publishedUrl: text("published_url"),
  platformPostId: text("platform_post_id"),
  error: text("error"),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ── Schedule (cron jobs config) ───────────────────────────────────────
export const schedules = sqliteTable("schedules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  cron: text("cron").notNull(), // "0 9 * * *"
  cronHuman: text("cron_human"), // "Every day at 9 AM ET"
  jobType: text("job_type").notNull(), // "avatar_video" | "image_post" | "text_post"
  profileId: text("profile_id").references(() => profiles.id),
  targetPlatformIds: text("target_platform_ids", { mode: "json" }).$type<string[]>(), // platform IDs to post to
  config: text("config", { mode: "json" }).$type<Record<string, unknown>>(), // job-specific config
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// ── Pipeline Runs ─────────────────────────────────────────────────────
export const pipelineRuns = sqliteTable("pipeline_runs", {
  id: text("id").primaryKey(),
  scheduleId: text("schedule_id").references(() => schedules.id),
  postId: text("post_id").references(() => posts.id),
  trigger: text("trigger").notNull(), // "cron" | "manual" | "api"
  status: text("status").notNull().default("running"), // "running" | "completed" | "failed"
  steps: text("steps", { mode: "json" }).$type<PipelineStep[]>(),
  error: text("error"),
  durationMs: integer("duration_ms"),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

// ── Dedup Cache ───────────────────────────────────────────────────────
export const dedupCache = sqliteTable("dedup_cache", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  source: text("source"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ── Types ─────────────────────────────────────────────────────────────
export type PipelineStep = {
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  output?: unknown;
  error?: string;
};
