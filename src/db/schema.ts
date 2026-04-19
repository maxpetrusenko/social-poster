import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  fullName: text("full_name"),
  avatarUrl: text("avatar_url"),
  authProvider: text("auth_provider").notNull().default("magic_link"),
  providerUserId: text("provider_user_id"),
  lastWorkspaceId: text("last_workspace_id"),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  defaultTimezone: text("default_timezone").notNull().default("UTC"),
  deletionRequestedAt: integer("deletion_requested_at", { mode: "timestamp" }),
  deletionScheduledFor: integer("deletion_scheduled_for", { mode: "timestamp" }),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description").notNull().default(""),
  timezone: text("timezone").notNull().default(""),
  iconUrl: text("icon_url"),
  primaryColor: text("primary_color").notNull().default(""),
  secondaryColor: text("secondary_color").notNull().default(""),
  defaultHashtags: text("default_hashtags", { mode: "json" }).$type<string[]>(),
  defaultFirstComment: text("default_first_comment").notNull().default(""),
  approvalWorkflowMode: text("approval_workflow_mode").notNull().default("none"),
  isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const orgMemberships = sqliteTable("org_memberships", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  orgRole: text("org_role").notNull().default("member"),
  invitedAt: integer("invited_at", { mode: "timestamp" }).notNull(),
  acceptedAt: integer("accepted_at", { mode: "timestamp" }),
});

export const workspaceMemberships = sqliteTable("workspace_memberships", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  workspaceRole: text("workspace_role").notNull().default("viewer"),
  addedAt: integer("added_at", { mode: "timestamp" }).notNull(),
});

export const workspaceInvitations = sqliteTable("workspace_invitations", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  orgRole: text("org_role").notNull().default("member"),
  workspaceAssignments: text("workspace_assignments", { mode: "json" }).$type<
    Array<{ workspaceId: string; role: string }>
  >(),
  invitedByUserId: text("invited_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  acceptedAt: integer("accepted_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  workspaceId: text("workspace_id").references(() => workspaces.id, {
    onDelete: "set null",
  }),
  actorUserId: text("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  actorEmail: text("actor_email"),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

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
  workspaceId: text("workspace_id").references(() => workspaces.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(), // "X (Main)", "LinkedIn", etc.
  type: text("type").notNull(), // see PLATFORM_TYPES in src/lib/platforms.ts
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
  workspaceId: text("workspace_id").references(() => workspaces.id, {
    onDelete: "set null",
  }),
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
  workspaceId: text("workspace_id")
    .references(() => workspaces.id, { onDelete: "set null" }),
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
  workspaceId: text("workspace_id")
    .references(() => workspaces.id, { onDelete: "set null" }),
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
  workspaceId: text("workspace_id")
    .references(() => workspaces.id, { onDelete: "set null" }),
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

// ── Reply Events ──────────────────────────────────────────────────────
export const replyEvents = sqliteTable("reply_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .references(() => workspaces.id, { onDelete: "set null" }),
  runId: text("run_id").references(() => pipelineRuns.id, { onDelete: "set null" }),
  scheduleId: text("schedule_id").references(() => schedules.id, { onDelete: "set null" }),
  platformId: text("platform_id").references(() => platforms.id, { onDelete: "set null" }),
  tweetUrl: text("tweet_url").notNull(),
  replyUrl: text("reply_url"),
  authorHandle: text("author_handle").notNull(),
  category: text("category"),
  lane: text("lane").notNull(),
  replyText: text("reply_text"),
  status: text("status").notNull().default("sent"), // "sent" | "failed" | "skipped"
  error: text("error"),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const replyCandidates = sqliteTable("reply_candidates", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .references(() => workspaces.id, { onDelete: "set null" }),
  platformId: text("platform_id").references(() => platforms.id, { onDelete: "set null" }),
  tweetId: text("tweet_id").notNull(),
  tweetUrl: text("tweet_url").notNull().unique(),
  replyUrl: text("reply_url"),
  authorHandle: text("author_handle").notNull(),
  authorName: text("author_name"),
  tweetText: text("tweet_text").notNull(),
  hook: text("hook"),
  status: text("status").notNull().default("drafted"),
  riskLevel: text("risk_level").notNull().default("low"),
  score: integer("score").notNull().default(0),
  repliesScraped: integer("replies_scraped").notNull().default(0),
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  popularReplies: text("popular_replies", { mode: "json" }).$type<
    Array<{ author: string; handle: string; text: string; likes: number }>
  >(),
  drafts: text("drafts", { mode: "json" }).$type<string[]>(),
  selectedDraftIndex: integer("selected_draft_index").notNull().default(0),
  postedAtLabel: text("posted_at_label"),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// ── Dedup Cache ───────────────────────────────────────────────────────
export const dedupCache = sqliteTable("dedup_cache", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  source: text("source"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ── Candidate Cache ───────────────────────────────────────────────────
export const candidateCache = sqliteTable("candidate_cache", {
  link: text("link").primaryKey(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  score: integer("score").notNull(),
  imageUrl: text("image_url"),
  ogImageUrl: text("og_image_url"),
  sourceName: text("source_name"),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  fetchedAt: integer("fetched_at", { mode: "timestamp" }).notNull(),
});

export const rssSources = sqliteTable("rss_sources", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  url: text("url").notNull(),
  weight: integer("weight").notNull().default(10),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const rssSettings = sqliteTable("rss_settings", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  candidateWindowHours: integer("candidate_window_hours").notNull().default(48),
  candidatePoolSize: integer("candidate_pool_size").notNull().default(24),
  minimumScore: integer("minimum_score").notNull().default(0),
  tractionWeight: integer("traction_weight").notNull().default(35),
  keywordBoostTerms: text("keyword_boost_terms", { mode: "json" }).$type<string[]>(),
  xTemplate: text("x_template").notNull(),
  linkedinTemplate: text("linkedin_template").notNull(),
  transformationPrompt: text("transformation_prompt").notNull(),
  imageSelectionMode: text("image_selection_mode").notNull().default("prefer_feed"),
  imageSelectionNotes: text("image_selection_notes").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
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
